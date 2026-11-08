// Domain data comes from the bank app's own backend (masked values), never from seed files.
import { useCallback, useEffect, useState } from 'react';
import { hub, useUi } from './hub.ts';

type Status = 'loading' | 'ready' | 'error';
const cache = new Map<string, { at: number; version: number; data: unknown }>();

export async function bankGet<T = any>(resource: string, params: Record<string, string | number> = {}): Promise<T> {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`/app-api/v1/${resource}${q.toString() ? '?' + q : ''}`, { headers: { 'x-demo-session': hub.session } });
  if (!res.ok) throw new Error(`bank ${resource} ${res.status}`);
  return res.json();
}

export function useBank<T = any>(resource: string, params: Record<string, string | number> = {}) {
  const version = useUi((s) => s.bankVersion);
  const key = resource + JSON.stringify(params);
  const hit = cache.get(key);
  const [data, setData] = useState<T | undefined>(hit?.data as T | undefined);
  const [status, setStatus] = useState<Status>(hit ? 'ready' : 'loading');
  const load = useCallback(async () => {
    try {
      const d = await bankGet<T>(resource, params);
      cache.set(key, { at: Date.now(), version, data: d });
      setData(d); setStatus('ready');
    } catch { setStatus((s) => (s === 'ready' ? s : 'error')); }
  }, [key, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  return { data, status, reload: load };
}

export function clearBankCache() { cache.clear(); }
