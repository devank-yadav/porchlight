import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from './api';
import { HEADER_H, useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { ago } from './useAppState';
import { Appear, Badge, Button, Card, Divider, Dot, Fact, Press, Section, Segmented, T, useSettled } from './design/ui';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { accent, ease, light, radius } from './design/tokens';

const MOOD = { good: 'Cheerful', okay: 'Steady', low: 'A bit down' };

// Pills: we only report what she said. Never a judgement.
const MED = { taken: 'Taken (she said)', not_taken: 'Not yet', unsure: 'Not sure', no_answer: 'No answer', private: 'Private' };
function medLabel(c) {
  if (!c) return null;
  if (c.medStatus && MED[c.medStatus]) return MED[c.medStatus];
  return c.medsTaken === true ? 'Taken (she said)' : c.medsTaken === false ? 'Not yet' : 'No answer';
}

// Daily call schedule (server: voice/schedule.js). Times are the senior's local time.
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const toMin = (hhmm) => { const [h, m] = (hhmm || '10:00').split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
function clock(hhmm) {
  const min = toMin(hhmm);
  const h = Math.floor(min / 60);
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function nextCallLabel(senior) {
  if (senior.autoCall === undefined) return `Tomorrow ${clock(senior.checkinTime)}`; // server without the schedule feature
  if (!senior.autoCall) return 'Not scheduled';
  const days = senior.callDays || ALL_DAYS;
  const tz = senior.timezone || 'America/New_York';
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const nowMin = local.getHours() * 60 + local.getMinutes();
  for (let i = 0; i < 8; i++) {
    const d = (local.getDay() + i) % 7;
    if (!days.includes(d) || (i === 0 && toMin(senior.checkinTime) <= nowMin)) continue;
    return `${i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES[d]} ${clock(senior.checkinTime)}`;
  }
  return 'Not scheduled';
}
// Ring her phone now (the call happens on her phone, not this one).
const callNow = (senior, run) => run(
  () => api.phoneCall(senior._id),
  [`Calling ${senior.preferredName}`, 'Her phone is ringing now. You’ll see what she shared here when the call ends.'],
);

const TRANSPORT = {
  unknown: ['Ride not sorted', 'neutral'],
  self: ['Has a ride', 'green'],
  at_risk: ['Needs a ride', 'lamp'],
  requested: ['Ride requested', 'lamp'],
  confirmed: ['Ride confirmed', 'green'],
};

// Ride steps shown on the approval card.
const STEPS = [
  ['PENDING_APPROVAL', 'Needs OK'],
  ['APPROVED', 'Approved'],
  ['REQUESTED', 'Requested'],
  ['CONFIRMED', 'Confirmed'],
];
const STEP_INDEX = { PENDING_APPROVAL: 0, APPROVED: 1, REQUESTED: 2, CONFIRMED: 3, COMPLETED: 4 };
// Rides booked without a family OK (no PENDING_APPROVAL in history): family is just told she's going.
const AUTO_STEPS = [
  ['REQUESTED', 'Requested'],
  ['CONFIRMED', 'Booked'],
  ['COMPLETED', 'She got there'],
];
const AUTO_INDEX = { APPROVED: 0, REQUESTED: 0, CONFIRMED: 1, COMPLETED: 2 };
const ENDED = { REJECTED: 'Not approved', FAILED: 'Booking failed', CANCELLED: 'Cancelled' };
const TONE = { urgent: 'red', attention: 'lamp', ok: 'green' };

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
  try { return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}
function isAwake(tz) {
  try {
    const h = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
    return h >= 8 && h < 21;
  } catch { return true; }
}
const first = (name) => name?.split(' ')[0];

export default function FamilyScreen({ senior, me }) {
  const { state, run } = useAppContext();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('today');
  const scroller = useRef(null);

  const circle = state.members.filter((m) => m.circleId === senior.circleId);
  const checkins = state.checkins.filter((c) => c.seniorId === senior._id && c.status === 'completed');
  const ctx = { senior, state, me, run, circle, checkins, latestTalk: checkins.find((c) => c.channel !== 'button') };

  const pending = (state.actions || []).filter((a) => a.seniorId === senior._id && a.status === 'PENDING_APPROVAL').length;
  const forMe = state.tasks.filter((t) => t.seniorId === senior._id && t.status === 'open' && (t.handoff?.status === 'pending' ? t.handoff.to === me : !t.assignee)).length;

  const top = insets.top + HEADER_H;
  const change = (t) => { setTab(t); scroller.current?.scrollTo({ y: 0, animated: false }); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroller} contentContainerStyle={[st.pad, { paddingTop: top + 64, paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" scrollIndicatorInsets={{ top: top + 56 }}>
        {tab === 'today' && <Today key="today" {...ctx} />}
        {tab === 'care' && <Care key="care" {...ctx} />}
        {tab === 'stories' && <Stories {...ctx} />}
        {tab === 'circle' && <Circle {...ctx} />}
      </ScrollView>
      {/* Floating tabs on glass, below the header. Content scrolls underneath. */}
      <View style={[st.tabsWrap, { top: top + 8 }]}>
        <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
        <Segmented
          style={{ backgroundColor: 'rgba(236,236,233,0.86)' }}
          options={[
            { id: 'today', label: 'Today', badge: pending || null },
            { id: 'care', label: 'Care', badge: forMe || null },
            { id: 'stories', label: 'Stories' },
            { id: 'circle', label: 'Circle' },
          ]}
          value={tab}
          onChange={change}
        />
      </View>
    </View>
  );
}

// ── Today ───────────────────────────────────────────────────────────────────
function Today({ senior, state, me, run, checkins, latestTalk }) {
  const settled = useSettled();
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
  const name = senior.preferredName;

  const headline =
    escalation ? (isHelp ? `${name} pressed her help button` : `${name}’s check-in is unresolved`)
    : senior.status === 'talking' ? `${name} is talking with Porchlight`
    : latest && new Date(latest.endedAt).toDateString() === new Date().toDateString() ? `${name} checked in ${ago(latest.endedAt)}`
    : `Waiting for ${name}’s check-in`;

  return (
    <>
      <Appear on={settled}>
        <Card tone={escalation ? (isHelp ? 'red' : 'lamp') : undefined} style={[st.hero, isHelp && { backgroundColor: '#FFF7F5' }, escalation && !isHelp && { backgroundColor: '#FFFBF2' }]} accessibilityLiveRegion="polite">
          <View style={st.heroTop}>
            <Lamp state={lamp} size={76} label={headline} />
            <T v="title" style={{ flex: 1 }}>{headline}</T>
          </View>
          {escalation ? (
            <View style={{ gap: 14 }}>
              {!isHelp && <T v="callout" muted>She may just be out or asleep. Porchlight is working down this list.</T>}
              <View style={{ gap: 0 }}>
                {escalation.steps.map((s, i) => (
                  <View key={i} style={st.ladderRow}>
                    <View style={st.ladderRail}>
                      <View style={[st.ladderDot, s.status === 'done' && { backgroundColor: isHelp ? accent.red : accent.lamp, borderColor: isHelp ? accent.red : accent.lamp }]}>
                        {s.status === 'done' ? <Icon name="checkmark" size={9} color="#fff" weight="black" /> : null}
                      </View>
                      {i < escalation.steps.length - 1 && <View style={st.ladderLine} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 12 }}>
                      <T v="callout" style={s.status !== 'done' && { color: light.muted }}>{s.label}</T>
                      <T v="footnote" muted>{s.status === 'done' ? `Sent ${ago(s.at)}` : s.status === 'held' ? 'Held for quiet hours' : 'Next'}</T>
                    </View>
                  </View>
                ))}
              </View>
              <Button variant="primary" icon="checkmark" label={`I reached ${name}, she’s okay`} onPress={run(() => api.resolve(senior._id, me), `Thanks. ${name} is marked okay`)} />
            </View>
          ) : (
            <>
              {latest && <T v="body" style={{ color: light.ink2 }}>{latest.summary}</T>}
              <View style={st.facts}>
                {latest?.mood && <Fact icon="face.smiling" label="Mood" value={MOOD[latest.mood]} />}
                {latest && <Fact icon="pills" label="Pills" value={medLabel(latest)} />}
                <Fact icon="phone" label="Next call" value={nextCallLabel(senior)} />
              </View>
              <Button icon="phone.fill" label={`Call ${name} now`} accessibilityHint={`Porchlight phones ${name} right away for a check-in.`} onPress={callNow(senior, run)} />
              {lastResolved && Date.now() - new Date(lastResolved.resolvedAt).getTime() < 3600000 && (
                <T v="footnote" muted>Earlier alert resolved by {lastResolved.resolvedBy}, {ago(lastResolved.resolvedAt)}.</T>
              )}
            </>
          )}
        </Card>
      </Appear>

      {actions.map((a) => (
        <Appear key={a._id} on={settled}>
          <ActionCard action={a} state={state} me={meMember} run={run} senior={senior} />
        </Appear>
      ))}

      {scamFlags.slice(0, 2).map((f, i) => (
        <Appear key={`s${i}${f.at}`} on={settled}>
          <Card tone="red" style={{ gap: 8 }}>
            <View style={st.cardHead}>
              <Icon name="exclamationmark.shield.fill" size={18} color={accent.red} />
              <T v="headline" style={{ flex: 1, color: accent.redText }}>Possible scam</T>
              <T v="footnote" muted>{ago(f.at)}</T>
            </View>
            <Quote>{f.text}</Quote>
            <T v="callout" muted>Porchlight told her not to send anything. Worth a call today to make sure she didn’t share any details.</T>
          </Card>
        </Appear>
      ))}
      {otherFlags.map((f, i) => (
        <Appear key={`f${i}`} on={settled}>
          <Card tone={f.type === 'urgent' ? 'red' : undefined} style={{ gap: 8 }}>
            <View style={st.cardHead}>
              <Icon name={f.type === 'urgent' ? 'exclamationmark.circle.fill' : f.type === 'lonely' ? 'heart.fill' : 'waveform.path.ecg'} size={17} color={f.type === 'urgent' ? accent.red : light.ink2} />
              <T v="headline" style={{ flex: 1 }}>{f.type === 'urgent' ? 'Needs attention now' : f.type === 'lonely' ? 'She sounded lonely' : 'Different from usual'}</T>
            </View>
            <Quote>{f.text}</Quote>
          </Card>
        </Appear>
      ))}

      {state.digest?.line ? <Appear on={settled}><Digest digest={state.digest} /></Appear> : null}

      {appointments.map((a) => <Appear key={a._id} on={settled}><AppointmentCard appt={a} /></Appear>)}

      <Section title="Things to talk about">
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {latestTalk?.starters?.length ? latestTalk.starters.map((s, i) => (
            <View key={s}>
              {i > 0 && <Divider />}
              <View style={st.starter}>
                <Icon name="bubble.left" size={15} color={light.muted} style={{ marginTop: 3 }} />
                <T v="body" style={{ flex: 1 }}>{s}</T>
              </View>
            </View>
          )) : <T v="callout" muted style={{ paddingVertical: 10 }}>After her next chat, you’ll see ideas here for your own call. A real call beats any app.</T>}
        </Card>
      </Section>

      {week.length > 0 && (
        <Section title="This week">
          <Card style={st.week}>
            {week.map((c) => (
              <View key={c._id} style={st.weekDay} accessible accessibilityLabel={`${new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'long' })}: ${MOOD[c.mood]}`}>
                <View style={[st.weekDot, { backgroundColor: c.mood === 'good' ? accent.lamp : c.mood === 'low' ? accent.red : '#D4D4D8' }]} />
                <T v="footnote" style={{ fontWeight: '600' }}>{new Date(c.endedAt).toLocaleDateString('en-US', { weekday: 'short' })}</T>
                <T v="footnote" muted style={{ fontSize: 11 }}>{MOOD[c.mood]}</T>
              </View>
            ))}
          </Card>
        </Section>
      )}
    </>
  );
}

function Quote({ children, plain }) {
  return (
    <View style={st.quote}>
      <T v="body" style={{ fontStyle: 'italic', color: light.ink2 }}>{plain ? children : `“${children}”`}</T>
    </View>
  );
}

function Digest({ digest }) {
  return (
    <Card style={{ gap: 12 }}>
      <View style={st.cardHead}>
        <Icon name="text.alignleft" size={14} color={light.muted} />
        <T v="label" muted>Today’s digest</T>
      </View>
      <T v="headline" accessibilityRole="header">{digest.line}</T>
      {(digest.items || []).slice(0, 4).map((it, i) => (
        <View key={i} style={st.digestItem}>
          <View style={{ paddingTop: 8 }}><Dot tone={TONE[it.tone]} /></View>
          <T v="callout" style={{ flex: 1, color: light.ink2 }}>{it.text}</T>
        </View>
      ))}
    </Card>
  );
}

function ActionCard({ action, state, me, run, senior }) {
  const approver = state.members.find((m) => m._id === action.approverId);
  const approverName = first(approver?.name) ?? 'the primary contact';
  const auto = !(action.history || []).some((h) => h.status === 'PENDING_APPROVAL') && action.status !== 'PENDING_APPROVAL';
  const steps = auto ? AUTO_STEPS : STEPS;
  const idx = (auto ? AUTO_INDEX : STEP_INDEX)[action.status] ?? 0;
  const ended = ENDED[action.status];
  const pending = action.status === 'PENDING_APPROVAL';
  const canApprove = Boolean(me?.canApprove);
  const last = action.history?.[action.history.length - 1];
  const d = action.details || {};
  const stepLabel = steps[Math.min(idx, steps.length - 1)][1];
  const booked = ['CONFIRMED', 'COMPLETED'].includes(action.status);

  return (
    <Card tone={pending ? 'lamp' : ended ? 'red' : undefined} accessibilityLiveRegion="polite" style={{ gap: 14 }}>
      <View style={st.cardHead}>
        <View style={[st.iconTile, { backgroundColor: pending ? accent.lampSoft : light.sunken }]}>
          <Icon name="car.fill" size={17} color={pending ? accent.lampText : light.ink} />
        </View>
        <T v="headline" style={{ flex: 1 }}>{auto && booked ? `${senior.preferredName}’s ride is booked` : action.title}</T>
        <Badge label={ended ?? (pending ? 'Needs your OK' : stepLabel)} tone={ended ? 'red' : pending ? 'lamp' : booked ? 'green' : 'neutral'} />
      </View>
      {auto && !ended ? <T v="callout" muted>{booked ? `${senior.preferredName} is going. Porchlight booked it and let the family know.` : `Porchlight is booking ${senior.preferredName}’s ride. The family will hear when it’s set.`}</T> : null}
      {action.reason ? <Quote plain>{action.reason}</Quote> : null}

      <View style={{ gap: 8 }}>
        {d.pickupAt && <Detail icon="clock" label="Pickup" value={when(d.pickupAt)} />}
        {d.from && <Detail icon="mappin.circle" label="From" value={d.from} />}
        {d.to && <Detail icon="mappin.and.ellipse" label="To" value={d.to} />}
        {d.needs && <Detail icon="note.text" label="Note" value={d.needs} />}
      </View>

      {!ended && <Progress idx={idx} label={stepLabel} steps={steps} />}

      {action.simulated && (
        <View style={st.simulated} accessibilityLabel="Simulated booking, not a real ride">
          <Icon name="flask" size={13} color={light.muted} />
          <T v="footnote" muted style={{ flex: 1 }}>Simulated booking, not a real ride{last?.evidence?.ref ? ` · ref ${last.evidence.ref}` : ''}</T>
        </View>
      )}
      {last?.evidence?.note && last.evidence.note !== 'Simulated booking, not a real ride' ? <T v="footnote" muted>{last.evidence.note}</T> : null}
      {d.uberLink && !ended && action.status !== 'COMPLETED' ? (
        <T v="footnote" muted>{senior.preferredName} can book a real Uber from her own screen. Nothing for you to do.</T>
      ) : null}

      {pending && (canApprove ? (
        <View style={st.btnRow}>
          <Button variant="primary" icon="checkmark" label="Approve ride" style={{ flex: 1.4 }} onPress={run(() => api.approve(action._id, me._id), ['Ride approved', 'Booking it now. This is a simulated booking, not a real ride.'])} />
          <Button label="Not now" style={{ flex: 1 }} onPress={run(() => api.reject(action._id, me._id), 'Ride not approved')} />
        </View>
      ) : (
        <View style={st.waiting}>
          <Icon name="hourglass" size={14} color={light.muted} />
          <T v="callout" muted>Waiting for {approverName} to approve.</T>
        </View>
      ))}
      {action.status === 'CONFIRMED' && canApprove && (
        <Button size="sm" icon="flag.checkered" label={`${senior.preferredName} got there`} onPress={run(() => api.complete(action._id, me._id), 'Marked as done')} />
      )}
    </Card>
  );
}

// Four-step progress. The fill is one absolutely positioned bar, so its width can animate cheaply.
function Progress({ idx, label, steps = STEPS }) {
  const [w, setW] = useState(0);
  const fill = useSharedValue(0);
  const n = steps.length;
  const done = idx >= n - 1 || steps[Math.min(idx, n - 1)][0] === 'CONFIRMED';
  useEffect(() => {
    if (!w) return;
    fill.set(withTiming(((Math.min(idx, n - 1) + 1) / n) * w, { duration: 400, easing: ease.out }));
  }, [idx, w, fill, n]);
  const style = useAnimatedStyle(() => ({ width: fill.get() }));
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`Status: ${label}`}>
      <View style={st.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[st.trackFill, { backgroundColor: done ? accent.green : light.ink }, style]} />
        {steps.slice(1).map((_, i) => <View key={i} style={[st.tick, { left: `${((i + 1) / n) * 100}%` }]} />)}
      </View>
      <View style={st.stepLabels}>
        {steps.map(([key, l], i) => (
          <Text key={key} style={[st.stepLabel, i <= idx && { color: light.ink, fontWeight: '600' }]}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

function Detail({ icon, label, value }) {
  return (
    <View style={st.detail}>
      <Icon name={icon} size={15} color={light.muted} style={{ marginTop: 2 }} />
      <T v="callout" muted style={{ width: 56 }}>{label}</T>
      <T v="callout" style={{ flex: 1, fontWeight: '500' }}>{value}</T>
    </View>
  );
}

function AppointmentCard({ appt }) {
  const [label, tone] = TRANSPORT[appt.transport] ?? TRANSPORT.unknown;
  const where = [appt.with, appt.where].filter(Boolean).join(' · ');
  return (
    <Card style={{ flexDirection: 'row', gap: 12 }}>
      <View style={[st.iconTile, { backgroundColor: light.sunken }]}><Icon name="calendar" size={16} color={light.ink} /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <T v="headline">{appt.title}</T>
        <T v="callout" style={{ fontWeight: '500' }}>{when(appt.startsAt)}</T>
        {where ? <T v="footnote" muted>{where}</T> : null}
        <Badge label={label} tone={tone} style={{ marginTop: 4 }} />
      </View>
    </Card>
  );
}

// ── Care ────────────────────────────────────────────────────────────────────
function Care({ senior, state, me, run, circle }) {
  const settled = useSettled();
  const [newTask, setNewTask] = useState('');
  const tasks = state.tasks.filter((t) => t.seniorId === senior._id);
  const open = tasks.filter((t) => t.status === 'open');
  const name = (id) => first(state.members.find((m) => m._id === id)?.name) ?? 'Someone';
  const share = circle.map((m) => ({ m, n: tasks.filter((t) => t.status === 'done' && t.assignee === m._id).length }));
  const max = Math.max(1, ...share.map((x) => x.n));
  const about = senior.about.join(' ').toLowerCase();
  const events = state.events.filter((e) => e.tags.some((t) => about.includes(t)) || e.tags.includes('social'));

  const add = () => {
    if (!newTask.trim()) return;
    run(() => api.addTask({ seniorId: senior._id, title: newTask.trim() }), 'Task added')();
    setNewTask('');
  };

  return (
    <>
      <DailyCall senior={senior} run={run} />

      <Section title="Care tasks">
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {open.length === 0 && <T v="callout" muted style={{ paddingVertical: 14 }}>Nothing open. Add something below.</T>}
          {open.map((t, i) => (
            <Appear key={t._id} on={settled}>
              {i > 0 && <Divider />}
              <TaskRow t={t} me={me} run={run} name={name} senior={senior} />
            </Appear>
          ))}
          <Divider />
          <View style={st.addRow}>
            <Icon name="plus.circle.fill" size={22} color={light.faint} />
            <TextInput style={st.addInput} value={newTask} onChangeText={setNewTask} placeholder="Add a task, like ‘Drop off soup Sunday’" placeholderTextColor={light.faint} returnKeyType="done" onSubmitEditing={add} accessibilityLabel="New task" />
            {newTask.trim() ? <Button size="sm" variant="primary" label="Add" onPress={add} /> : null}
          </View>
        </Card>
      </Section>

      <Section title="Who’s been helping this month">
        <Card style={{ gap: 12 }}>
          {share.map(({ m, n }) => (
            <View key={m._id} style={st.shareRow} accessible accessibilityLabel={`${m.name}: ${n} tasks`}>
              <T v="callout" style={{ width: 70 }}>{first(m.name)}</T>
              <View style={st.shareBar}><View style={[st.shareFill, { width: `${(n / max) * 100}%` }]} /></View>
              <T v="callout" muted style={{ width: 22, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{n}</T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Get her out of the house">
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          <T v="footnote" muted style={{ paddingTop: 10, paddingBottom: 6 }}>Matched to what she enjoys. Offering a ride adds it to care tasks.</T>
          {events.map((e, i) => (
            <View key={e._id}>
              {i > 0 && <Divider />}
              <View style={st.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="headline">{e.title}</T>
                  <T v="footnote" muted>{e.when} · {e.where}</T>
                </View>
                <Button size="sm" icon="car" label="Offer a ride" onPress={run(() => api.addTask({ seniorId: senior._id, title: `Ride to ${e.title.toLowerCase()} (${e.when})`, type: 'ride', due: e.when }), 'Added to care tasks')} />
              </View>
            </View>
          ))}
        </Card>
      </Section>
    </>
  );
}

function DailyCall({ senior, run }) {
  const [autoCall, setAutoCall] = useState(!!senior.autoCall);
  const [min, setMin] = useState(toMin(senior.checkinTime));
  const [days, setDays] = useState(senior.callDays || ALL_DAYS);
  const saved = autoCall === !!senior.autoCall && toHHMM(min) === senior.checkinTime
    && [...days].sort().join() === [...(senior.callDays || ALL_DAYS)].sort().join();
  const step = (d) => { haptic.select(); setMin((m) => (m + d + 1440) % 1440); };
  const toggleDay = (d) => { haptic.select(); setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d])); };
  const name = senior.preferredName;

  return (
    <Section title="Daily call">
      <Card style={{ gap: 16 }}>
        <View style={st.cardHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="headline">Call {name} every day</T>
            <T v="footnote" muted>Porchlight phones her for a short chat. Her time.</T>
          </View>
          <Switch value={autoCall} onValueChange={(v) => { haptic.select(); setAutoCall(v); }} trackColor={{ true: accent.green }} accessibilityLabel={`Call ${name} every day`} />
        </View>

        <View style={[st.timeRow, !autoCall && { opacity: 0.4 }]} pointerEvents={autoCall ? 'auto' : 'none'}>
          <Press onPress={() => step(-15)} feedback={null} accessibilityLabel="Fifteen minutes earlier" style={st.stepBtn}><Icon name="minus" size={18} color={light.ink} weight="bold" /></Press>
          <Text style={st.time} accessibilityLabel={`Call time ${clock(toHHMM(min))}`}>{clock(toHHMM(min))}</Text>
          <Press onPress={() => step(15)} feedback={null} accessibilityLabel="Fifteen minutes later" style={st.stepBtn}><Icon name="plus" size={18} color={light.ink} weight="bold" /></Press>
        </View>

        <View style={[st.days, !autoCall && { opacity: 0.4 }]} pointerEvents={autoCall ? 'auto' : 'none'}>
          {DAYS.map((label, d) => {
            const on = days.includes(d);
            return (
              <Press key={d} onPress={() => toggleDay(d)} feedback={null} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={DAY_NAMES[d]} style={[st.day, on && st.dayOn]}>
                <Text style={[st.dayText, on && { color: '#fff' }]}>{label}</Text>
              </Press>
            );
          })}
        </View>

        <View style={st.btnRow}>
          <Button
            variant="primary"
            style={{ flex: 1 }}
            label={saved ? (autoCall ? `Next: ${nextCallLabel(senior)}` : 'Daily call is off') : 'Save schedule'}
            disabled={saved || (autoCall && !days.length)}
            onPress={run(() => api.setSchedule(senior._id, { autoCall, checkinTime: toHHMM(min), callDays: days }), autoCall ? [`Daily call set for ${clock(toHHMM(min))}`, `Porchlight will phone ${name} then.`] : 'Daily call turned off')}
          />
          <Button icon="phone.fill" label="Call now" onPress={callNow(senior, run)} accessibilityHint={`Porchlight phones ${name} right away.`} />
        </View>
      </Card>
    </Section>
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
        <Button size="sm" variant="primary" label="Accept" onPress={run(() => api.accept(t._id, me), `You’ve got it. ${senior.preferredName} will hear who’s helping`)} />
        <Button size="sm" label="Decline" onPress={run(() => api.decline(t._id, me), 'Declined')} />
      </View>
    );
  } else if (ho) {
    buttons = <T v="footnote" muted>Asked {name(ho.to)}, waiting for an answer</T>;
  } else if (t.assignee) {
    buttons = <Button size="sm" icon="checkmark" label="Mark done" style={{ alignSelf: 'flex-start' }} onPress={run(() => api.done(t._id), 'Done. Nice work')} />;
  } else {
    buttons = (
      <View style={st.btnRow}>
        <Button size="sm" variant="primary" label="I’ll do it" onPress={run(() => api.claim(t._id, me), [`You’ve got it`, `${senior.preferredName} will hear who’s helping.`])} />
        {suggested && suggested !== me && (
          <Button size="sm" label={`Ask ${name(suggested)}`} onPress={run(() => api.handoff(t._id, me, suggested), `Asked ${name(suggested)}`)} />
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
    <View style={st.taskRow}>
      <T v="headline">{t.title}</T>
      {t.quote && who ? <T v="callout" style={{ fontStyle: 'italic', color: light.ink2 }}>{who} said: “{t.quote}”</T> : null}
      {meta ? <T v="footnote" muted>{meta}</T> : null}
      {buttons}
    </View>
  );
}

// ── Stories: a family keepsake ─────────────────────────────────────────────
// Each story is kept in her own words. Optional fields from the server (summary, when, place, people,
// theme, askNext) fill in the details; anything missing is simply left out.
const THEME_ICON = {
  love: 'heart', family: 'person.2', work: 'briefcase', home: 'house', travel: 'airplane', food: 'fork.knife',
  faith: 'sparkles', friends: 'person.3', childhood: 'figure.child', music: 'music.note', garden: 'leaf',
};
// While a call is in progress the saved stories don't exist yet (the AI writes them when the call ends),
// so we pick out the lines that sound like a memory as she says them. The real ones replace these at hang-up.
const MEMORY = /remember|used to|when i was|back in|years ago|growing up|my (late )?husband|walt|we met|as a girl/i;
function liveStories(checkin) {
  return (checkin.transcript || [])
    .filter((t) => t.who === 'senior' && MEMORY.test(t.text))
    .map((t) => ({ title: t.text.split(/[.!?]/)[0].slice(0, 48), text: t.text, at: t.at, live: true }));
}
const storyKey = (s) => `${String(s.title || '').toLowerCase().trim()}|${String(s.text || '').toLowerCase().slice(0, 40)}`;
function toldOn(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return 'Told on today’s call';
  if (days === 1) return 'Told on yesterday’s call';
  if (days < 7) return `Told on ${d.toLocaleDateString('en-US', { weekday: 'long' })}’s call`;
  return `Told on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

function Stories({ senior, checkins }) {
  const settled = useSettled();
  const [person, setPerson] = useState(null);
  const name = senior.preferredName;
  const live = checkins.find((c) => c.seniorId === senior._id && c.status === 'in-progress');
  const heard = live ? liveStories(live) : [];

  // Newest first, one copy of each story even if she tells it again.
  const seen = new Set();
  const saved = [];
  for (const c of checkins) {
    if (c.status === 'in-progress' || (c.seniorId && c.seniorId !== senior._id)) continue;
    for (const st0 of c.stories || []) {
      const k = storyKey(st0);
      if (seen.has(k)) continue;
      seen.add(k);
      saved.push({ ...st0, at: st0.at || c.endedAt || c.startedAt });
    }
  }
  const people = [...new Set(saved.flatMap((x) => x.people || []))].slice(0, 8);
  const shown = person ? saved.filter((x) => (x.people || []).includes(person)) : saved;
  const starters = checkins.find((c) => c.seniorId === senior._id && c.starters?.length)?.starters || [];

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <T v="title">{name}’s stories</T>
        <T v="callout" muted>
          {saved.length ? `${saved.length} ${saved.length === 1 ? 'story' : 'stories'} in her own words, saved from her calls.` : 'In her own words, saved from her calls.'}
        </T>
      </View>

      {live && (
        <Appear on={settled}>
          <Card style={{ gap: 10 }} accessibilityLabel={`${name} is on her call now. ${heard.length ? 'New stories show up as she tells them.' : 'Listening.'}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Lamp state="lit" size={22} />
              <T v="headline" style={{ flex: 1 }}>On her call now</T>
              <T v="footnote" muted>Live</T>
            </View>
            <T v="callout" muted>{heard.length ? 'Here’s what she’s sharing. The full story is saved when the call ends.' : 'Listening. Any story she tells will show up here.'}</T>
          </Card>
        </Appear>
      )}
      {heard.map((x, i) => <Appear key={`live-${i}`} on={settled}><StoryCard story={x} name={name} /></Appear>)}

      {people.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }} style={{ marginHorizontal: -4 }}>
          {[null, ...people].map((p) => {
            const on = person === p;
            return (
              <Press key={p ?? 'all'} onPress={() => { haptic.select(); setPerson(p); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p ? `Stories about ${p}` : 'All stories'} style={[st.chip, on && st.chipOn]}>
                <Text style={[st.chipText, on && { color: light.onPrimary }]}>{p ?? 'All'}</Text>
              </Press>
            );
          })}
        </ScrollView>
      )}

      {!live && saved.length === 0 && (
        <Card style={{ gap: 12 }}>
          <View style={[st.iconTile, { backgroundColor: light.sunken }]}><Icon name="book.closed" size={17} color={light.ink} /></View>
          <T v="headline">Her stories will live here</T>
          <T v="callout" muted>When {name} tells a story on a call, Porchlight saves it in her words with who and when, plus a question you can ask her next time.</T>
          {starters[0] ? <Quote plain>{starters[0]}</Quote> : null}
        </Card>
      )}

      {shown.map((x) => <Appear key={storyKey(x)} on={settled}><StoryCard story={x} name={name} /></Appear>)}
    </View>
  );
}

function StoryCard({ story: s, name }) {
  const [open, setOpen] = useState(false);
  const long = String(s.text || '').length > 260;
  const meta = [s.when, s.place].filter(Boolean).join(' · ');
  const ask = s.askNext || (s.people?.[0] ? `Ask her to tell you more about ${s.people[0]}.` : 'Ask her to tell this one again. She’ll love that you remembered.');
  const quote = (
    <View style={st.storyQuote}>
      <Text style={st.quoteMark} accessibilityElementsHidden importantForAccessibility="no">“</Text>
      <Text style={st.storyText} numberOfLines={long && !open ? 6 : undefined}>{s.text}</Text>
      {long ? <T v="footnote" style={{ color: light.ink, fontWeight: '600', marginTop: 6 }}>{open ? 'Show less' : 'Read the whole story'}</T> : null}
    </View>
  );
  const share = () => {
    haptic.tap();
    Share.share({ message: `${s.title}\n\n“${s.text}”\n\n${name}, ${toldOn(s.at).toLowerCase()}. Saved by Porchlight.` }).catch(() => {});
  };
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[st.iconTile, { backgroundColor: light.sunken }]}>
          <Icon name={THEME_ICON[s.theme] || 'book.closed'} size={16} color={light.ink2} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <T v="headline">{s.title}</T>
          {s.summary || meta ? <T v="footnote" muted numberOfLines={2}>{[s.summary, meta].filter(Boolean).join(' · ')}</T> : null}
        </View>
      </View>

      {long ? (
        <Press onPress={() => setOpen((v) => !v)} scaleTo={1} accessibilityLabel={`${name} said: ${s.text}`} accessibilityHint={open ? 'Shows less' : 'Shows the whole story'}>
          {quote}
        </Press>
      ) : <View accessible accessibilityLabel={`${name} said: ${s.text}`}>{quote}</View>}

      {s.people?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {s.people.map((p) => <Badge key={p} label={p} icon="person" />)}
        </View>
      ) : null}

      {ask && !s.live ? (
        <View style={st.askNext} accessible accessibilityLabel={`Next time you talk: ${ask}`}>
          <Icon name="bubble.left" size={15} color={light.ink2} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" muted>Next time you talk</T>
            <T v="callout" style={{ color: light.ink2 }}>{ask}</T>
          </View>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T v="footnote" muted style={{ flex: 1 }}>{s.live ? 'Just now, on today’s call' : toldOn(s.at)}</T>
        {!s.live && <Button size="sm" variant="ghost" icon="square.and.arrow.up" label="Share" accessibilityLabel={`Share ${s.title} with family`} onPress={share} />}
      </View>
    </Card>
  );
}

function Circle({ state, circle }) {
  const texts = state.notifications.filter((n) => circle.some((m) => m._id === n.toId)).slice(0, 8);
  return (
    <>
      <Section title="The circle">
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {circle.map((m, i) => (
            <View key={m._id}>
              {i > 0 && <Divider inset={52} />}
              <View style={st.row}>
                <View style={st.avatar}><Text style={st.avatarText}>{m.name[0]}</Text></View>
                <View style={{ flex: 1, gap: 1 }}>
                  <T v="headline">{m.name}</T>
                  <T v="footnote" muted>{m.relation}</T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 1 }}>
                  <T v="callout" style={{ fontVariant: ['tabular-nums'], color: isAwake(m.timezone) ? light.ink : light.muted }}>{localTime(m.timezone)}</T>
                  {!isAwake(m.timezone) && <T v="footnote" muted>Asleep</T>}
                </View>
              </View>
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Texts sent by Porchlight">
        {texts.length === 0 && <Card><T v="callout" muted>When Porchlight needs the circle, the texts it sends show up here.</T></Card>}
        {texts.map((n, i) => (
          <View key={i} style={st.textMsg}>
            <T v="footnote" muted>To {first(n.to)}, {ago(n.at)}</T>
            <View style={st.textBubble}><T v="callout" style={{ color: '#fff' }}>{n.text}</T></View>
          </View>
        ))}
      </Section>
    </>
  );
}

const st = StyleSheet.create({
  pad: { paddingHorizontal: 16, gap: 16 },
  tabsWrap: { position: 'absolute', left: 16, right: 16, borderRadius: radius.sm + 2, overflow: 'hidden' },
  hero: { gap: 16, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  facts: { flexDirection: 'row', gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ladderRow: { flexDirection: 'row', gap: 12 },
  ladderRail: { alignItems: 'center', width: 18 },
  ladderDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#D4D4D8', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ladderLine: { flex: 1, width: 1.5, backgroundColor: '#E4E4E7', marginVertical: 2 },
  quote: { borderLeftWidth: 2, borderLeftColor: light.lineStrong, paddingLeft: 12 },
  digestItem: { flexDirection: 'row', gap: 10 },
  detail: { flexDirection: 'row', gap: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: light.sunken, overflow: 'hidden' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: '#fff' },
  stepLabels: { flexDirection: 'row' },
  stepLabel: { flex: 1, fontSize: 12, color: light.muted },
  simulated: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: light.sunken, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnRow: { flexDirection: 'row', gap: 10 },
  starter: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, gap: 0 },
  weekDay: { alignItems: 'center', gap: 5, flex: 1 },
  weekDot: { width: 18, height: 18, borderRadius: 9 },
  taskRow: { gap: 7, paddingVertical: 14 },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 54 },
  addInput: { flex: 1, minHeight: 44, fontSize: 16, color: light.ink },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: light.sunken, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: 4, backgroundColor: light.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: light.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: light.lineStrong, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: light.ink, borderColor: light.ink },
  chipText: { fontSize: 15, fontWeight: '600', color: light.ink },
  storyQuote: { paddingLeft: 2 },
  quoteMark: { fontSize: 44, lineHeight: 44, height: 26, color: light.faint, fontWeight: '700', marginBottom: -2 },
  storyText: { fontSize: 19, lineHeight: 28, color: light.ink, fontStyle: 'italic', letterSpacing: -0.2 },
  askNext: { flexDirection: 'row', gap: 10, backgroundColor: light.sunken, borderRadius: radius.sm, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: light.ink },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 40, fontWeight: '700', letterSpacing: -1.5, color: light.ink, fontVariant: ['tabular-nums'] },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  day: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: light.ink },
  dayText: { fontSize: 15, fontWeight: '600', color: light.ink },
  textMsg: { gap: 4, alignItems: 'flex-start' },
  textBubble: { backgroundColor: '#3A3A3F', borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '90%' },
});
