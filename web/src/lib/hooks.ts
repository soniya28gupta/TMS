import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, getCachedData } from './api';

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (value: T | null) => void;
};

/**
 * Minimal data-fetching hook with SWR local caching:
 * Loads instantaneously (0ms) from local cache if available, while
 * fetching the latest state in the background.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []): FetchState<T> {
  const initialData = path ? getCachedData<T>(path) : null;
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(!initialData && !!path);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const requestId = ++latest.current;
    const controller = new AbortController();

    const cached = getCachedData<T>(path);
    if (cached) {
      setData(cached);
    } else {
      setLoading(true);
    }
    setError(null);

    api
      .get<T>(path, controller.signal)
      .then((result) => {
        if (requestId !== latest.current) return;
        setData(result);
      })
      .catch((err) => {
        if (controller.signal.aborted || requestId !== latest.current) return;
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
      })
      .finally(() => {
        if (requestId === latest.current) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload, setData };
}

/** Wraps a mutating call with loading + error state and a friendly message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
