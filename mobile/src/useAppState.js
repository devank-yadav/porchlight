import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';

// Polls the server every 3 seconds while the app is in the foreground and signed in.
// The server returns only the signed-in account's circle, filtered for what that person may see.
// accountId: who is signed in (null = signed out). Data from a previous account is never shown.
export function useAppState(accountId = null) {
  const enabled = Boolean(accountId);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const active = useRef(true);
  const request = useRef(0);
  const applied = useRef(0);
  const last = useRef('');

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    try {
      const s = await api.state();
      // Accept completed requests in order, even when a newer poll is pending.
      // Slow connections must not starve the screen of every response.
      if (id < applied.current) return;
      applied.current = id;
      // Same as last time: skip the re-render, so the phone isn't redrawing every screen every 2 s.
      const key = JSON.stringify(s);
      if (key !== last.current) {
        last.current = key;
        setSnapshot({ who: s.me?.id, state: s });
      }
      setError(null);
    } catch (e) {
      if (id < applied.current) return;
      applied.current = id;
      setError(e.message);
    }
  }, [enabled]);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const t = setInterval(() => active.current && refresh(), 3000);
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

  return { state: enabled && snapshot?.who === accountId ? snapshot.state : null, error, setError, refresh };
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
