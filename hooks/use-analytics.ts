import { useState, useCallback } from 'react';

export function useAnalytics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async <T>(endpoint: string, params?: Record<string, string>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/analytics${endpoint}`, window.location.origin);
      if (params) {
        Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return await res.json() as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetch('/api/analytics/refresh', { method: 'POST' });
  }, []);

  return { fetchData, refresh, loading, error };
}
