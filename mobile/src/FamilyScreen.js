import { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';
import PlanRow, { upcomingPlans, isToday } from './design/PlanRow';
import { openRoleSheet, openDemoMenu } from './menus';
import { toast } from './design/Toaster';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from './api';
import { useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { ago } from './useAppState';
import { Appear, Badge, Button, Card, Divider, Dot, Fact, Press, Section, Segmented, T, useSettled } from './design/ui';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { accent, light, radius } from './design/tokens';

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
  [`Calling ${senior.preferredName}`, 'The call was requested. Her update will appear when the call ends.'],
);


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

export default function FamilyScreen({ senior, me, page = 'today' }) {
  const ctxApp = useAppContext();
  const { state, run } = ctxApp;
  const insets = useSafeAreaInsets();
  const circle = state.members.filter((m) => m.circleId === senior.circleId);
  const checkins = state.checkins.filter((c) => c.seniorId === senior._id && c.status === 'completed');
  const ctx = { senior, state, me, run, circle, checkins, latestTalk: checkins.find((c) => c.channel !== 'button') };
  const titles = { today: 'Today', plans: 'Plans', family: 'Family', settings: 'Settings' };
  const subtitles = { today: 'A little closer to ' + senior.preferredName + '’s day.', plans: 'What’s coming up. Who’s helping.', family: 'The people and stories that connect you.', settings: 'Make the daily check-in work for you.' };
  return <ScrollView key={page} keyboardShouldPersistTaps="handled" contentContainerStyle={[st.pad, { paddingTop: 28, paddingBottom: Math.max(insets.bottom, 32) }]}>
    <View style={{ gap: 8, marginBottom: 8 }}><T v="display">{titles[page]}</T><T v="body" muted>{subtitles[page]}</T></View>
    {page === 'today' && <Today {...ctx} />}
    {page === 'plans' && <>
      <Section title="Upcoming appointments">
        {upcomingPlans(state, senior).length ? upcomingPlans(state, senior).map((plan) => <PlanRow key={plan._id} plan={plan} senior={senior} state={state} />) : <T muted>No upcoming appointments.</T>}
      </Section>
      {(state.actions || []).filter((a) => a.seniorId === senior._id).map((action) => <ActionCard key={action._id} action={action} state={state} me={circle.find((m) => m._id === me)} run={run} senior={senior} />)}
      <Care {...ctx} />
    </>}
    {page === 'family' && <FamilyDetails {...ctx} />}
    {page === 'settings' && <>
      <DailyCall senior={senior} run={run} />
      <Section title="Your sample profile"><Card><T v="title">{circle.find((m) => m._id === me)?.name}</T><T muted>{circle.find((m) => m._id === me)?.relation}</T><T v="callout" muted>{circle.find((m) => m._id === me)?.seesMeds ? 'Your profile can see medicine details.' : 'Medicine details and call transcripts are private to the primary contact.'}</T><Button label="Switch person" icon="person.crop.circle" onPress={() => openRoleSheet(ctxApp)} /></Card></Section>
      <Section title="About Porchlight"><Card><T v="headline">An AI helper, with family in the loop</T><T v="body" muted>Porchlight shares check-in updates and helps coordinate everyday needs. It does not provide medical advice.</T><T v="callout" muted>All people and organizations in this experience are sample. A simulated booking is not a real ride.</T></Card></Section>
      <Button label="Demo controls" icon="slider.horizontal.3" onPress={() => openDemoMenu(ctxApp)} />
    </>}
  </ScrollView>;
}
function FamilyDetails(ctx) {
  const [section, setSection] = useState('people');
  return <><Segmented options={[{ id: 'people', label: 'People' }, { id: 'stories', label: 'Stories' }]} value={section} onChange={setSection} />
    {section === 'people' ? <Circle {...ctx} /> : <Stories {...ctx} checkins={ctx.state.checkins.filter((c) => c.seniorId === ctx.senior._id)} />}
  </>;
}

function Today({ senior, state, me, run, checkins, latestTalk, circle }) {
  const escalation = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'active');
  const name = senior.preferredName;
  const latest = checkins[0];
  const checkedIn = isToday(senior.lastCheckinAt, senior.timezone);
  const plans = upcomingPlans(state, senior);
  const pending = (state.actions || []).filter((a) => a.seniorId === senior._id && a.status === 'PENDING_APPROVAL');
  const tasks = state.tasks.filter((t) => t.seniorId === senior._id && t.status === 'open' && (!t.assignee || t.assignee === me || t.handoff?.to === me));
  const flags = [...(latestTalk?.flags || []), ...state.scamChecks.filter((s) => s.seniorId === senior._id && s.verdict !== 'probably fine').map((s) => ({ type: 'scam', text: s.description }))];
  const familyPath = (page) => router.push('/family/' + me + '/' + page);
  const memberName = (id) => first(circle.find((m) => m._id === id)?.name) || 'Someone';
  const status = escalation ? escalation.reason === 'help' ? 'Asked for help' : 'Check-in unresolved' : senior.status === 'talking' ? 'On a call now' : checkedIn ? 'Checked in today' : 'Waiting for a check-in';
  return <>
    <View style={st.overview}>
      <View style={st.heroTop}><Lamp state={lampState(senior)} size={48} /><View style={{ flex: 1, gap: 6 }}><T v="title">{name}</T><Badge label={status} tone={escalation ? escalation.reason === 'help' ? 'red' : 'lamp' : checkedIn ? 'green' : 'neutral'} /></View><Button size="sm" label="Call" accessibilityLabel={'Call ' + name} onPress={() => Linking.openURL('tel:' + senior.phone).catch((e) => toast.error('Couldn’t open the phone', { description: e.message }))} /></View>
      <T v="body">{latest?.summary || 'Her next check-in will appear here.'}</T>
      {latest && <T v="footnote" muted>Last update {ago(latest.endedAt)} · Shared by {name}</T>}
    </View>
    {escalation && <Card tone={escalation.reason === 'help' ? 'red' : 'lamp'}>
      <T v="title">{escalation.reason === 'help' ? name + ' needs someone to contact her' : 'Let’s get in touch'}</T>
      <T muted>{escalation.reason === 'help' ? 'She pressed her help button. If there is an emergency, call 911.' : 'A missed call doesn’t tell us why. She may be out or asleep.'}</T>
      {escalation.steps.map((s, i) => <View key={i} style={st.digestItem}><Dot tone={s.status === 'done' ? 'green' : 'lamp'} /><T v="callout" style={{ flex: 1 }}>{s.label} · {s.status === 'done' ? 'Sent ' + ago(s.at) : s.status === 'held' ? 'Held for quiet hours' : 'Next'}</T></View>)}
      <Button variant="primary" label={'I reached ' + name + ', she’s okay'} onPress={run(() => api.resolve(senior._id, me), 'Thanks. Her status is updated.')} />
    </Card>}
    {pending.length > 0 && <Section title="Needs a decision">{pending.map((action) => <ActionCard key={action._id} action={action} state={state} me={circle.find((m) => m._id === me)} run={run} senior={senior} />)}</Section>}
    {flags.length > 0 && <Section title="Worth a conversation">{flags.slice(0, 3).map((f, i) => <Card key={i} tone={['scam','urgent'].includes(f.type) ? 'red' : undefined}><T v="headline">{f.type === 'scam' ? 'Possible scam' : f.type === 'urgent' ? 'Needs attention' : 'Different from usual'}</T><T>{f.text}</T></Card>)}</Section>}
    <Button label={tasks.length ? `View ${tasks.length} open ${tasks.length === 1 ? 'task' : 'tasks'} for you` : 'View shared tasks'} icon="checklist" onPress={() => familyPath('plans')} />
    <Section title="Next on the calendar" action={<Button size="sm" variant="ghost" label="All plans" onPress={() => familyPath('plans')} />}>
      {plans[0] ? <PlanRow plan={plans[0]} senior={senior} state={state} /> : <T muted>No upcoming appointments.</T>}
    </Section>
    <Section title="A hand with the day" action={<Button size="sm" variant="ghost" label="All tasks" onPress={() => familyPath('plans')} />}>
      <Card style={{ paddingVertical: 2 }}>
        {tasks.length ? tasks.slice(0, 2).map((task, i) => <View key={task._id}>{i > 0 && <Divider />}<TaskRow t={task} me={me} run={run} name={memberName} senior={senior} /></View>) : <View style={{ paddingVertical: 16, gap: 6 }}><T v="headline">Nothing waiting on you</T><T v="callout" muted>New requests and family tasks will appear here.</T></View>}
      </Card>
    </Section>
    <Section title="Check-in details"><View style={st.facts}>
      <Fact label="Next AI call" icon="phone" value={nextCallLabel(senior)} />
      {latest?.mood && <Fact label="She sounded" icon="face.smiling" value={MOOD[latest.mood] || latest.mood} />}
      {latest && <Fact label="Medicine" icon="pills" value={medLabel(latest)} />}
    </View>{state.digest?.line && <T v="callout" muted>{state.digest.line}</T>}</Section>
    {latestTalk?.starters?.length > 0 && <Section title="Something to talk about"><T v="body">{latestTalk.starters[0]}</T></Section>}
    {checkins.length > 0 && <Section title="Recent check-ins"><Card>{checkins.slice(0, 7).map((checkin, i) => <View key={checkin._id} style={{ gap: 10 }}>{i > 0 && <Divider />}<T v="callout">{new Date(checkin.endedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: senior.timezone })} · {checkin.channel === 'button' ? 'Checked in with the button' : MOOD[checkin.mood] || 'Daily conversation'}</T></View>)}</Card></Section>}
  </>;
}

function Quote({ children, plain }) {
  return (
    <View style={st.quote}>
      <T v="body" style={{ fontStyle: 'italic', color: light.ink2 }}>{plain ? children : `“${children}”`}</T>
    </View>
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
    <Card tone={pending || ended ? 'lamp' : undefined} accessibilityLiveRegion="polite" style={{ gap: 14 }}>
      <View style={st.cardHead}>
        <View style={[st.iconTile, { backgroundColor: pending ? accent.lampSoft : light.sunken }]}>
          <Icon name="car.fill" size={17} color={pending ? accent.lampText : light.ink} />
        </View>
        <T v="headline" style={{ flex: 1 }}>{auto && booked ? (action.simulated ? 'Demo ride arranged' : `${senior.preferredName}’s ride is booked`) : action.title}</T>
        <Badge label={ended ?? (pending ? 'Needs your OK' : action.simulated ? 'Demo · ' + stepLabel : stepLabel)} tone={ended ? 'lamp' : pending ? 'lamp' : booked ? 'green' : 'neutral'} />
      </View>
      {auto && !ended ? <T v="callout" muted>{action.simulated ? 'This is a sample booking. A real ride still needs confirmation in Uber.' : booked ? `${senior.preferredName}’s ride is confirmed.` : 'The ride request is being processed.'}</T> : null}
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
    fill.set(((Math.min(idx, n - 1) + 1) / n) * w);
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
      <Section title="Shared tasks">
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

      <Section title="Around the neighborhood">
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
// Accept both field spellings while the server shape settles (quote/text, about/people, followUp/askNext).
// quote = her most vivid sentence, exactly as said; text = the memory retold in her words.
const normStory = (s) => {
  const words = s.quote || s.text || '';
  return { ...s, text: words, retold: s.quote && s.text && s.text !== s.quote ? s.text : null, people: s.people || s.about || [], askNext: s.askNext || s.followUp };
};
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

function Stories({ senior, checkins, state, me, run }) {
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
    for (const raw of c.stories || []) {
      const st0 = normStory(raw);
      const k = storyKey(st0);
      if (seen.has(k)) continue;
      seen.add(k);
      saved.push({ ...st0, at: st0.at || c.endedAt || c.startedAt });
    }
  }
  const people = [...new Set(saved.flatMap((x) => x.people || []))].slice(0, 8);
  const shown = person ? saved.filter((x) => (x.people || []).includes(person)) : saved;
  const starters = checkins.find((c) => c.seniorId === senior._id && c.starters?.length)?.starters || [];
  const askerOf = (qText) => {
    const q = qText && (senior.familyQuestions || []).find((f) => f.text === (qText.text || qText));
    return first(state.members.find((m) => m._id === q?.askedBy)?.name);
  };

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

      <FamilyQuestions senior={senior} state={state} me={me} run={run} />

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

      {shown.map((x) => <Appear key={storyKey(x)} on={settled}><StoryCard story={x} name={name} asker={askerOf(x.question)} /></Appear>)}
    </View>
  );
}

// Family questions: Porchlight asks one on her next call, and her answer is saved as a story under it.
function FamilyQuestions({ senior, state, me, run }) {
  const [text, setText] = useState('');
  const name = senior.preferredName;
  const open = (senior.familyQuestions || []).filter((q) => !q.answeredAt && !q.answeredCheckinId);
  const who = (id) => first(state.members.find((m) => m._id === id)?.name) ?? 'Family';
  const send = () => {
    const t = text.trim();
    if (!t) return;
    run(async () => { await api.addQuestion(senior._id, t, typeof me === 'string' ? me : me?._id); setText(''); }, [`Porchlight will ask ${name}`, 'On her next call. Her answer is saved here.'])();
  };
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <T v="headline">Questions for {name}</T>
        <T v="footnote" muted>Porchlight asks one on her next call, and saves her answer here.</T>
      </View>
      <View style={st.askBox}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask her about her first job…"
          placeholderTextColor={light.faint}
          style={st.askInput}
          returnKeyType="send"
          onSubmitEditing={send}
          accessibilityLabel={`A question for ${name}`}
          maxLength={200}
        />
        <Button size="sm" variant="primary" icon="arrow.up" label="Ask" accessibilityLabel={`Ask ${name} on her next call`} onPress={send} disabled={!text.trim()} />
      </View>
      {open.map((q) => (
        <View key={q._id} style={st.qRow}>
          <Icon name="clock" size={14} color={light.muted} style={{ marginTop: 3 }} />
          <View style={{ flex: 1, gap: 1 }}>
            <T v="callout">{q.text}</T>
            <T v="footnote" muted>{who(q.askedBy)} asked · on her next call</T>
          </View>
          <Press onPress={run(() => api.deleteQuestion(senior._id, q._id), 'Question removed')} accessibilityRole="button" accessibilityLabel={`Remove the question: ${q.text}`} style={st.qRemove}>
            <Icon name="xmark" size={12} color={light.muted} />
          </Press>
        </View>
      ))}
    </Card>
  );
}

function StoryCard({ story: s, name, asker }) {
  const [open, setOpen] = useState(false);
  const long = String(s.text || '').length > 260;
  const meta = [s.when, s.place].filter(Boolean).join(' · ');
  const ask = s.askNext || (s.people?.[0] ? `Ask her to tell you more about ${s.people[0]}.` : 'Ask her to tell this one again. She’ll love that you remembered.');
  const quote = (
    <View style={st.storyQuote}>
      <Text style={st.quoteMark} accessibilityElementsHidden importantForAccessibility="no">“</Text>
      <Text style={st.storyText} numberOfLines={long && !open ? 6 : undefined}>{s.text}</Text>
      {long ? <T v="footnote" style={{ color: light.ink, fontWeight: '600', marginTop: 6 }}>{open ? 'Show less' : 'Read the whole story'}</T> : null}
      {s.retold ? <T v="callout" style={{ color: light.ink2, marginTop: 10 }}>{s.retold}</T> : null}
    </View>
  );
  const share = () => {
    haptic.tap();
    Share.share({ message: `${s.title}\n\n“${s.text}”${s.retold ? `\n\n${s.retold}` : ""}\n\n${name}, ${toldOn(s.at).toLowerCase()}. Saved by Porchlight.` }).catch(() => {});
  };
  return (
    <Card style={{ gap: 14 }}>
      {s.question ? (
        <View style={st.answering}>
          <Icon name="questionmark.bubble" size={14} color={light.muted} style={{ marginTop: 1 }} />
          <T v="footnote" muted style={{ flex: 1 }}>Answering {asker ? `${asker}’s` : 'a family'} question: “{s.question.text || s.question}”</T>
        </View>
      ) : null}
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
        <View style={st.askNext} accessible accessibilityLabel={`Ask her more: ${ask}`}>
          <Icon name="bubble.left" size={15} color={light.ink2} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" muted>Ask her more</T>
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
      <Section title="Your people">
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
                  {!isAwake(m.timezone) && <T v="footnote" muted>Quiet hours</T>}
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
  pad: { paddingHorizontal: 24, gap: 24, width: '100%', maxWidth: 760, alignSelf: 'center' }, overview: { backgroundColor: light.surface, borderRadius: radius.md, padding: 16, gap: 8 },
  tabsWrap: { position: 'absolute', left: 16, right: 16, borderRadius: radius.sm + 2, overflow: 'hidden' },
  hero: { gap: 16, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ladderRow: { flexDirection: 'row', gap: 12 },
  ladderRail: { alignItems: 'center', width: 18 },
  ladderDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#D4D4D8', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ladderLine: { flex: 1, width: 1.5, backgroundColor: '#E4E4E7', marginVertical: 2 },
  quote: { paddingVertical: 8 },
  digestItem: { flexDirection: 'row', gap: 10 },
  detail: { flexDirection: 'row', gap: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: light.sunken, overflow: 'hidden' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: '#fff' },
  stepLabels: { flexDirection: 'row' },
  stepLabel: { flex: 1, fontSize: 12, color: light.muted },
  simulated: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: light.sunken, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: light.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: light.lineStrong, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: light.ink, borderColor: light.ink },
  chipText: { fontSize: 15, fontWeight: '600', color: light.ink },
  storyQuote: { paddingLeft: 2 },
  quoteMark: { fontSize: 44, lineHeight: 44, height: 26, color: light.faint, fontWeight: '700', marginBottom: -2 },
  storyText: { fontSize: 19, lineHeight: 28, color: light.ink, fontStyle: 'italic', letterSpacing: -0.2 },
  askBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: light.sunken, borderRadius: radius.sm, paddingLeft: 12, paddingRight: 6, minHeight: 48 },
  askInput: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 44, fontSize: 16, color: light.ink },
  qRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  qRemove: { width: 44, height: 44, borderRadius: 22, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  answering: { flexDirection: 'row', gap: 6 },
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
