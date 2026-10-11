import { api } from './api.js';
import Lamp, { lampState } from './Lamp.jsx';

const STATUS = {
  help: { label: 'Pressed help', rank: 0 },
  missed: { label: 'Missed check-in', rank: 1 },
  scam: { label: 'Possible scam', rank: 2 },
  'needs-human': { label: 'Needs a human call', rank: 3 },
  talking: { label: 'On a call now', rank: 4 },
  waiting: { label: 'Not called yet', rank: 5 },
  ok: { label: 'Okay today', rank: 6 },
};

export default function DeskView({ state, run }) {
  const seniors = [...state.seniors].sort((a, b) => (STATUS[a.status]?.rank ?? 9) - (STATUS[b.status]?.rank ?? 9));
  const needHuman = seniors.filter((s) => (STATUS[s.status]?.rank ?? 9) <= 3);
  const okCount = seniors.filter((s) => s.status === 'ok').length;

  return (
    <main className="desk">
      <header className="desk-head">
        <div>
          <h1>Today’s reassurance calls</h1>
          <p className="card-hint">Sample program. Porchlight makes the routine calls; you take the ones that need a person.</p>
        </div>
        <dl className="desk-stats">
          <div><dt>Need you</dt><dd>{needHuman.length}</dd></div>
          <div><dt>Okay today</dt><dd>{okCount}</dd></div>
          <div><dt>In program</dt><dd>{seniors.length}</dd></div>
        </dl>
      </header>

      <ul className="desk-list">
        {seniors.map((s) => {
          const st = STATUS[s.status] ?? { label: s.status };
          const urgent = (st.rank ?? 9) <= 3;
          return (
            <li key={s._id} className={`desk-row ${urgent ? 'desk-urgent' : ''} status-${s.status}`}>
              <Lamp state={lampState(s)} size={52} label={st.label} />
              <div className="desk-who">
                <p className="task-title">{s.name}, {s.age}</p>
                <p className="task-meta">{s.lastNote || 'No calls yet today.'}</p>
              </div>
              <span className={`chip chip-${s.status}`}>{st.label}</span>
              <div className="desk-actions">
                {urgent ? (
                  <button className="btn btn-small btn-accent" onClick={run(() => api.resolve(s._id, 'sam'))}>I called, all okay</button>
                ) : (
                  <span className="task-meta">Porchlight has it</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
