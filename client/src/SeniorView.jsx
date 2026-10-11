import { useEffect, useRef, useState } from 'react';
import { api, canListen, listenOnce, speak } from './api.js';
import Lamp, { lampState } from './Lamp.jsx';

function greetingFor(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function SeniorView({ senior, state, refresh, onError }) {
  const [mode, setMode] = useState('home'); // home | talk | scam | help | thanks
  const primary = state.members.find((m) => m.circleId === senior.circleId && m.primary);

  return (
    <main className="senior">
      {mode === 'home' && <Home senior={senior} primary={primary} setMode={setMode} refresh={refresh} onError={onError} />}
      {mode === 'talk' && <Talk senior={senior} done={() => { setMode('thanks'); refresh(); }} onError={onError} />}
      {mode === 'scam' && <ScamCheck senior={senior} back={() => setMode('home')} onError={onError} />}
      {mode === 'help' && <Help senior={senior} back={() => setMode('home')} refresh={refresh} onError={onError} />}
      {mode === 'thanks' && (
        <section className="senior-panel center">
          <Lamp state="lit" size={180} label="Porch light on" />
          <h1>Thank you, {senior.preferredName}.</h1>
          <p className="senior-lead">Your family will see that you’re doing well today.</p>
          <button className="big-btn" onClick={() => setMode('home')}>Back to start</button>
        </section>
      )}
    </main>
  );
}

function Home({ senior, primary, setMode, refresh, onError }) {
  const [busy, setBusy] = useState(false);
  const checkedIn = senior.status === 'ok' && senior.lastCheckinAt && new Date(senior.lastCheckinAt).toDateString() === new Date().toDateString();

  const imOkay = async () => {
    setBusy(true);
    try {
      await api.ok(senior._id);
      await refresh();
      setMode('thanks');
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="senior-panel">
      <div className="senior-hero">
        <Lamp state={lampState(senior)} size={150} label={checkedIn ? 'Porch light on. You checked in today.' : 'Porch light waiting for today’s check-in'} />
        <div>
          <h1>{greetingFor()}, {senior.preferredName}.</h1>
          <p className="senior-lead">{checkedIn ? 'You’ve checked in today. Your porch light is on.' : 'Your porch light is waiting for today’s check-in.'}</p>
        </div>
      </div>

      <div className="big-grid">
        <button className="big-btn big-primary" onClick={() => setMode('talk')}>
          <span className="big-title">Talk with Porchlight</span>
          <span className="big-sub">A friendly chat about your day</span>
        </button>
        <button className="big-btn" onClick={imOkay} disabled={busy}>
          <span className="big-title">I’m okay today</span>
          <span className="big-sub">One tap lets your family know</span>
        </button>
        {primary && (
          <a className="big-btn" href={`tel:${primary.phone}`}>
            <span className="big-title">Call {primary.name.split(' ')[0]}</span>
            <span className="big-sub">{primary.relation}</span>
          </a>
        )}
        <button className="big-btn" onClick={() => setMode('scam')}>
          <span className="big-title">Is this a scam?</span>
          <span className="big-sub">Tell me about a call or letter</span>
        </button>
        <button className="big-btn big-help" onClick={() => setMode('help')}>
          <span className="big-title">I need help</span>
          <span className="big-sub">Your family and neighbor are alerted</span>
        </button>
      </div>
    </section>
  );
}

function Talk({ senior, done, onError }) {
  const [checkin, setCheckin] = useState(null);
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState('starting'); // starting | speaking | ready | listening | thinking | ending
  const [voiceOn, setVoiceOn] = useState(true);
  const endRef = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const c = await api.startCheckin(senior._id);
        setCheckin(c);
        setLines(c.transcript);
        setPhase('speaking');
        await speak(c.transcript[0].text);
        setPhase('ready');
      } catch (e) {
        onError(e.message);
      }
    })();
    return () => window.speechSynthesis?.cancel();
  }, [senior._id, onError]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [lines]);

  const send = async (text) => {
    if (!text.trim() || !checkin) return;
    setDraft('');
    setLines((l) => [...l, { who: 'senior', text }]);
    setPhase('thinking');
    try {
      const r = await api.say(checkin._id, text);
      setLines((l) => [...l, { who: 'porchlight', text: r.reply }]);
      setPhase('speaking');
      if (voiceOn) await speak(r.reply);
      if (r.ended) return finish();
      setPhase('ready');
    } catch (e) {
      onError(e.message);
      setPhase('ready');
    }
  };

  const listen = async () => {
    setPhase('listening');
    try {
      const heard = await listenOnce();
      await send(heard);
    } catch (e) {
      onError(e.message);
      setPhase('ready');
    }
  };

  const finish = async () => {
    setPhase('ending');
    window.speechSynthesis?.cancel();
    try {
      await api.finish(checkin._id);
      done();
    } catch (e) {
      onError(e.message);
      setPhase('ready');
    }
  };

  const status = {
    starting: 'Calling…',
    speaking: 'Porchlight is talking',
    ready: canListen ? 'Press the button and talk' : 'Type your answer below',
    listening: 'Listening… go ahead',
    thinking: 'Thinking…',
    ending: 'Saying goodbye…',
  }[phase];

  return (
    <section className="senior-panel talk">
      <div className="talk-head">
        <Lamp state="lit" size={84} label="Porch light on" />
        <p className="talk-status" aria-live="polite">{status}</p>
        <label className="voice-toggle">
          <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
          Read replies aloud
        </label>
      </div>

      <ol className="transcript" aria-label="Conversation">
        {lines.map((l, i) => (
          <li key={i} className={`line line-${l.who}`}>
            <span className="line-who">{l.who === 'porchlight' ? 'Porchlight' : senior.preferredName}</span>
            {l.text}
          </li>
        ))}
        <li ref={endRef} className="sr-only" aria-hidden="true" />
      </ol>

      <div className="talk-controls">
        {canListen && (
          <button className="big-btn big-primary mic" onClick={listen} disabled={phase !== 'ready'}>
            <span className="big-title">{phase === 'listening' ? 'Listening…' : 'Press to talk'}</span>
          </button>
        )}
        <form className="type-row" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <label htmlFor="say" className="sr-only">Type your answer</label>
          <input id="say" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type here" disabled={phase === 'ending'} />
          <button type="submit" className="btn" disabled={!draft.trim() || phase === 'thinking'}>Send</button>
        </form>
        <button className="btn btn-quiet" onClick={finish} disabled={!checkin || phase === 'ending'}>I’m done talking</button>
      </div>
    </section>
  );
}

function ScamCheck({ senior, back, onError }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async (desc) => {
    if (!desc.trim()) return;
    setBusy(true);
    try {
      const r = await api.scamCheck(senior._id, desc);
      setResult(r);
      speak(`${r.verdict === 'likely scam' ? 'This looks like a scam.' : r.verdict === 'be careful' ? 'Be careful with this one.' : 'This looks okay.'} ${r.advice}`);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const tone = result?.verdict === 'likely scam' ? 'danger' : result?.verdict === 'be careful' ? 'warn' : 'safe';

  return (
    <section className="senior-panel">
      <h1>Is this a scam?</h1>
      <p className="senior-lead">Tell me who contacted you and what they asked for.</p>
      {!result ? (
        <>
          <label htmlFor="scam" className="sr-only">Describe the call or message</label>
          <textarea id="scam" rows={4} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="A man called and said my grandson is in jail…" />
          <div className="row">
            {canListen && (
              <button className="big-btn" disabled={busy} onClick={async () => {
                try { const heard = await listenOnce(); setText(heard); check(heard); } catch (e) { onError(e.message); }
              }}>
                <span className="big-title">Say it out loud</span>
              </button>
            )}
            <button className="big-btn big-primary" disabled={busy || !text.trim()} onClick={() => check(text)}>
              <span className="big-title">{busy ? 'Checking…' : 'Check it'}</span>
            </button>
          </div>
        </>
      ) : (
        <div className={`verdict verdict-${tone}`} role="status">
          <p className="verdict-word">{result.verdict === 'likely scam' ? 'This looks like a scam.' : result.verdict === 'be careful' ? 'Be careful.' : 'This looks okay.'}</p>
          {result.redFlags?.length > 0 && (
            <ul>{result.redFlags.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
          <p>{result.advice}</p>
          {result.verdict !== 'probably fine' && <p className="verdict-note">I’ve let your family know.</p>}
        </div>
      )}
      <button className="btn btn-quiet" onClick={back}>Back to start</button>
    </section>
  );
}

function Help({ senior, back, refresh, onError }) {
  const [sent, setSent] = useState(false);
  const send = async () => {
    try {
      await api.help(senior._id);
      setSent(true);
      refresh();
    } catch (e) {
      onError(e.message);
    }
  };
  return (
    <section className="senior-panel center">
      {!sent ? (
        <>
          <h1>Do you need help now?</h1>
          <p className="senior-lead">I’ll text your family right away, then your neighbor. If you’re hurt, call 911.</p>
          <div className="row">
            <button className="big-btn big-help" onClick={send}><span className="big-title">Yes, alert my family</span></button>
            <a className="big-btn" href="tel:911"><span className="big-title">Call 911</span></a>
          </div>
          <button className="btn btn-quiet" onClick={back}>No, go back</button>
        </>
      ) : (
        <>
          <Lamp state="alert" size={160} label="Help requested" />
          <h1>Help is on the way.</h1>
          <p className="senior-lead">Your family has been texted. Stay where you are if you can. If you’re hurt, call 911.</p>
          <a className="big-btn big-help" href="tel:911"><span className="big-title">Call 911</span></a>
          <button className="btn btn-quiet" onClick={back}>Back to start</button>
        </>
      )}
    </section>
  );
}
