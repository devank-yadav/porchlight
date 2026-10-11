import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { ago } from './useAppState';
import { Button, Card, Chip, H1, H2, Meta, P, Segmented } from './ui';
import { color, font, radius } from './theme';

const MOOD = { good: 'Cheerful', okay: 'Steady', low: 'A bit down' };

// Pills: we only report what she said. Never a judgement.
const MED = { taken: 'Taken (she said)', not_taken: 'Not yet', unsure: 'Not sure', no_answer: 'No answer', private: 'Private' };
function medLabel(c) {
  if (!c) return null;
  if (c.medStatus && MED[c.medStatus]) return MED[c.medStatus];
  return c.medsTaken === true ? 'Taken (she said)' : c.medsTaken === false ? 'Not yet' : 'No answer';
}

const TRANSPORT = {
  unknown: ['Ride not sorted', 'neutral'],
  self: ['Has a ride', 'ok'],
  at_risk: ['Needs a ride', 'attention'],
  requested: ['Ride requested', 'attention'],
  confirmed: ['Ride confirmed', 'ok'],
};

// Ride steps shown on the approval card.
const STEPS = [
  ['PENDING_APPROVAL', 'Needs OK'],
  ['APPROVED', 'Approved'],
  ['REQUESTED', 'Requested'],
  ['CONFIRMED', 'Confirmed'],
];
const STEP_INDEX = { PENDING_APPROVAL: 0, APPROVED: 1, REQUESTED: 2, CONFIRMED: 3, COMPLETED: 4 };
const ENDED = { REJECTED: 'Not approved', FAILED: 'Booking failed', CANCELLED: 'Cancelled' };

const TONE_DOT = { urgent: color.brick, attention: color.lamp, ok: color.sage };

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const day = d.toDateString() === today.toDateString() ? 'Today'
    : d.toDateString() === tomorrow.toDateString() ? 'Tomorrow'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function localTime(tz) {
  try {
    return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}
function isAwake(tz) {
  try {
    const h = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
    return h >= 8 && h < 21;
  } catch {
    return true;
  }
}

export default function FamilyScreen({ senior, state, me, run }) {
  const [tab, setTab] = useState('today');

  const circle = state.members.filter((m) => m.circleId === senior.circleId);
  const checkins = state.checkins.filter((c) => c.seniorId === senior._id && c.status === 'completed');
  const ctx = { senior, state, me, run, circle, checkins, latestTalk: checkins.find((c) => c.channel !== 'button') };

  return (
    <View style={{ flex: 1 }}>
      <View style={st.tabs}>
        <Segmented
          options={[{ id: 'today', label: 'Today' }, { id: 'care', label: 'Care' }, { id: 'stories', label: 'Stories' }, { id: 'circle', label: 'Circle' }]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
        {tab === 'today' && <Today {...ctx} />}
        {tab === 'care' && <Care {...ctx} />}
        {tab === 'stories' && <Stories {...ctx} />}
        {tab === 'circle' && <Circle {...ctx} />}
      </ScrollView>
    </View>
  );
}

function Today({ senior, state, me, run, checkins, latestTalk }) {
  const latest = checkins[0];
  const escalation = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'active');
  const lastResolved = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'resolved');
  const scamFlags = [
    ...(latestTalk?.flags || []).filter((f) => f.type === 'scam').map((f) => ({ text: f.text, at: latestTalk.endedAt })),
    ...state.scamChecks.filter((x) => x.seniorId === senior._id && x.verdict !== 'probably fine').map((x) => ({ text: x.description, at: x.createdAt })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const otherFlags = (latestTalk?.flags || []).filter((f) => f.type !== 'scam');
  const week = checkins.filter((c) => c.channel !== 'button').slice(0, 7).reverse();
  const lamp = lampState(senior);
  const isHelp = escalation?.reason === 'help';
  const meMember = state.members.find((m) => m._id === me);
  const actions = (state.actions || []).filter((a) => a.seniorId === senior._id && a.status !== 'COMPLETED');
  const appointments = (state.appointments || [])
    .filter((a) => a.seniorId === senior._id && new Date(a.startsAt).getTime() > Date.now() - 3600000)
    .sort((a, b) => (a.startsAt > b.startsAt ? 1 : -1));

  const headline =
    escalation ? (isHelp ? `${senior.preferredName} pressed her help button` : `${senior.preferredName}’s check-in is unresolved`)
    : senior.status === 'talking' ? `${senior.preferredName} is talking with Porchlight`
    : latest && new Date(latest.endedAt).toDateString() === new Date().toDateString() ? `${senior.preferredName} checked in ${ago(latest.endedAt)}`
    : `Waiting for ${senior.preferredName}’s ${senior.checkinTime} check-in`;

  return (
    <>
      {state.digest?.line ? <Digest digest={state.digest} /> : null}

      <View style={[st.today, isHelp && { backgroundColor: color.brickSoft }]} accessibilityLiveRegion="polite">
        <View style={st.todayTop}>
          <Lamp state={lamp} size={88} label={headline} />
          <H1 onDusk style={{ flex: 1, fontSize: 27, lineHeight: 31 }}>{headline}</H1>
        </View>
        {escalation ? (
          <View style={{ gap: 12 }}>
            {!isHelp && <Text style={st.summary}>She may just be out or asleep. Porchlight is working down the list below.</Text>}
            {escalation.steps.map((s, i) => (
              <View key={i} style={st.step}>
                <View style={[st.stepMark, s.status === 'done' && (isHelp ? st.stepDone : st.stepDoneAmber)]} />
                <Text style={[st.stepText, s.status === 'done' && { color: color.ink }]}>{s.label}</Text>
                <Text style={st.stepWhen}>{s.status === 'done' ? `sent ${ago(s.at)}` : s.status === 'held' ? 'held for quiet hours' : 'next'}</Text>
              </View>
            ))}
            <Button label={`I reached ${senior.preferredName}, she’s okay`} variant="light" onPress={run(() => api.resolve(senior._id, me))} />
          </View>
        ) : (
          <>
            {latest && <Text style={st.summary}>{latest.summary}</Text>}
            <View style={st.facts}>
              {latest?.mood && <Fact label="Mood" value={MOOD[latest.mood]} />}
              {latest && <Fact label="Pills" value={medLabel(latest)} />}
              <Fact label="Next call" value={`Tomorrow ${senior.checkinTime}`} />
            </View>
            {lastResolved && Date.now() - new Date(lastResolved.resolvedAt).getTime() < 3600000 && (
              <Text style={st.note}>Earlier alert resolved by {lastResolved.resolvedBy}, {ago(lastResolved.resolvedAt)}.</Text>
            )}
          </>
        )}
      </View>

      {actions.map((a) => (
        <ActionCard key={a._id} action={a} state={state} me={meMember} run={run} senior={senior} />
      ))}

      {appointments.map((a) => <AppointmentCard key={a._id} appt={a} />)}

      {scamFlags.slice(0, 2).map((f, i) => (
        <View key={`s${i}`} style={[st.flag, st.flagScam]}>
          <Text style={[st.flagTitle, { color: color.brick }]}>Possible scam, {ago(f.at)}</Text>
          <P>“{f.text}”</P>
          <P muted>Porchlight told her not to send anything. Worth a call today to make sure she didn’t share any details.</P>
        </View>
      ))}
      {otherFlags.map((f, i) => (
        <View key={`f${i}`} style={[st.flag, f.type === 'urgent' && { borderColor: color.brick }]}>
          <Text style={st.flagTitle}>{f.type === 'urgent' ? 'Needs attention now' : f.type === 'lonely' ? 'She sounded lonely' : 'Different from usual'}</Text>
          <P>“{f.text}”</P>
        </View>
      ))}

      <Card>
        <H2>Things to talk about</H2>
        <Meta>From what she shared today. A real call beats any app.</Meta>
        {latestTalk?.starters?.length ? latestTalk.starters.map((s) => (
          <View key={s} style={st.starter}><P>{s}</P></View>
        )) : <P muted>After her next chat, you’ll see ideas here for your own call.</P>}
      </Card>

      <Card>
        <H2>This week</H2>
        <View style={st.week}>
          {week.map((c) => (
            <View key={c._id} style={st.weekDay} accessibilityLabel={`${new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'long' })}: ${MOOD[c.mood]}`}>
              <View style={[st.weekDot, { backgroundColor: c.mood === 'good' ? color.lamp : c.mood === 'low' ? color.brick : color.muted }]} />
              <Text style={st.weekLabel}>{new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'short' })}</Text>
              <Text style={st.weekMood}>{MOOD[c.mood]}</Text>
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

function Digest({ digest }) {
  return (
    <Card style={{ gap: 10 }}>
      <Text style={st.digestLine} accessibilityRole="header">{digest.line}</Text>
      {(digest.items || []).slice(0, 4).map((it, i) => (
        <View key={i} style={st.digestItem}>
          <View style={[st.digestDot, { backgroundColor: TONE_DOT[it.tone] ?? color.line }]} />
          <P style={{ flex: 1 }}>{it.text}</P>
        </View>
      ))}
    </Card>
  );
}

function ActionCard({ action, state, me, run, senior }) {
  const approver = state.members.find((m) => m._id === action.approverId);
  const approverName = approver?.name.split(' ')[0] ?? 'the primary contact';
  const idx = STEP_INDEX[action.status];
  const ended = ENDED[action.status];
  const pending = action.status === 'PENDING_APPROVAL';
  const canApprove = Boolean(me?.canApprove);
  const last = action.history?.[action.history.length - 1];
  const d = action.details || {};

  return (
    <View style={[st.flag, pending && { borderColor: color.lamp }]} accessibilityLiveRegion="polite">
      <View style={st.cardHead}>
        <Text style={[st.flagTitle, { flex: 1 }]}>{action.title}</Text>
        <Chip label={ended ?? (pending ? 'Needs your OK' : STEPS[Math.min(idx ?? 0, 3)][1])} tone={ended ? 'urgent' : pending ? 'attention' : idx >= 3 ? 'ok' : 'neutral'} />
      </View>
      {action.reason ? <Text style={st.quote}>{action.reason}</Text> : null}

      <View style={{ gap: 4 }}>
        {d.pickupAt && <P><Text style={st.label}>Pickup </Text>{when(d.pickupAt)}</P>}
        {d.from && <P><Text style={st.label}>From </Text>{d.from}</P>}
        {d.to && <P><Text style={st.label}>To </Text>{d.to}</P>}
        {d.needs && <P><Text style={st.label}>Note </Text>{d.needs}</P>}
      </View>

      {!ended && (
        <View style={st.steps} accessibilityLabel={`Status: ${STEPS[Math.min(idx ?? 0, 3)][1]}`}>
          {STEPS.map(([key, label], i) => (
            <View key={key} style={st.stepCol}>
              <View style={[st.bar, i <= (idx ?? 0) && { backgroundColor: i === 3 ? color.sage : color.mutedOnDusk }]} />
              <Text style={[st.stepLabel, i <= (idx ?? 0) && { color: color.ink, fontFamily: font.bodyBold }]}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      {action.simulated && <Meta>Simulated booking, not a real ride{last?.evidence?.ref ? ` · ref ${last.evidence.ref}` : ''}</Meta>}
      {last?.evidence?.note && last.evidence.note !== 'Simulated booking, not a real ride' ? <Meta>{last.evidence.note}</Meta> : null}

      {pending && (canApprove ? (
        <View style={st.btnRow}>
          <Button variant="solid" label="Approve ride" style={{ flex: 1 }} onPress={run(() => api.approve(action._id, me._id))} />
          <Button label="Not now" style={{ flex: 1 }} onPress={run(() => api.reject(action._id, me._id))} />
        </View>
      ) : (
        <Meta>Waiting for {approverName} to approve.</Meta>
      ))}
      {action.status === 'CONFIRMED' && canApprove && (
        <Button small label={`${senior.preferredName} got there`} onPress={run(() => api.complete(action._id, me._id))} />
      )}
    </View>
  );
}

function AppointmentCard({ appt }) {
  const [label, tone] = TRANSPORT[appt.transport] ?? TRANSPORT.unknown;
  return (
    <Card style={{ gap: 6 }}>
      <View style={st.cardHead}>
        <H2 style={{ flex: 1 }}>{appt.title}</H2>
        <Chip label={label} tone={tone} />
      </View>
      <P bold>{when(appt.startsAt)}</P>
      <Meta>{[appt.with, appt.where].filter(Boolean).join(' · ')}</Meta>
    </Card>
  );
}

function Fact({ label, value }) {
  return (
    <View>
      <Text style={st.factLabel}>{label}</Text>
      <Text style={st.factValue}>{value}</Text>
    </View>
  );
}

function Care({ senior, state, me, run, circle }) {
  const [newTask, setNewTask] = useState('');
  const tasks = state.tasks.filter((t) => t.seniorId === senior._id);
  const open = tasks.filter((t) => t.status === 'open');
  const name = (id) => state.members.find((m) => m._id === id)?.name.split(' ')[0] ?? 'Someone';
  const share = circle.map((m) => ({ m, n: tasks.filter((t) => t.status === 'done' && t.assignee === m._id).length }));
  const max = Math.max(1, ...share.map((x) => x.n));
  const about = senior.about.join(' ').toLowerCase();
  const events = state.events.filter((e) => e.tags.some((t) => about.includes(t)) || e.tags.includes('social'));

  const add = () => {
    if (!newTask.trim()) return;
    run(() => api.addTask({ seniorId: senior._id, title: newTask.trim() }))();
    setNewTask('');
  };

  return (
    <>
      <Card>
        <H2>Care tasks</H2>
        {open.length === 0 && <P muted>Nothing open. Add something below.</P>}
        {open.map((t) => <TaskRow key={t._id} t={t} me={me} run={run} name={name} senior={senior} />)}
        <View style={st.addRow}>
          <TextInput style={st.addInput} value={newTask} onChangeText={setNewTask} placeholder="Add a task, like ‘Drop off soup Sunday’" placeholderTextColor={color.muted} returnKeyType="done" onSubmitEditing={add} accessibilityLabel="New task" />
          <Button small label="Add" onPress={add} />
        </View>
      </Card>

      <Card>
        <H2>Who’s been helping this month</H2>
        {share.map(({ m, n }) => (
          <View key={m._id} style={st.shareRow} accessibilityLabel={`${m.name}: ${n} tasks`}>
            <Text style={st.shareName}>{m.name.split(' ')[0]}</Text>
            <View style={st.shareBar}><View style={[st.shareFill, { width: `${(n / max) * 100}%` }]} /></View>
            <Text style={st.shareN}>{n}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <H2>Get her out of the house</H2>
        <Meta>Matched to what she enjoys. Offering a ride adds it to care tasks.</Meta>
        {events.map((e) => (
          <View key={e._id} style={st.row}>
            <View style={{ flex: 1 }}>
              <P bold>{e.title}</P>
              <Meta>{e.when} · {e.where}</Meta>
            </View>
            <Button small label="Offer a ride" onPress={run(() => api.addTask({ seniorId: senior._id, title: `Ride to ${e.title.toLowerCase()} (${e.when})`, type: 'ride', due: e.when }))} />
          </View>
        ))}
      </Card>
    </>
  );
}

function TaskRow({ t, me, run, name, senior }) {
  const ho = t.handoff?.status === 'pending' ? t.handoff : null;
  const who = t.requestedBy === 'peggy' || t.source === 'checkin' ? senior.preferredName : t.requestedBy ? name(t.requestedBy) : null;
  const suggested = !t.assignee && t.suggestedOwner ? t.suggestedOwner : null;

  let buttons;
  if (ho && ho.to === me) {
    buttons = (
      <View style={st.btnRow}>
        <Button small variant="solid" label="Accept" onPress={run(() => api.accept(t._id, me))} />
        <Button small label="Decline" onPress={run(() => api.decline(t._id, me))} />
      </View>
    );
  } else if (ho) {
    buttons = <Meta>Asked {name(ho.to)}, waiting for an answer</Meta>;
  } else if (t.assignee) {
    buttons = <Button small label="Mark done" onPress={run(() => api.done(t._id))} />;
  } else {
    buttons = (
      <View style={st.btnRow}>
        <Button small variant="solid" label="I’ll do it" onPress={run(() => api.claim(t._id, me))} />
        {suggested && suggested !== me && (
          <Button small label={`Ask ${name(suggested)}`} onPress={run(() => api.handoff(t._id, me, suggested))} />
        )}
      </View>
    );
  }

  const meta = [
    t.due,
    t.assignee ? `${t.assignee === me ? 'You have' : `${name(t.assignee)} has`} it` : null,
    ho && ho.to === me ? `${name(ho.from)} asked you` : null,
    suggested ? `Suggested: ${suggested === me ? 'you' : name(suggested)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={[st.taskRow]}>
      <P bold>{t.title}</P>
      {t.quote && who ? <Text style={st.quoteSmall}>{who} said: “{t.quote}”</Text> : null}
      {meta ? <Meta>{meta}</Meta> : null}
      {buttons}
    </View>
  );
}

function Stories({ senior, checkins }) {
  const stories = checkins.flatMap((c) => (c.stories || []).map((s) => ({ ...s, at: c.endedAt })));
  return (
    <Card>
      <H2>{senior.preferredName}’s stories</H2>
      <Meta>Saved from her calls, for the whole family.</Meta>
      {stories.length === 0 && <P muted>Stories she tells on her calls are saved here.</P>}
      {stories.map((s, i) => (
        <View key={i} style={st.story}>
          <P bold>{s.title}</P>
          <Text style={st.quote}>{s.text}</Text>
          <Meta>{ago(s.at)}</Meta>
        </View>
      ))}
    </Card>
  );
}

function Circle({ state, circle }) {
  const texts = state.notifications.filter((n) => circle.some((m) => m._id === n.toId)).slice(0, 8);
  return (
    <>
      <Card>
        <H2>The circle</H2>
        {circle.map((m) => (
          <View key={m._id} style={st.row}>
            <View style={{ flex: 1 }}>
              <P bold>{m.name}</P>
              <Meta>{m.relation}</Meta>
            </View>
            <Text style={[st.clock, !isAwake(m.timezone) && { color: color.muted }]}>{localTime(m.timezone)}{isAwake(m.timezone) ? '' : ' · asleep'}</Text>
          </View>
        ))}
      </Card>
      <Card>
        <H2>Texts sent by Porchlight</H2>
        {texts.length === 0 && <P muted>When Porchlight needs the circle, the texts it sends show up here.</P>}
        {texts.map((n, i) => (
          <View key={i} style={st.text}>
            <Meta>To {n.to.split(' ')[0]}, {ago(n.at)}</Meta>
            <P>{n.text}</P>
          </View>
        ))}
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  tabs: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  pad: { padding: 16, paddingBottom: 48, gap: 14 },
  today: { backgroundColor: color.dusk, borderWidth: 1, borderColor: color.hairline, borderRadius: radius.lg, padding: 20, gap: 14 },
  todayTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summary: { fontFamily: font.body, fontSize: 18, lineHeight: 26, color: color.ink },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  factLabel: { fontFamily: font.body, fontSize: 13, color: color.mutedOnDusk },
  factValue: { fontFamily: font.bodyBold, fontSize: 17, color: color.ink },
  note: { fontFamily: font.body, fontSize: 14, color: color.mutedOnDusk },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepMark: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: color.mutedOnDusk },
  stepDone: { backgroundColor: color.brick, borderColor: color.brick },
  stepDoneAmber: { backgroundColor: color.lamp, borderColor: color.lamp },
  digestLine: { fontFamily: font.displaySemi, fontSize: 18, lineHeight: 24, color: color.ink },
  digestItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  digestDot: { width: 10, height: 10, borderRadius: 5 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  label: { fontFamily: font.bodyBold, color: color.muted },
  steps: { flexDirection: 'row', gap: 6 },
  stepCol: { flex: 1, gap: 4 },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.line },
  stepLabel: { fontFamily: font.body, fontSize: 12, color: color.muted },
  btnRow: { flexDirection: 'row', gap: 10 },
  stepText: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.mutedOnDusk },
  stepWhen: { fontFamily: font.body, fontSize: 13, color: color.mutedOnDusk },
  flag: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: color.hairline, backgroundColor: color.surface, padding: 16, gap: 6 },
  flagScam: { borderColor: color.brick, backgroundColor: color.brickSoft },
  flagTitle: { fontFamily: font.displaySemi, fontSize: 17, color: color.ink },
  starter: { borderLeftWidth: 3, borderLeftColor: color.lamp, paddingLeft: 12 },
  week: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  weekDay: { alignItems: 'center', gap: 2, minWidth: 64, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: color.surface2 },
  weekDot: { width: 16, height: 16, borderRadius: 8 },
  weekLabel: { fontFamily: font.body, fontSize: 14, color: color.ink },
  weekMood: { fontFamily: font.body, fontSize: 12, color: color.muted },
  taskRow: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.line },
  quoteSmall: { fontFamily: font.bodyItalic, fontSize: 16, lineHeight: 22, color: color.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.line },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: color.hairline, backgroundColor: color.surface2, borderRadius: radius.sm, paddingHorizontal: 12, fontFamily: font.body, fontSize: 16, color: color.ink },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareName: { width: 64, fontFamily: font.body, fontSize: 15, color: color.ink },
  shareBar: { flex: 1, height: 10, borderRadius: 5, backgroundColor: color.surface2, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: 5, backgroundColor: color.mutedOnDusk },
  shareN: { width: 24, textAlign: 'right', fontFamily: font.body, fontSize: 15, color: color.muted },
  story: { gap: 4, paddingBottom: 8 },
  quote: { fontFamily: font.bodyItalic, fontSize: 17, lineHeight: 26, color: color.ink },
  clock: { fontFamily: font.body, fontSize: 15, color: color.ink, fontVariant: ['tabular-nums'] },
  text: { backgroundColor: color.surface2, borderRadius: radius.sm, padding: 12, gap: 2 },
});
