import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { Dish, SyncedUserData, UserProfile } from '../types';

interface SyncRequestBody {
  profile: UserProfile | null;
  dishes: Dish[];
  allUsers: UserProfile[];
}

const KEY_PREFIX = process.env.MEAL_SYNC_PREFIX ?? 'meal-planner-sync';

const isConfigured = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

function createKey(userId: string) {
  return `${KEY_PREFIX}:${userId}`;
}

function getUserId(req: VercelRequest): string | null {
  const raw = (req.query.userId || req.query.userID || req.query.userid) as string | string[] | undefined;
  if (!raw) {
    return null;
  }
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(204).end();
  }

  if (req.method === 'GET' && typeof req.query.status !== 'undefined') {
    return res.status(200).json({ available: isConfigured() });
  }

  if (!isConfigured()) {
    return res.status(501).json({ message: 'Cloud sync is not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN.' });
  }

  const userId = getUserId(req);
  if (!userId || userId.trim().length === 0) {
    return res.status(400).json({ message: 'userId query parameter is required.' });
  }

  const storageKey = createKey(userId.trim().toLowerCase());

  try {
    if (req.method === 'GET') {
      const record = await kv.get<SyncedUserData>(storageKey);
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
        updatedAt: new Date().toISOString(),
      };

      await kv.set(storageKey, payload);
      return res.status(200).json({ data: payload });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (error) {
    console.error('Cloud sync API error:', error);
    return res.status(500).json({ message: 'Failed to process sync request.', error: String(error) });
  }
}
