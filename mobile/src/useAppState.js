import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';

// Polls the server every 2 seconds while the app is in the foreground.
export function useAppState() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(() => active.current && refresh(), 2000);
    const sub = AppState.addEventListener('change', (s) => {
      active.current = s === 'active';
      if (active.current) refresh();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [refresh]);

  return { state, error, setError, refresh };
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
