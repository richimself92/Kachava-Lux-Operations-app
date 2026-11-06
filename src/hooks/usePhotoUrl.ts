import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../services/firebase';

const cache = new Map<string, string>();

/**
 * Resolves a Storage object path to a download URL. Storage rules decide whether the
 * caller may read it; on denial or error `error` is set and `url` stays null.
 */
export function usePhotoUrl(path: string | null | undefined): { url: string | null; error: boolean } {
  const [state, setState] = useState<{ url: string | null; error: boolean }>(() => ({
    url: path ? cache.get(path) ?? null : null,
    error: false,
  }));

  useEffect(() => {
    if (!path) {
      setState({ url: null, error: false });
      return;
    }
    const cached = cache.get(path);
    if (cached) {
      setState({ url: cached, error: false });
      return;
    }
    let cancelled = false;
    setState({ url: null, error: false });
    getDownloadURL(ref(storage(), path))
      .then((url) => {
        cache.set(path, url);
        if (!cancelled) setState({ url, error: false });
      })
      .catch((err) => {
        console.warn('Could not resolve photo', path, err);
        if (!cancelled) setState({ url: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
