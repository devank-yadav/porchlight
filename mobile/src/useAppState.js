import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';

// Polls the server every 2 seconds while the app is in the foreground.
// viewer: family member id (filtered view) or null (everything: Peggy's screen).
export function useAppState(viewer = null) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const active = useRef(true);
  const request = useRef(0);
  const applied = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const s = await api.state(viewer);
      // Accept completed requests in order, even when a newer poll is pending.
      // Slow connections must not starve the screen of every response.
      if (id < applied.current) return;
      applied.current = id;
      setSnapshot({ viewer, state: s });
      setError(null);
    } catch (e) {
      if (id < applied.current) return;
      applied.current = id;
      setError(e.message);
    }
  }, [viewer]);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const t = setInterval(() => active.current && refresh(), 2000);
    const sub = AppState.addEventListener('change', (s) => {
      active.current = s === 'active';
      if (active.current) refresh();
    });
    return () => {
      clearTimeout(initial);
      clearInterval(t);
      sub.remove();
    };
  }, [refresh]);

  // A profile change must never briefly show the previous viewer's private data.
  return { state: snapshot?.viewer === viewer ? snapshot.state : null, error, setError, refresh };
}

export function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
