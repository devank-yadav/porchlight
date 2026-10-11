import { useState } from 'react';
import { api } from './api.js';
import Lamp, { lampState } from './Lamp.jsx';

const MOOD = { good: 'Cheerful', okay: 'Steady', low: 'A bit down' };

function ago(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function localTime(tz) {
  return new Date().toLocaleTimeString([], { timeZone: tz, hour: 'numeric', minute: '2-digit' });
}
function isAwake(tz) {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
  return h >= 8 && h < 21;
}

export default function FamilyView({ senior, state, run }) {
  const [me, setMe] = useState('anne');
  const [newTask, setNewTask] = useState('');

  const circle = state.members.filter((m) => m.circleId === senior.circleId);
  const memberName = (id) => state.members.find((m) => m._id === id)?.name.split(' ')[0] ?? 'Someone';
  const checkins = state.checkins.filter((c) => c.seniorId === senior._id && c.status === 'completed');
  const latest = checkins[0];
  const latestTalk = checkins.find((c) => c.channel !== 'button');
  const escalation = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'active');
  const lastResolved = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'resolved');
  const scamFlags = [
    ...(latestTalk?.flags || []).filter((f) => f.type === 'scam').map((f) => ({ text: f.text, at: latestTalk.endedAt })),
    ...state.scamChecks.filter((s) => s.seniorId === senior._id && s.verdict !== 'probably fine').map((s) => ({ text: s.description, at: s.createdAt })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const otherFlags = (latestTalk?.flags || []).filter((f) => f.type !== 'scam');

  const tasks = state.tasks.filter((t) => t.seniorId === senior._id);
  const open = tasks.filter((t) => t.status === 'open');
  const share = circle.map((m) => ({ m, n: tasks.filter((t) => t.status === 'done' && t.assignee === m._id).length }));
  const maxShare = Math.max(1, ...share.map((s) => s.n));
  const stories = checkins.flatMap((c) => (c.stories || []).map((s) => ({ ...s, at: c.endedAt })));
  const about = senior.about.join(' ').toLowerCase();
  const events = state.events.filter((e) => e.tags.some((t) => about.includes(t)) || e.tags.includes('social'));
  const week = [...checkins].filter((c) => c.channel !== 'button').slice(0, 7).reverse();
  const texts = state.notifications.filter((n) => circle.some((m) => m._id === n.toId)).slice(0, 5);

  const lamp = lampState(senior);
  const headline =
    escalation ? (escalation.reason === 'help' ? `${senior.preferredName} pressed her help button` : `${senior.preferredName} hasn’t answered today`)
    : senior.status === 'talking' ? `${senior.preferredName} is talking with Porchlight now`
    : latest && new Date(latest.endedAt).toDateString() === new Date().toDateString() ? `${senior.preferredName} checked in ${ago(latest.endedAt)}`
    : `Waiting for ${senior.preferredName}’s ${senior.checkinTime} check-in`;

  return (
    <main className="family">
      <div className="me-row">
        <label htmlFor="me">Viewing as</label>
        <select id="me" value={me} onChange={(e) => setMe(e.target.value)}>
          {circle.map((m) => <option key={m._id} value={m._id}>{m.name} ({m.relation})</option>)}
        </select>
      </div>

      <section className={`today today-${lamp}`} aria-live="polite">
        <Lamp state={lamp} size={132} label={headline} />
        <div className="today-body">
          <h1>{headline}</h1>
          {escalation ? (
            <Ladder esc={escalation} senior={senior} onResolve={run(() => api.resolve(senior._id, me))} />
          ) : (
            <>
              {latest && <p className="today-summary">{latest.summary}</p>}
              <dl className="facts">
                {latest?.mood && <div><dt>Mood</dt><dd>{MOOD[latest.mood]}</dd></div>}
                {latest && <div><dt>Pills</dt><dd>{latest.medsTaken === true ? 'Taken' : latest.medsTaken === false ? 'Not yet' : 'Didn’t say'}</dd></div>}
                <div><dt>Next call</dt><dd>Tomorrow, {senior.checkinTime}</dd></div>
              </dl>
              {lastResolved && Date.now() - new Date(lastResolved.resolvedAt).getTime() < 3600000 && (
                <p className="today-note">Earlier alert resolved by {lastResolved.resolvedBy}, {ago(lastResolved.resolvedAt)}.</p>
              )}
            </>
          )}
        </div>
      </section>

      {(scamFlags.length > 0 || otherFlags.length > 0) && (
        <section className="flags">
          {scamFlags.slice(0, 2).map((f, i) => (
            <div key={i} className="flag flag-scam">
              <h2>Possible scam, {ago(f.at)}</h2>
              <p>“{f.text}”</p>
              <p className="flag-tip">Porchlight told her not to send anything. Worth a call today to make sure she didn’t share any details.</p>
            </div>
          ))}
          {otherFlags.map((f, i) => (
            <div key={i} className={`flag flag-${f.type}`}>
              <h2>{f.type === 'urgent' ? 'Needs attention now' : f.type === 'lonely' ? 'She sounded lonely' : 'Different from usual'}</h2>
              <p>“{f.text}”</p>
            </div>
          ))}
        </section>
      )}

      <div className="family-grid">
        <section className="card">
          <h2>Things to talk about</h2>
          <p className="card-hint">From what she shared today. A real call beats any app.</p>
          {latestTalk?.starters?.length ? (
            <ul className="starters">{latestTalk.starters.map((s) => <li key={s}>{s}</li>)}</ul>
          ) : (
            <p className="empty">After her next chat, you’ll see ideas here for your own call.</p>
          )}
        </section>

        <section className="card">
          <h2>Care tasks</h2>
          <ul className="tasks">
            {open.length === 0 && <li className="empty">Nothing open. Add something below.</li>}
            {open.map((t) => (
              <li key={t._id} className="task">
                <div>
                  <p className="task-title">{t.title}</p>
                  <p className="task-meta">{t.due}{t.source === 'checkin' ? ' · she asked on her call' : ''}{t.assignee ? ` · ${memberName(t.assignee)} has it` : ''}</p>
                </div>
                {t.assignee ? (
                  <button className="btn btn-small" onClick={run(() => api.done(t._id))}>Mark done</button>
                ) : (
                  <button className="btn btn-small btn-accent" onClick={run(() => api.claim(t._id, me))}>I’ll do it</button>
                )}
              </li>
            ))}
          </ul>
          <form className="add-task" onSubmit={(e) => { e.preventDefault(); if (!newTask.trim()) return; run(() => api.addTask({ seniorId: senior._id, title: newTask }))(); setNewTask(''); }}>
            <label htmlFor="newtask" className="sr-only">New task</label>
            <input id="newtask" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task, like ‘Drop off soup Sunday’" />
            <button className="btn btn-small" type="submit">Add</button>
          </form>
          <h3>Who’s been helping this month</h3>
          <ul className="share">
            {share.map(({ m, n }) => (
              <li key={m._id}>
                <span className="share-name">{m.name.split(' ')[0]}</span>
                <span className="share-bar" aria-hidden="true"><span style={{ width: `${(n / maxShare) * 100}%` }} /></span>
                <span className="share-n">{n} {n === 1 ? 'task' : 'tasks'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>{senior.preferredName}’s stories</h2>
          {stories.length === 0 ? <p className="empty">Stories she tells on her calls are saved here for the family.</p> : (
            <ul className="stories">
              {stories.slice(0, 4).map((s, i) => (
                <li key={i}>
                  <h3>{s.title}</h3>
                  <blockquote>{s.text}</blockquote>
                  <p className="task-meta">{ago(s.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>This week</h2>
          <ol className="week" aria-label="Mood on recent calls">
            {week.map((c) => (
              <li key={c._id} className={`week-day mood-${c.mood}`}>
                <span className="week-dot" aria-hidden="true" />
                <span>{new Date(c.endedAt).toLocaleDateString([], { weekday: 'short' })}</span>
                <span className="week-mood">{MOOD[c.mood]}</span>
              </li>
            ))}
          </ol>

          <h3>The circle</h3>
          <ul className="circle">
            {circle.map((m) => (
              <li key={m._id}>
                <span>{m.name.split(' ')[0]} <span className="task-meta">{m.relation}</span></span>
                <span className={`clock ${isAwake(m.timezone) ? '' : 'asleep'}`}>{localTime(m.timezone)}{isAwake(m.timezone) ? '' : ' · asleep'}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Get her out of the house</h2>
          <p className="card-hint">Matched to what she enjoys. Offering a ride turns it into a task.</p>
          <ul className="events">
            {events.map((e) => (
              <li key={e._id}>
                <div>
                  <p className="task-title">{e.title}</p>
                  <p className="task-meta">{e.when} · {e.where}</p>
                </div>
                <button className="btn btn-small" onClick={run(() => api.addTask({ seniorId: senior._id, title: `Ride to ${e.title.toLowerCase()} (${e.when})`, type: 'ride', due: e.when }))}>Offer a ride</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Texts sent by Porchlight</h2>
          {texts.length === 0 ? <p className="empty">When Porchlight needs the circle, the texts it sends show up here.</p> : (
            <ul className="texts">
              {texts.map((n, i) => (
                <li key={i}><span className="task-meta">To {n.to.split(' ')[0]}, {ago(n.at)}</span><p>{n.text}</p></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Ladder({ esc, senior, onResolve }) {
  return (
    <div className="ladder">
      <ol>
        {esc.steps.map((s, i) => (
          <li key={i} className={`step step-${s.status}`}>
            <span className="step-mark" aria-hidden="true" />
            <span>{s.label}</span>
            <span className="task-meta">{s.status === 'done' ? `sent ${ago(s.at)}` : 'next'}</span>
          </li>
        ))}
      </ol>
      <button className="btn btn-accent" onClick={onResolve}>I reached {senior.preferredName}, she’s okay</button>
    </div>
  );
}
