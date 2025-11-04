import { CloudSyncStatus, Dish, SyncedUserData, UserProfile } from '../types';

export type SyncPayload = {
  profile: UserProfile | null;
  dishes: Dish[];
  allUsers: UserProfile[];
};

export class SyncServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONFIGURATION' | 'NETWORK' | 'SERVER'
  ) {
    super(message);
    this.name = 'SyncServiceError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 501) {
    throw new SyncServiceError('Cloud sync is not configured on the server.', 'CONFIGURATION');
  }

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new SyncServiceError(message || 'Unexpected response from cloud sync service.', 'SERVER');
  }

  return (await response.json()) as T;
}

async function checkAvailability(): Promise<CloudSyncStatus> {
  try {
    const response = await fetch('/api/user-sync?status=1');
    if (!response.ok) {
      return { available: false, hint: 'Cloud sync API returned an unexpected status.' };
    }
    const data = (await response.json()) as Partial<CloudSyncStatus>;
    return {
      available: Boolean(data?.available),
      provider: data?.provider,
      hint: data?.hint,
    };
  } catch (error) {
    console.error('Cloud sync availability check failed:', error);
    return {
      available: false,
      hint: 'Unable to reach the sync API. Check your network or server logs.',
    };
  }
}

async function pull(userId: string): Promise<SyncedUserData | null> {
  try {
    const response = await fetch(`/api/user-sync?userId=${encodeURIComponent(userId)}`);
    const data = await handleResponse<{ data: SyncedUserData | null }>(response);
    return data?.data ?? null;
  } catch (error) {
    if (error instanceof SyncServiceError) {
      throw error;
    }
    console.error('Cloud sync pull failed:', error);
    throw new SyncServiceError('Unable to retrieve cloud backup. Please try again later.', 'NETWORK');
  }
}

async function push(userId: string, payload: SyncPayload): Promise<SyncedUserData> {
  try {
    const response = await fetch(`/api/user-sync?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ data: SyncedUserData }>(response);
    return data.data;
  } catch (error) {
    if (error instanceof SyncServiceError) {
      throw error;
    }
    console.error('Cloud sync push failed:', error);
    throw new SyncServiceError('Network error while saving to the cloud. Changes are safe locally.', 'NETWORK');
  }
}

export const syncService = {
  checkAvailability,
  pull,
  push,
};
