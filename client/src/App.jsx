import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import SeniorView from './SeniorView.jsx';
import FamilyView from './FamilyView.jsx';
import DeskView from './DeskView.jsx';

const VIEWS = [
  { id: 'senior', label: "Peggy's screen" },
  { id: 'family', label: 'Family circle' },
  { id: 'desk', label: 'Volunteer desk' },
];

function initialView() {
  const fromUrl = new URLSearchParams(window.location.search).get('view');
  return VIEWS.some((v) => v.id === fromUrl) ? fromUrl : 'family';
}

export default function App() {
  const [view, setView] = useState(initialView);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError('Can’t reach the Porchlight server. Start it with "npm run dev" in the project folder.');
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const choose = (id) => {
    setView(id);
    const url = new URL(window.location.href);
    url.searchParams.set('view', id);
    window.history.replaceState(null, '', url);
  };

  const run = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      setError(e.message);
    }
    refresh();
  };

  const peggy = state?.seniors.find((s) => s._id === 'peggy');

  return (
    <div className={`app app-${view}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          Porchlight
        </div>
        <nav className="switcher" aria-label="Choose a view">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} aria-pressed={view === v.id} onClick={() => choose(v.id)}>
              {v.label}
            </button>
          ))}
        </nav>
        <details className="demo-menu">
          <summary>Demo controls</summary>
          <div className="demo-menu-body">
            <button onClick={run(() => api.missed('peggy'))}>Simulate a missed check-in</button>
            <button onClick={run(() => api.reset())}>Reset demo data</button>
            {state && (
              <p className="demo-config">
                AI: {state.config.llm ? 'live model' : 'demo mode'} · Texts: {state.config.twilio ? 'Twilio' : 'logged only'} · Data: {state.config.mongo ? 'MongoDB' : 'in memory'}
              </p>
            )}
          </div>
        </details>
      </header>

      {error && (
        <div className="banner banner-error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {!state ? (
        <main className="loading">Lighting the porch…</main>
      ) : view === 'senior' ? (
        <SeniorView senior={peggy} state={state} refresh={refresh} onError={setError} />
      ) : view === 'family' ? (
        <FamilyView senior={peggy} state={state} run={run} />
      ) : (
        <DeskView state={state} run={run} />
      )}
    </div>
  );
}
