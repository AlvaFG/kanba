import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_ANALYTICS_API_URL || '';
const API_KEY = process.env.NEXT_PUBLIC_ANALYTICS_API_KEY || '';

export function useAnalytics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async <T>(endpoint: string, params?: Record<string, string>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(endpoint, API_URL);
      if (params) {
        Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
      }
      const res = await fetch(url.toString(), {
        headers: { 'x-api-key': API_KEY },
      });
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
    await fetch(`${API_URL}/refresh`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
    });
  }, []);

  return { fetchData, refresh, loading, error };
}
