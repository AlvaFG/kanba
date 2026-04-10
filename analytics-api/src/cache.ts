import cron from 'node-cron';

const store = new Map<string, { data: unknown; ts: number }>();

export function get<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  return entry.data as T;
}

export function set(key: string, data: unknown): void {
  store.set(key, { data, ts: Date.now() });
}

export function clear(): void {
  store.clear();
}

export function cacheKey(path: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${path}?${sorted.map(([k, v]) => `${k}=${v}`).join('&')}`;
}

// Refresh daily at 12:00 UTC (9:00 AM ART)
cron.schedule('0 12 * * *', () => {
  console.log('[cache] Daily refresh at 9:00 AM ART');
  clear();
});
