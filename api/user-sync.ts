import { Buffer } from 'node:buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import {
  Dish,
  SyncedUserData,
  UserProfile,
  CloudSyncProvider,
  GroupMealRecord,
  DailyPlanRecord,
} from '../types';

type SyncRequestBody = {
  profile: UserProfile | null;
  dishes: Dish[];
  allUsers: UserProfile[];
  groupMeals?: GroupMealRecord[];
  dailyPlans?: DailyPlanRecord[];
  timeSavedMinutes?: number;
};

type StorageSelection = {
  mode: CloudSyncProvider | null;
  hint?: string;
};

type ProviderCheck = {
  available: boolean;
  hint?: string;
};

type WebdavConfig = {
  baseUrl: string;
  username: string;
  password: string;
  rootPath: string;
};

const KEY_PREFIX = process.env.MEAL_SYNC_PREFIX ?? 'meal-planner-sync';

let providerCache: { selection: StorageSelection; expiresAt: number } | null = null;

const hasKvEnv = () =>
  Boolean(
    process.env.KV_REST_API_URL &&
      (process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_WRITE_TOKEN || process.env.KV_URL)
  );

const rawWebdavConfig: WebdavConfig | null = (() => {
  const baseUrl = process.env.WEBDAV_BASE_URL;
  const username = process.env.WEBDAV_USERNAME;
  const password = process.env.WEBDAV_PASSWORD;
  if (!baseUrl || !username || !password) {
    return null;
  }
  return {
    baseUrl,
    username,
    password,
    rootPath: process.env.WEBDAV_ROOT_PATH ?? 'MealPlanner',
  };
})();

const sanitizedPrefix = sanitizeSegment(KEY_PREFIX, 'meal-planner-sync');

function sanitizeSegment(value: string, fallback: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function createKvKey(userId: string) {
  return `${KEY_PREFIX}:${userId}`;
}

function createWebdavPath(userId: string) {
  const sanitizedUser = sanitizeSegment(userId, 'user');
  return `${sanitizedPrefix}/${sanitizedUser}.json`;
}

function getUserId(req: VercelRequest): string | null {
  const raw = (req.query.userId || req.query.userID || req.query.userid) as string | string[] | undefined;
  if (!raw) {
    return null;
  }
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? null;
}

async function checkKvAvailability(): Promise<ProviderCheck> {
  if (!hasKvEnv()) {
    return { available: false, hint: 'Vercel KV environment variables are missing.' };
  }
  try {
    await kv.get('__kv_healthcheck__');
    return { available: true };
  } catch (error) {
    console.error('Vercel KV availability check failed:', error);
    return { available: false, hint: 'Unable to reach Vercel KV. Verify integration and tokens.' };
  }
}

function getWebdavConfig(): WebdavConfig | null {
  return rawWebdavConfig;
}

function buildWebdavAuth(config: WebdavConfig): string {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
}

function buildWebdavUrl(path: string, config: WebdavConfig): string {
  const base = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`;
  const root = config.rootPath.replace(/^\/+/g, '').replace(/\/+$/g, '');
  const relative = [root, path].filter(Boolean).join('/');
  return new URL(relative, base).toString();
}

async function checkWebdavAvailability(): Promise<ProviderCheck> {
  const config = getWebdavConfig();
  if (!config) {
    return { available: false, hint: 'WebDAV credentials are not configured.' };
  }

  try {
    const url = buildWebdavUrl(config.rootPath, config);
    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        Authorization: buildWebdavAuth(config),
        Depth: '0',
      },
    });
    if (response.status === 207 || response.ok) {
      return { available: true };
    }
    return { available: false, hint: `WebDAV responded with status ${response.status}.` };
  } catch (error) {
    console.error('WebDAV availability check failed:', error);
    return { available: false, hint: 'Unable to reach WebDAV endpoint. Check URL and credentials.' };
  }
}

async function ensureWebdavDirectory(filePath: string, config: WebdavConfig) {
  const segments = filePath.split('/').slice(0, -1).filter(Boolean);
  if (segments.length === 0) {
    return;
  }

  let current = '';
  for (const segment of segments) {
    current += `/${segment}`;
    const url = buildWebdavUrl(current, config);
    const response = await fetch(url, {
      method: 'MKCOL',
      headers: {
        Authorization: buildWebdavAuth(config),
      },
    });
    if ([201, 200, 301, 405, 409, 412].includes(response.status)) {
      continue;
    }
    if (!response.ok) {
      throw new Error(`WebDAV directory creation failed with status ${response.status}`);
    }
  }
}

async function readFromWebdav(filePath: string, config: WebdavConfig): Promise<SyncedUserData | null> {
  const url = buildWebdavUrl(filePath, config);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: buildWebdavAuth(config),
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`WebDAV read failed with status ${response.status}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as SyncedUserData;
  } catch (error) {
    console.error('Failed to parse WebDAV payload:', error);
    throw new Error('Stored WebDAV data is corrupted.');
  }
}

async function writeToWebdav(filePath: string, config: WebdavConfig, payload: SyncedUserData) {
  await ensureWebdavDirectory(filePath, config);
  const url = buildWebdavUrl(filePath, config);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: buildWebdavAuth(config),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`WebDAV write failed with status ${response.status}`);
  }
}

async function selectProvider(forceRefresh = false): Promise<StorageSelection> {
  const now = Date.now();
  if (!forceRefresh && providerCache && providerCache.expiresAt > now) {
    return providerCache.selection;
  }

  const hints: string[] = [];

  const kvStatus = await checkKvAvailability();
  if (kvStatus.available) {
    const selection: StorageSelection = { mode: 'vercel-kv' };
    providerCache = { selection, expiresAt: now + 60_000 };
    return selection;
  }
  if (kvStatus.hint) {
    hints.push(kvStatus.hint);
  }

  const webdavStatus = await checkWebdavAvailability();
  if (webdavStatus.available) {
    const selection: StorageSelection = { mode: 'webdav' };
    providerCache = { selection, expiresAt: now + 60_000 };
    return selection;
  }
  if (webdavStatus.hint) {
    hints.push(webdavStatus.hint);
  }

  const selection: StorageSelection = {
    mode: null,
    hint: hints.join(' '),
  };
  providerCache = { selection, expiresAt: now + 30_000 };
  return selection;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(204).end();
  }

  if (req.method === 'GET' && typeof req.query.status !== 'undefined') {
    const selection = await selectProvider(true);
    return res.status(200).json({ available: Boolean(selection.mode), provider: selection.mode, hint: selection.hint });
  }

  const selection = await selectProvider(false);
  if (!selection.mode) {
    return res
      .status(501)
      .json({ message: 'Cloud sync is not configured. Set up Vercel KV or WebDAV storage.', hint: selection.hint });
  }

  const userId = getUserId(req);
  if (!userId) {
    return res.status(400).json({ message: 'userId query parameter is required.' });
  }

  const trimmedUserId = userId.trim().toLowerCase();
  const storageKey = createKvKey(trimmedUserId);
  const webdavPath = createWebdavPath(trimmedUserId);

  try {
    if (req.method === 'GET') {
      if (selection.mode === 'vercel-kv') {
        const record = await kv.get<SyncedUserData>(storageKey);
        return res.status(200).json({ data: record ?? null });
      }

      const config = getWebdavConfig();
      if (!config) {
        throw new Error('WebDAV configuration missing at runtime.');
      }
      const record = await readFromWebdav(webdavPath, config);
      return res.status(200).json({ data: record ?? null });
    }

    if (req.method === 'POST') {
      const body = req.body as SyncRequestBody | undefined;
      if (!body) {
        return res.status(400).json({ message: 'Request body is required.' });
      }

      const payload: SyncedUserData = {
        profile: body.profile,
        dishes: Array.isArray(body.dishes) ? body.dishes : [],
        allUsers: Array.isArray(body.allUsers) ? body.allUsers : [],
        groupMeals: Array.isArray(body.groupMeals) ? body.groupMeals : [],
        dailyPlans: Array.isArray(body.dailyPlans) ? body.dailyPlans : [],
        timeSavedMinutes: typeof body.timeSavedMinutes === 'number' ? body.timeSavedMinutes : 0,
        updatedAt: new Date().toISOString(),
      };

      if (selection.mode === 'vercel-kv') {
        await kv.set(storageKey, payload);
        return res.status(200).json({ data: payload });
      }

      const config = getWebdavConfig();
      if (!config) {
        throw new Error('WebDAV configuration missing at runtime.');
      }
      await writeToWebdav(webdavPath, config, payload);
      return res.status(200).json({ data: payload });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    console.error('Cloud sync API error:', error);
    return res.status(500).json({ message: 'Failed to process sync request.', error: String(error) });
  }
}
