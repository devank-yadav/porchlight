import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import * as Calendar from 'expo-calendar/legacy';
import PlanRow, { upcomingPlans, isToday } from './design/PlanRow';
import { openRoleSheet, openDemoMenu } from './menus';
import { toast } from './design/Toaster';
import { api } from './api';
import { useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import MedsList, { MedsSummary } from './meds/MedsList';
import { ago } from './useAppState';
import { Appear, Avatar, Button, Card, Chip, Divider, HeroCard, IconTile, LargeTitle, ListGroup, ListRow, Press, Screen, SectionHeader, Segmented, T, useSettled } from './design/ui';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { accent, ease, light, radius, shadow } from './design/tokens';

const MOOD = { good: 'Cheerful', okay: 'Steady', low: 'A bit down' };

// Pills: we only report what she said. Never a judgement.
const MED = { taken: 'Taken (she said)', not_taken: 'Not yet', unsure: 'Not sure', no_answer: 'No answer', private: 'Private' };
function medLabel(c) {
  if (!c) return null;
  if (c.medStatus && MED[c.medStatus]) return MED[c.medStatus];
  return c.medsTaken === true ? 'Taken (she said)' : c.medsTaken === false ? 'Not yet' : 'No answer';
}

// Today's doses from her pill reminders (meds/), which beat what she said on the call.
function pillsLabel(state, senior) {
  const doses = (state.medsToday || []).filter((d) => d.seniorId === senior._id);
  if (!doses.length) return null;
  const missed = doses.filter((d) => d.status === 'missed').length;
  const taken = doses.filter((d) => d.status === 'taken').length;
  if (missed) return [`${missed} ${missed === 1 ? 'dose' : 'doses'} missed`, 'lamp'];
  return [taken === doses.length ? 'All pills taken' : `Pills: ${taken} of ${doses.length} taken`, 'night'];
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

const tzOf = (senior) => senior?.timezone || 'America/New_York';
const dayKey = (t, tz) => new Date(t).toLocaleDateString('en-US', { timeZone: tz });
const timeIn = (iso, tz) => new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
function when(iso, tz) {
  if (!iso) return '';
  const day = relDay(iso, tz);
  return `${day} ${timeIn(iso, tz)}`;
}
// Today / Tomorrow / Thursday (this week) / Mon, Oct 20.
function relDay(iso, tz) {
  const key = dayKey(iso, tz);
  if (key === dayKey(Date.now(), tz)) return 'Today';
  if (key === dayKey(Date.now() + 86400000, tz)) return 'Tomorrow';
  const days = (new Date(iso).getTime() - Date.now()) / 86400000;
  return new Date(iso).toLocaleDateString('en-US', days > 0 && days < 6 ? { timeZone: tz, weekday: 'long' } : { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
}
// "today’s call", "yesterday’s call", "Friday’s call", "the Oct 3 call".
function callDay(iso) {
  if (!iso) return 'her latest call';
  const d = new Date(iso);
  const days = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days <= 0) return 'today’s call';
  if (days === 1) return 'yesterday’s call';
  if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })}’s call`;
  return `the ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} call`;
}
function localTime(tz) {
  try { return new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}
function tzShort(tz) {
  try { return new Date().toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(/\s+/).pop(); } catch { return ''; }
}
function isAwake(tz) {
  try {
    const h = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
    return h >= 8 && h < 21;
  } catch { return true; }
}
const first = (name) => name?.split(' ')[0];
const tidy = (text) => String(text || '').replace(/\s+/g, ' ').trim();
// Re-renders once a minute so "today", local times and the week stay current.
function useNow(ms = 60000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

// Her quotes read like a journal: Apple's system serif (New York) on iOS.
const SERIF = Platform.select({ ios: 'ui-serif', web: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif', default: 'serif' });

export default function FamilyScreen({ senior, me, page = 'today' }) {
  const app = useAppContext();
  const { state, run } = app;
  const circle = state.members.filter((m) => m.circleId === senior.circleId);
  const checkins = state.checkins.filter((c) => c.seniorId === senior._id && c.status === 'completed');
  const ctx = { senior, state, me, run, circle, checkins, latestTalk: checkins.find((c) => c.channel !== 'button'), app };
  return (
    <Screen>
      {page === 'today' && <Today {...ctx} />}
      {page === 'plans' && <Plans {...ctx} />}
      {page === 'family' && <FamilyDetails {...ctx} />}
      {page === 'settings' && <Settings {...ctx} />}
    </Screen>
  );
}

// A section: 20pt title, an optional link or detail on the right, then its content.
function Block({ title, action, onAction, right, sub, children, style }) {
  return (
    <View style={[{ gap: 12 }, style]}>
      <View style={{ gap: 2 }}>
        <View style={st.blockHead}>
          <SectionHeader title={title} action={action} onAction={onAction} style={{ flex: 1 }} />
          {right}
        </View>
        {sub ? <T v="footnote" muted style={{ paddingHorizontal: 2 }}>{sub}</T> : null}
      </View>
      {children}
    </View>
  );
}

function CountPill({ n }) {
  return (
    <View style={st.count} accessibilityLabel={`${n} ${n === 1 ? 'item' : 'items'}`}>
      <Text style={st.countText}>{n}</Text>
    </View>
  );
}

function EmptyNote({ icon, title, text }) {
  return (
    <Card style={st.empty}>
      <IconTile icon={icon} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <T v="headline">{title}</T> : null}
        <T v="callout" muted>{text}</T>
      </View>
    </Card>
  );
}

// ── Today ───────────────────────────────────────────────────────────────────
function Today({ senior, state, me, run, checkins, latestTalk, circle }) {
  const tz = tzOf(senior);
  const escalation = state.escalations.find((e) => e.seniorId === senior._id && e.status === 'active');
  const name = senior.preferredName;
  const latest = checkins[0];
  const checkedIn = isToday(senior.lastCheckinAt, tz);
  const plans = upcomingPlans(state, senior);
  const pending = (state.actions || []).filter((a) => a.seniorId === senior._id && a.status === 'PENDING_APPROVAL');
  const tasks = state.tasks.filter((t) => t.seniorId === senior._id && t.status === 'open' && (!t.assignee || t.assignee === me || t.handoff?.to === me));
  const flags = [
    ...(latestTalk?.flags || []).map((f) => ({ ...f, from: 'call', at: latestTalk.endedAt })),
    ...state.scamChecks.filter((s) => s.seniorId === senior._id && s.verdict !== 'probably fine').map((s) => ({ type: 'scam', text: s.description, from: 'check' })),
  ].slice(0, 3);
  const familyPath = (page) => router.push('/family/' + me + '/' + page);
  const memberName = (id) => first(circle.find((m) => m._id === id)?.name) || 'Someone';
  const needs = (escalation ? 1 : 0) + pending.length + flags.length + tasks.length;
  const starters = talkStarters(checkins, latestTalk);
  const date = new Date().toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' });
  const settled = useSettled();

  return <>
    <Appear on index={0}><LargeTitle title="Today" subtitle={`${name} · ${date}`} /></Appear>
    <Appear on index={1}><PorchHero senior={senior} state={state} viewer={circle.find((m) => m._id === me)} latest={latest} escalation={escalation} checkedIn={checkedIn} /></Appear>

    <Appear on index={2}>
      <Block title="Needs you" right={needs ? <CountPill n={needs} /> : null}>
        {escalation && <Appear on={settled}><EscalationCard escalation={escalation} senior={senior} me={me} run={run} /></Appear>}
        {pending.map((action) => <Appear key={action._id} on={settled}><ActionCard action={action} state={state} me={circle.find((m) => m._id === me)} run={run} senior={senior} /></Appear>)}
        {flags.length > 0 && <Appear on={settled}><FlagsCard flags={flags} name={name} /></Appear>}
        {tasks.length > 0 && (
          <Appear on={settled}>
            <Card style={st.listCard}>
              {tasks.slice(0, 3).map((task, i) => <View key={task._id}>{i > 0 && <Divider inset={48} />}<TaskRow t={task} me={me} run={run} name={memberName} senior={senior} /></View>)}
              <Divider />
              <Press onPress={() => familyPath('plans')} scaleTo={0.98} accessibilityLabel={tasks.length > 3 ? `See all ${tasks.length} tasks for you` : 'See all shared tasks'} style={st.moreRow}>
                <T v="callout" style={{ flex: 1, fontWeight: '600' }}>{tasks.length > 3 ? `See all ${tasks.length} tasks for you` : 'See all shared tasks'}</T>
                <Icon name="chevron.right" size={13} color={light.faint} weight="bold" />
              </Press>
            </Card>
          </Appear>
        )}
        {needs === 0 && (
          <Card style={st.empty}>
            <IconTile icon="checkmark" tone="green" size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="headline">Nothing waiting on you</T>
              <T v="callout" muted>New requests and family tasks will appear here.</T>
            </View>
            <Button size="sm" variant="soft" label="All tasks" onPress={() => familyPath('plans')} />
          </Card>
        )}
      </Block>
    </Appear>

    <MedsSummary senior={senior} state={state} viewer={circle.find((m) => m._id === me)} onOpen={() => familyPath('plans')} />

    <Appear on index={3}>
      <Block title="Coming up" action="All plans" onAction={() => familyPath('plans')}>
        {plans.length ? (
          <ListGroup>{plans.slice(0, 3).map((plan) => <PlanRow key={plan._id} plan={plan} senior={senior} state={state} />)}</ListGroup>
        ) : <EmptyNote icon="calendar" text="No upcoming appointments." />}
      </Block>
    </Appear>

    <Appear on index={4}><Week checkins={checkins} tz={tz} /></Appear>

    {starters.length > 0 && (
      <Appear on index={5}>
        <Block title="Something to talk about">
          <Starters items={starters} />
        </Block>
      </Appear>
    )}
  </>;
}

// The porch light at dusk: the one dark card on the screen, and the single most important line.
function PorchHero({ senior, state, viewer, latest, escalation, checkedIn }) {
  const tz = tzOf(senior);
  const name = senior.preferredName;
  const help = escalation?.reason === 'help';
  const [label, tone, icon] = help ? ['Asked for help', 'red', 'hand.raised.fill']
    : escalation ? ['Check-in unresolved', 'lamp', 'exclamationmark.circle.fill']
    : senior.status === 'talking' ? ['On a call now', 'lamp', 'phone.fill']
    : checkedIn ? [`Checked in · ${timeIn(senior.lastCheckinAt, tz)}`, 'green', 'checkmark']
    : ['Waiting for a check-in', 'night', 'clock'];
  const summary = help ? `${name} pressed her help button. Please reach her now.`
    : escalation ? 'We haven’t heard from her yet today. She may be out or asleep.'
    : latest?.summary || 'Her next check-in will appear here.';
  const med = viewer?.seesMeds === false ? 'Private' : medLabel(latest);
  const pills = pillsLabel(state, senior);
  const call = () => Linking.openURL('tel:' + senior.phone).catch((e) => toast.error('Couldn’t open the phone', { description: e.message }));

  return (
    <HeroCard glowAt="left" tone={help ? 'red' : 'lamp'} style={st.hero}>
      <View style={st.heroTop}>
        <Lamp state={lampState(senior)} size={76} label={`Porch light: ${label}`} />
        <View style={{ flex: 1, gap: 8 }}>
          <T v="largeTitle" style={st.heroName}>{name}</T>
          <Chip label={label} icon={icon} tone={tone} />
        </View>
      </View>
      <T v="body" style={st.heroSummary}>{summary}</T>
      <View style={st.chips}>
        {latest?.mood ? <Chip label={MOOD[latest.mood] || latest.mood} icon="face.smiling" tone={latest.mood === 'low' ? 'lamp' : 'night'} /> : null}
        {med === 'Private' ? <Chip label="Medicine private" icon="lock.fill" />
          : pills ? <Chip label={pills[0]} icon="pills.fill" tone={pills[1]} />
          : med ? <Chip label={`Medicine: ${med.replace('Taken (she said)', 'taken, she said').toLowerCase()}`} icon="pills.fill" /> : null}
        <Chip label={`Next call ${nextCallLabel(senior)}`.replace('Next call Not scheduled', 'No call scheduled')} icon="phone.fill" />
      </View>
      <View style={st.heroFoot}>
        <T v="footnote" muted style={{ flex: 1 }}>{latest ? `Updated ${ago(latest.endedAt)}\nShared by ${name}` : `${name}’s updates show here`}</T>
        <Button variant="primary" icon="phone.fill" label={`Call ${name}`} accessibilityLabel={'Call ' + name} onPress={call} />
      </View>
    </HeroCard>
  );
}

function EscalationCard({ escalation, senior, me, run }) {
  const name = senior.preferredName;
  const help = escalation.reason === 'help';
  return (
    <Card tone={help ? 'red' : 'lamp'} style={{ gap: 16 }} accessibilityLiveRegion="polite">
      <View style={st.cardHead}>
        <IconTile icon={help ? 'hand.raised.fill' : 'phone.arrow.up.right'} tone={help ? 'red' : 'lamp'} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="headline">{help ? name + ' needs someone to contact her' : 'Let’s get in touch'}</T>
          <T v="callout" muted>{help ? 'She pressed her help button. If there is an emergency, call 911.' : 'A missed call doesn’t tell us why. She may be out or asleep.'}</T>
        </View>
      </View>
      <View style={st.ladder}>
        {escalation.steps.map((s, i) => (
          <View key={i} style={st.ladderRow}>
            <View style={st.ladderRail}>
              <View style={[st.ladderDot, { backgroundColor: s.status === 'done' ? accent.green : s.status === 'held' ? light.faint : accent.lamp }]} />
              {i < escalation.steps.length - 1 ? <View style={st.ladderLine} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: i < escalation.steps.length - 1 ? 12 : 0 }}>
              <T v="callout" style={{ fontWeight: '600' }}>{s.label}</T>
              <T v="footnote" muted>{s.status === 'done' ? 'Sent ' + ago(s.at) : s.status === 'held' ? 'Held for quiet hours' : 'Next'}</T>
            </View>
          </View>
        ))}
      </View>
      <Button variant="primary" icon="checkmark" label={'I reached ' + name + ', she’s okay'} onPress={run(() => api.resolve(senior._id, me), 'Thanks. Her status is updated.')} />
    </Card>
  );
}

const FLAG = {
  scam: ['Possible scam', 'exclamationmark.shield.fill', 'red'],
  urgent: ['Needs attention', 'exclamationmark.triangle.fill', 'red'],
};
function FlagsCard({ flags, name }) {
  const urgent = flags.some((f) => FLAG[f.type]);
  return (
    <Card tone={urgent ? 'red' : 'lamp'} style={st.listCard}>
      {flags.map((f, i) => {
        const [title, icon, tone] = FLAG[f.type] ?? ['Different from usual', 'sparkles', 'lamp'];
        return (
          <View key={i}>
            {i > 0 && <Divider inset={52} />}
            <View style={st.flagRow} accessible accessibilityLabel={`${title}. ${f.text}`}>
              <IconTile icon={icon} tone={tone} size={40} />
              <View style={{ flex: 1, gap: 4 }}>
                <T v="headline">{title}</T>
                <T v="callout" style={{ color: light.ink2 }}>{f.type === 'scam' ? `“${tidy(f.text)}”` : tidy(f.text)}</T>
                <T v="footnote" muted>{f.from === 'check' ? `${name} checked it with Porchlight` : `From ${callDay(f.at)}`}</T>
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

// The last seven days, one dot each. Tap a day to hear how it went.
function Week({ checkins, tz }) {
  const now = useNow();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const t = now - i * 86400000;
    const key = dayKey(t, tz);
    const items = checkins.filter((c) => c.endedAt && dayKey(c.endedAt, tz) === key);
    days.push({
      key, today: i === 0, items,
      letter: new Date(t).toLocaleDateString('en-US', { timeZone: tz, weekday: 'narrow' }),
      num: new Date(t).toLocaleDateString('en-US', { timeZone: tz, day: 'numeric' }),
      long: new Date(t).toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }),
    });
  }
  const count = days.filter((d) => d.items.length).length;
  return (
    <Block title="This week" right={<T v="callout" muted>{count} of 7 days</T>}>
      <Card style={{ gap: 16, paddingHorizontal: 12, paddingTop: 18, paddingBottom: 16 }}>
        <View style={st.week}>{days.map((d) => <WeekDay key={d.key} d={d} />)}</View>
        <View style={st.legend}>
          <Legend color={accent.lamp} label="Talked" />
          <Legend color={accent.lampSoft} label="Button" ring />
          <Legend color={light.sunken} label="No check-in" />
        </View>
      </Card>
    </Block>
  );
}
function Legend({ color, label, ring }) {
  return <View style={st.legendItem}><View style={[st.legendDot, { backgroundColor: color }, ring && st.ring]} /><T v="footnote" muted>{label}</T></View>;
}
function WeekDay({ d }) {
  const talk = d.items.find((c) => c.channel !== 'button');
  const kind = talk ? 'talk' : d.items.length ? 'button' : 'none';
  const said = talk ? (MOOD[talk.mood] ? `Talked, sounded ${MOOD[talk.mood].toLowerCase()}` : 'Daily conversation') : d.items.length ? 'Checked in with the button' : d.today ? 'No check-in yet' : 'No check-in';
  const show = () => toast.info(d.today ? 'Today' : d.long, { description: talk?.summary || said + '.' });
  return (
    <Press onPress={show} feedback="select" scaleTo={0.92} accessibilityLabel={`${d.long}: ${said}`} accessibilityHint="Shows how the day went" style={st.weekDay}>
      <Text style={[st.weekLetter, d.today && { color: light.ink }]}>{d.letter}</Text>
      <View style={[st.weekDot, kind === 'talk' && { backgroundColor: accent.lamp }, kind === 'button' && st.weekButton, d.today && st.weekToday]}>
        {kind !== 'none' ? <Icon name="checkmark" size={14} weight="bold" color={kind === 'talk' ? accent.lampInk : accent.lampText} /> : null}
      </View>
      <Text style={[st.weekNum, d.today && { color: light.ink, fontWeight: '700' }]}>{d.num}</Text>
    </Press>
  );
}

// Talk starters from her latest call, plus "ask her more" prompts from the stories she told.
function talkStarters(checkins, latestTalk) {
  const out = [];
  const seen = new Set();
  const add = (text, from, icon) => {
    const k = String(text || '').toLowerCase().trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ text, from, icon });
  };
  (latestTalk?.starters || []).forEach((s) => add(s, `From ${callDay(latestTalk.endedAt)}`, 'bubble.left.and.bubble.right.fill'));
  for (const c of checkins) for (const raw of c.stories || []) { const s = normStory(raw); add(s.askNext, `About “${s.title}”`, THEME_ICON[s.theme] || 'book.closed.fill'); }
  return out.slice(0, 5);
}
function Starters({ items }) {
  const { width } = useWindowDimensions();
  const full = Math.min(width, 680) - 40;
  const w = items.length === 1 ? full : Math.min(276, full - 44);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={w + 12}
      snapToAlignment="start"
      disableIntervalMomentum
      scrollEnabled={items.length > 1}
      style={{ marginHorizontal: -20, marginVertical: -12, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}
    >
      {items.map((s, i) => (
        <View key={i} style={[st.starter, shadow.card, { width: w }]} accessible accessibilityLabel={`Something to talk about: ${s.text} ${s.from}`}>
          <IconTile icon={s.icon} tone="lamp" size={36} style={{ borderRadius: 11 }} />
          <T v="body" style={{ flex: 1, fontWeight: '500' }}>{s.text}</T>
          <T v="footnote" muted numberOfLines={1}>{s.from}</T>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Plans ───────────────────────────────────────────────────────────────────
function Plans(ctx) {
  const { senior, state, me, run, circle } = ctx;
  const actions = (state.actions || []).filter((a) => a.seniorId === senior._id);
  return <>
    <LargeTitle title="Plans" subtitle={`What’s coming up for ${senior.preferredName}, and who’s helping.`} />
    <Timeline senior={senior} state={state} />
    {actions.length > 0 && (
      <Block title="Rides">
        {actions.map((action) => <ActionCard key={action._id} action={action} state={state} me={circle.find((m) => m._id === me)} run={run} senior={senior} />)}
      </Block>
    )}
    <MedsList senior={senior} state={state} viewer={circle.find((m) => m._id === me)} refresh={ctx.app.refresh} />
    <Care {...ctx} />
  </>;
}

function Quote({ children }) {
  return (
    <View style={st.quote}>
      <T v="callout" style={{ fontStyle: 'italic', color: light.ink2 }}>{children}</T>
    </View>
  );
}

function ActionCard({ action, state, me, run, senior }) {
  const tz = tzOf(senior);
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
  const details = [
    d.pickupAt && ['clock', 'Pickup', when(d.pickupAt, tz)],
    d.from && ['house', 'From', d.from],
    d.to && ['mappin.and.ellipse', 'To', d.to],
    d.needs && ['note.text', 'Note', d.needs],
  ].filter(Boolean);

  return (
    <Card tone={pending || ended ? 'lamp' : undefined} accessibilityLiveRegion="polite" style={{ gap: 16 }}>
      <View style={st.cardHead}>
        <IconTile icon="car.fill" tone={pending ? 'amber' : booked ? 'green' : 'lamp'} size={44} />
        <View style={{ flex: 1, gap: 6 }}>
          <T v="headline">{auto && booked ? (action.simulated ? 'Demo ride arranged' : `${senior.preferredName}’s ride is booked`) : action.title}</T>
          <Chip label={ended ?? (pending ? 'Needs your OK' : action.simulated ? 'Demo · ' + stepLabel : stepLabel)} icon={booked ? 'checkmark' : pending ? 'hand.raised.fill' : undefined} tone={ended || pending ? 'lamp' : booked ? 'green' : 'neutral'} />
        </View>
      </View>
      {auto && !ended && !action.simulated ? <T v="callout" muted>{booked ? `${senior.preferredName}’s ride is confirmed.` : 'The ride request is being processed.'}</T> : null}
      {action.reason ? <Quote>{action.reason}</Quote> : null}

      {details.length ? (
        <View style={st.details}>
          {details.map(([icon, label, value], i) => (
            <View key={label}>
              {i > 0 && <View style={st.detailLine} />}
              <View style={st.detail} accessible accessibilityLabel={`${label}: ${value}`}>
                <Icon name={icon} size={15} color={light.muted} />
                <T v="callout" muted style={{ width: 54 }}>{label}</T>
                <T v="callout" style={{ flex: 1, fontWeight: '600' }}>{value}</T>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {!ended && <Progress idx={idx} label={stepLabel} steps={steps} />}

      {action.simulated && (
        <View style={st.simulated} accessibilityLabel="Simulated booking, not a real ride">
          <Icon name="flask" size={13} color={light.muted} />
          <T v="footnote" muted style={{ flex: 1 }}>Simulated booking, not a real ride{last?.evidence?.ref ? ` · ref ${last.evidence.ref}` : ''}</T>
        </View>
      )}
      {last?.evidence?.note && last.evidence.note !== 'Simulated booking, not a real ride' && !action.reason ? <T v="footnote" muted>{last.evidence.note}</T> : null}
      {d.uberLink && !ended && action.status !== 'COMPLETED' ? (
        <View style={st.uberNote}>
          <Icon name="iphone" size={15} color={accent.lampText} />
          <T v="footnote" style={{ flex: 1, color: accent.lampText }}>{senior.preferredName} can book a real Uber from her own screen. Nothing for you to do.</T>
        </View>
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
        <Button icon="flag.checkered" label={`${senior.preferredName} got there`} onPress={run(() => api.complete(action._id, me._id), 'Marked as done')} />
      )}
    </Card>
  );
}

// Step progress. The fill is one absolutely positioned bar, so its width can animate cheaply.
function Progress({ idx, label, steps = STEPS }) {
  const [w, setW] = useState(0);
  const fill = useSharedValue(0);
  const shown = useRef(false);
  const n = steps.length;
  const done = idx >= n - 1 || steps[Math.min(idx, n - 1)][0] === 'CONFIRMED';
  useEffect(() => {
    if (!w) return;
    const to = ((Math.min(idx, n - 1) + 1) / n) * w;
    fill.set(shown.current ? withTiming(to, { duration: 280, easing: ease.out }) : to);
    shown.current = true;
  }, [idx, w, fill, n]);
  const style = useAnimatedStyle(() => ({ width: fill.get() }));
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`Status: ${label}`}>
      <View style={st.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Animated.View style={[st.trackFill, { backgroundColor: done ? accent.green : accent.lamp }, style]} />
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

// ── Care ────────────────────────────────────────────────────────────────────
const EVENT_ICON = { exercise: 'figure.walk', garden: 'leaf.fill', social: 'person.3.fill', music: 'music.note', lonely: 'cup.and.saucer.fill' };
function Care({ senior, state, me, run, circle }) {
  const settled = useSettled();
  const [newTask, setNewTask] = useState('');
  const tasks = state.tasks.filter((t) => t.seniorId === senior._id);
  const open = tasks.filter((t) => t.status === 'open');
  const name = (id) => first(state.members.find((m) => m._id === id)?.name) ?? 'Someone';
  const share = circle.map((m) => ({ m, n: tasks.filter((t) => t.status === 'done' && t.assignee === m._id).length }));
  const max = Math.max(1, ...share.map((x) => x.n));
  const about = (senior.about || []).join(' ').toLowerCase();
  const events = state.events.filter((e) => e.tags.some((t) => about.includes(t)) || e.tags.includes('social'));

  const add = () => {
    if (!newTask.trim()) return;
    run(() => api.addTask({ seniorId: senior._id, title: newTask.trim() }), 'Task added')();
    setNewTask('');
  };

  return (
    <>
      <Block title="Shared tasks" right={open.length ? <T v="callout" muted>{open.length} open</T> : null}>
        <Card style={st.listCard}>
          {open.length === 0 && <T v="callout" muted style={{ paddingVertical: 16 }}>Nothing open. Add something below.</T>}
          {open.map((t, i) => (
            <Appear key={t._id} on={settled}>
              {i > 0 && <Divider inset={48} />}
              <TaskRow t={t} me={me} run={run} name={name} senior={senior} />
            </Appear>
          ))}
          <Divider />
          <View style={st.addRow}>
            <View style={st.addIcon}><Icon name="plus" size={16} color={light.ink2} weight="bold" /></View>
            <TextInput style={st.addInput} value={newTask} onChangeText={setNewTask} placeholder="Add a task, like ‘Bring soup Sunday’" placeholderTextColor={light.faint} returnKeyType="done" onSubmitEditing={add} accessibilityLabel="New task" />
            {newTask.trim() ? <Button size="sm" variant="primary" label="Add" onPress={add} /> : null}
          </View>
        </Card>
      </Block>

      <Block title="Who’s been helping" sub="Tasks done this month">
        <Card style={{ gap: 14 }}>
          {share.map(({ m, n }) => (
            <View key={m._id} style={st.shareRow} accessible accessibilityLabel={`${m.name}: ${n} tasks`}>
              <Avatar name={m.name} size={30} />
              <T v="callout" style={{ width: 66, fontWeight: '600' }} numberOfLines={1}>{first(m.name)}</T>
              <View style={st.shareBar}><View style={[st.shareFill, { width: `${(n / max) * 100}%` }]} /></View>
              <T v="headline" style={{ width: 24, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{n}</T>
            </View>
          ))}
        </Card>
      </Block>

      {events.length > 0 && (
        <Block title="Around the neighborhood" sub="Matched to what she enjoys. Offering a ride adds it to care tasks.">
          <Card style={st.listCard}>
            {events.map((e, i) => (
              <View key={e._id}>
                {i > 0 && <Divider inset={56} />}
                <View style={st.eventRow}>
                  <IconTile icon={EVENT_ICON[e.tags.find((t) => EVENT_ICON[t])] || 'sparkles'} tone="lamp" size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="headline">{e.title}</T>
                    <T v="footnote" muted>{e.when} · {e.where}</T>
                    <Button size="sm" variant="soft" icon="car" label="Offer a ride" style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={run(() => api.addTask({ seniorId: senior._id, title: `Ride to ${e.title.toLowerCase()} (${e.when})`, type: 'ride', due: e.when }), 'Added to care tasks')} />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </Block>
      )}
    </>
  );
}

const TRANSPORT = {
  unknown: ['Ride not sorted', 'neutral'],
  self: ['Has a ride', 'green'],
  at_risk: ['Needs a ride', 'lamp'],
  requested: ['Ride requested', 'lamp'],
  confirmed: ['Ride confirmed', 'green'],
};

// What's coming up, grouped by day: Peggy's iPhone calendar (as synced by her app) plus sample appointments.
function Timeline({ senior, state }) {
  useNow();
  const tz = tzOf(senior);
  const name = senior.preferredName;
  const cal = senior.calendar;
  const groups = [];
  for (const a of upcomingPlans(state, senior)) {
    const key = dayKey(a.startsAt, tz);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const label = relDay(a.startsAt, tz);
      const date = new Date(a.startsAt).toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
      g = { key, label, date: label === date ? '' : date, items: [] };
      groups.push(g);
    }
    g.items.push(a);
  }

  return (
    <Block title="Coming up">
      <View style={st.syncRow} accessible accessibilityLabel={cal?.connected ? `Synced from ${name}’s iPhone ${ago(cal.syncedAt)}` : `${name}’s calendar is not connected`}>
        <Icon name={cal?.connected ? 'checkmark.circle.fill' : 'calendar.badge.exclamationmark'} size={15} color={cal?.connected ? accent.green : light.muted} />
        <T v="footnote" muted style={{ flex: 1 }}>
          {cal?.connected
            ? `Synced from ${name}’s iPhone ${ago(cal.syncedAt)}. Her rides, reminders and call-backs go back to her calendar.`
            : `Open Porchlight on ${name}’s phone and allow calendar access to see her real appointments here.`}
        </T>
      </View>
      {groups.length === 0 && <EmptyNote icon="calendar" text="Nothing coming up." />}
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 8 }}>
          <View style={st.dayHead}>
            <T v="headline" style={{ flex: 1 }}>{g.label}</T>
            {g.date ? <T v="footnote" muted>{g.date}</T> : null}
          </View>
          <ListGroup>
            {g.items.map((a) => <TimelineRow key={a._id} a={a} senior={senior} state={state} dividerInset={94} />)}
          </ListGroup>
        </View>
      ))}
    </Block>
  );
}

function TimelineRow({ a, senior, state }) {
  const tz = tzOf(senior);
  const name = senior.preferredName;
  const action = (state.actions || []).find((x) => x._id === a.actionId);
  const [label, tone] = a.needsRide === false ? ['No ride needed', 'neutral']
    : a.transport === 'confirmed' && action?.simulated ? ['Demo ride confirmed', 'green']
    : TRANSPORT[a.transport] ?? TRANSPORT.unknown;
  const d = new Date(a.startsAt);
  const valid = Number.isFinite(d.getTime());
  // \s, not ' ': iPhone puts a narrow no-break space before AM/PM, so ' ' never split "2:00 PM".
  const [hm, ampm] = valid ? timeIn(a.startsAt, tz).split(/\s+/) : ['TBC', ''];
  const addToMine = async () => {
    try {
      await Calendar.createEventInCalendarAsync({
        title: `${name}: ${a.title.replace(/\s*\(sample\)/i, '')}`,
        startDate: new Date(a.startsAt), endDate: new Date(a.endsAt || new Date(a.startsAt).getTime() + 3600000),
        location: a.where || undefined, notes: `From ${name}’s Porchlight.`,
      });
    } catch (e) {
      toast.info('Couldn’t open your calendar', { description: e.message });
    }
  };
  return (
    <View style={st.tlRow}>
      <View style={st.tlTime} accessible accessibilityLabel={[a.title, when(a.startsAt, tz), a.with, a.where, label].filter(Boolean).join('. ')}>
        <Text style={st.tlClock}>{hm}</Text>
        {ampm ? <Text style={st.tlAmPm}>{ampm}</Text> : null}
      </View>
      <View style={[st.tlRail, { backgroundColor: tone === 'lamp' ? accent.lamp : tone === 'green' ? accent.green : light.lineStrong }]} />
      <View style={{ flex: 1, gap: 4 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={{ gap: 3, paddingRight: 46 }}>
          <T v="headline">{a.title}</T>
          {[a.with, a.where].some(Boolean) ? <T v="footnote" muted>{[a.with, a.where].filter(Boolean).join(' · ')}</T> : null}
        </View>
        <View style={[st.chips, { marginTop: 6 }]}>
          <Chip label={label} icon={tone === 'green' ? 'checkmark' : 'car'} tone={tone} />
          <Chip label={a.source === 'calendar' ? `Her calendar${a.calendar ? `: ${a.calendar}` : ''}` : 'Sample'} icon={a.source === 'calendar' ? 'calendar' : undefined} />
        </View>
      </View>
      <Press onPress={addToMine} accessibilityLabel={`Add ${a.title} to my calendar`} style={[st.roundBtn, st.tlAdd]} scaleTo={0.94}>
        <Icon name="calendar.badge.plus" size={16} color={light.ink} />
      </Press>
    </View>
  );
}

const TASK_ICON = { refill: 'pills.fill', ride: 'car.fill', groceries: 'cart.fill', repair: 'hammer.fill', errand: 'bag.fill', visit: 'house.fill', call: 'phone.fill', meal: 'fork.knife' };
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
      <IconTile icon={TASK_ICON[t.type] || 'checklist'} tone={(ho && ho.to === me) || (!t.assignee && suggested === me) ? 'lamp' : 'plain'} size={36} style={{ borderRadius: 11 }} />
      <View style={{ flex: 1, gap: 5 }}>
        <T v="headline">{t.title}</T>
        {t.quote && who ? <T v="callout" style={{ fontStyle: 'italic', color: light.ink2 }}>{who} said: “{t.quote}”</T> : null}
        {meta ? <T v="footnote" muted>{meta}</T> : null}
        <View style={{ marginTop: 6 }}>{buttons}</View>
      </View>
    </View>
  );
}

// ── Family: people and stories ──────────────────────────────────────────────
function FamilyDetails(ctx) {
  const [section, setSection] = useState('people');
  return <>
    <View style={{ gap: 18 }}>
      <LargeTitle title="Family" subtitle={`The people and stories around ${ctx.senior.preferredName}.`} />
      <Segmented options={[{ id: 'people', label: 'People' }, { id: 'stories', label: 'Stories' }]} value={section} onChange={setSection} />
    </View>
    {section === 'people' ? <Circle {...ctx} /> : <Stories {...ctx} checkins={ctx.state.checkins.filter((c) => c.seniorId === ctx.senior._id)} />}
  </>;
}

function Circle({ state, circle, me }) {
  const texts = state.notifications.filter((n) => circle.some((m) => m._id === n.toId)).slice(0, 8);
  return (
    <>
      <Block title="Your people">
        <ListGroup>
          {circle.map((m) => {
            const awake = isAwake(m.timezone);
            const sub = [m.relation, m.primary ? 'Primary contact' : null].filter(Boolean).join(' · ');
            return (
              <ListRow
                key={m._id}
                avatar={m.name}
                title={m._id === me ? `${m.name} (you)` : m.name}
                sub={sub}
                accessibilityLabel={`${m.name}${m._id === me ? ', you' : ''}. ${sub}. ${localTime(m.timezone)} their time${awake ? '' : ', quiet hours'}.`}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Text style={[st.localTime, !awake && { color: light.muted }]}>{localTime(m.timezone)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {!awake ? <Icon name="moon.fill" size={11} color={light.muted} /> : null}
                      <T v="footnote" muted>{awake ? tzShort(m.timezone) : 'Quiet hours'}</T>
                    </View>
                  </View>
                }
              />
            );
          })}
        </ListGroup>
      </Block>
      <Block title="Texts sent by Porchlight">
        {texts.length === 0 ? <EmptyNote icon="message" text="When Porchlight needs the circle, the texts it sends show up here." /> : (
          <Card style={{ gap: 18 }}>
            {texts.map((n, i) => (
              <View key={i} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Avatar name={n.to} size={24} />
                  <T v="footnote" muted style={{ flex: 1 }}>To {first(n.to)} · {ago(n.at)}</T>
                </View>
                <View style={st.bubble}><T v="callout">{tidy(n.text)}</T></View>
              </View>
            ))}
          </Card>
        )}
      </Block>
    </>
  );
}

// ── Stories: a family keepsake ─────────────────────────────────────────────
// Each story is kept in her own words. Optional fields from the server (summary, when, place, people,
// theme, askNext) fill in the details; anything missing is simply left out.
const THEME_ICON = {
  love: 'heart.fill', family: 'person.2.fill', work: 'briefcase.fill', home: 'house.fill', travel: 'airplane', food: 'fork.knife',
  faith: 'sparkles', friends: 'person.3.fill', childhood: 'figure.child', music: 'music.note', garden: 'leaf.fill',
};
// While a call is in progress the saved stories don't exist yet (the AI writes them when the call ends),
// so we pick out the lines that sound like a memory as she says them. The real ones replace these at hang-up.
const MEMORY = /remember|used to|when i was|back in|years ago|growing up|my (late )?husband|walt|we met|as a girl/i;
function liveStories(checkin) {
  return (checkin.transcript || [])
    .filter((t) => t.who === 'senior' && MEMORY.test(t.text))
    .map((t) => ({ title: 'Something she just shared', text: t.text, at: t.at, live: true }));
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
    <View style={{ gap: 20 }}>
      <View style={st.storiesHead}>
        <IconTile icon="book.closed.fill" tone="amber" size={52} style={{ borderRadius: 16 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title">{name}’s stories</T>
          <T v="callout" muted>
            {saved.length ? `${saved.length} ${saved.length === 1 ? 'story' : 'stories'} in her own words, saved from her calls.` : 'In her own words, saved from her calls.'}
          </T>
        </View>
      </View>

      {live && (
        <Appear on={settled}>
          <Card tone="lamp" style={{ gap: 10 }} accessibilityLabel={`${name} is on her call now. ${heard.length ? 'New stories show up as she tells them.' : 'Listening.'}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Lamp state="lit" size={30} still />
              <T v="headline" style={{ flex: 1 }}>On her call now</T>
              <Chip label="Live" icon="waveform" tone="lamp" />
            </View>
            <T v="callout" muted>{heard.length ? 'Here’s what she’s sharing. The full story is saved when the call ends.' : 'Listening. Any story she tells will show up here.'}</T>
          </Card>
        </Appear>
      )}
      {heard.map((x, i) => <Appear key={`live-${i}`} on={settled}><StoryCard story={x} name={name} /></Appear>)}

      <FamilyQuestions senior={senior} state={state} me={me} run={run} />

      {people.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }} style={{ marginHorizontal: -20, flexGrow: 0 }}>
          {[null, ...people].map((p) => {
            const on = person === p;
            return (
              <Press key={p ?? 'all'} onPress={() => { haptic.select(); setPerson(p); }} feedback={null} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p ? `Stories about ${p}` : 'All stories'} style={[st.filter, on && st.filterOn]}>
                {p ? <Icon name="person.fill" size={12} color={on ? light.onPrimary : light.muted} /> : null}
                <Text style={[st.filterText, on && { color: light.onPrimary }]}>{p ?? 'All stories'}</Text>
              </Press>
            );
          })}
        </ScrollView>
      )}

      {!live && saved.length === 0 && (
        <Card style={{ gap: 12, alignItems: 'flex-start' }}>
          <IconTile icon="book.closed" size={44} />
          <T v="headline">Her stories will live here</T>
          <T v="callout" muted>When {name} tells a story on a call, Porchlight saves it in her words with who and when, plus a question you can ask her next time.</T>
          {starters[0] ? <Quote>{starters[0]}</Quote> : null}
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
    <Card style={{ gap: 14 }}>
      <View style={st.cardHead}>
        <IconTile icon="questionmark.bubble.fill" tone="lamp" size={40} />
        <View style={{ flex: 1, gap: 1 }}>
          <T v="headline">Questions for {name}</T>
          <T v="footnote" muted>Porchlight asks one on her next call, and saves her answer here.</T>
        </View>
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
        <Button size="sm" variant={text.trim() ? 'primary' : 'secondary'} icon="arrow.up" label="Ask" accessibilityLabel={`Ask ${name} on her next call`} onPress={send} disabled={!text.trim()} />
      </View>
      {open.length > 0 && (
        <View style={st.qList}>
          {open.map((q, i) => (
            <View key={q._id}>
              {i > 0 && <Divider inset={28} />}
              <View style={st.qRow}>
                <Icon name="clock" size={15} color={accent.lampText} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, gap: 1 }}>
                  <T v="callout" style={{ fontWeight: '500' }}>{q.text}</T>
                  <T v="footnote" muted>{who(q.askedBy)} asked · on her next call</T>
                </View>
                <Press onPress={run(() => api.deleteQuestion(senior._id, q._id), 'Question removed')} accessibilityRole="button" accessibilityLabel={`Remove the question: ${q.text}`} style={st.qRemove} scaleTo={0.92}>
                  <Icon name="xmark" size={12} color={light.muted} weight="bold" />
                </Press>
              </View>
            </View>
          ))}
        </View>
      )}
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
      {long ? <T v="footnote" style={{ color: accent.lampText, fontWeight: '600', marginTop: 8 }}>{open ? 'Show less' : 'Read the whole story'}</T> : null}
    </View>
  );
  const share = () => {
    haptic.tap();
    Share.share({ message: `${s.title}\n\n“${s.text}”${s.retold ? `\n\n${s.retold}` : ''}\n\n${name}, ${toldOn(s.at).toLowerCase()}. Saved by Porchlight.` }).catch(() => {});
  };
  return (
    <View style={[st.story, shadow.card]}>
      {s.question ? (
        <View style={st.answering}>
          <Icon name="questionmark.bubble.fill" size={14} color={accent.lampText} style={{ marginTop: 1 }} />
          <T v="footnote" style={{ flex: 1, color: accent.lampText }}>Answering {asker ? `${asker}’s` : 'a family'} question: “{s.question.text || s.question}”</T>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon={THEME_ICON[s.theme] || 'book.closed.fill'} tone="lamp" size={40} />
        <View style={{ flex: 1, gap: 1 }}>
          {meta ? <T v="eyebrow" muted numberOfLines={1}>{meta}</T> : null}
          <T v="title" style={st.storyTitle}>{s.title}</T>
        </View>
      </View>
      {s.summary ? <T v="callout" muted style={{ marginTop: -4 }}>{s.summary}</T> : null}

      {long ? (
        <Press onPress={() => setOpen((v) => !v)} scaleTo={1} feedback={null} accessibilityLabel={`${name} said: ${s.text}`} accessibilityHint={open ? 'Shows less' : 'Shows the whole story'}>
          {quote}
        </Press>
      ) : <View accessible accessibilityLabel={`${name} said: ${s.text}`}>{quote}</View>}

      {s.retold ? <T v="body" style={{ color: light.ink2 }}>{s.retold}</T> : null}

      {s.people?.length ? (
        <View style={st.chips}>
          {s.people.map((p) => <Chip key={p} label={p} icon="person.fill" />)}
        </View>
      ) : null}

      {ask && !s.live ? (
        <View style={st.askNext} accessible accessibilityLabel={`Ask her more: ${ask}`}>
          <Icon name="bubble.left.fill" size={15} color={accent.lampText} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 3 }}>
            <T v="eyebrow" color={accent.lampText}>Ask her more</T>
            <T v="callout" style={{ color: light.ink }}>{ask}</T>
          </View>
        </View>
      ) : null}

      <View style={st.storyFoot}>
        <T v="footnote" muted style={{ flex: 1 }}>{s.live ? 'Just now, on today’s call' : toldOn(s.at)}</T>
        {!s.live && <Button size="sm" variant="soft" icon="square.and.arrow.up" label="Share" accessibilityLabel={`Share ${s.title} with family`} onPress={share} />}
      </View>
    </View>
  );
}

// ── Settings: iOS inset-grouped ─────────────────────────────────────────────
function Group({ header, footer, children }) {
  return (
    <View style={{ gap: 8 }}>
      {header ? <T v="eyebrow" muted style={{ paddingHorizontal: 16 }} accessibilityRole="header">{header}</T> : null}
      {children}
      {footer ? <T v="footnote" muted style={{ paddingHorizontal: 16 }}>{footer}</T> : null}
    </View>
  );
}

function Settings({ senior, run, circle, me, app }) {
  const mine = circle.find((m) => m._id === me);
  return <>
    <LargeTitle title="Settings" subtitle="Make the daily check-in work for you." />
    <Group header="Daily call"><DailyCall senior={senior} run={run} /></Group>
    <Group header="Your sample profile" footer={mine?.seesMeds ? 'Your profile can see medicine details.' : 'Medicine details and call transcripts are private to the primary contact.'}>
      <ListGroup>
        <ListRow avatar={mine?.name} title={mine?.name} sub={mine?.relation} />
        <ListRow icon={mine?.seesMeds ? 'eye.fill' : 'lock.fill'} iconTone={mine?.seesMeds ? 'green' : 'plain'} title="Medicine details" right={mine?.seesMeds ? 'Visible' : 'Private'} />
        <ListRow icon="person.crop.circle" title="Switch person" onPress={() => openRoleSheet(app)} />
      </ListGroup>
    </Group>
    <Group header="About Porchlight" footer="All people and organizations in this experience are sample. A simulated booking is not a real ride.">
      <ListGroup>
        <ListRow icon="sparkles" iconTone="lamp" title="An AI helper, with family in the loop" sub="Porchlight shares check-in updates and helps coordinate everyday needs. It does not provide medical advice." />
      </ListGroup>
    </Group>
    <Group header="Presenting">
      <ListGroup>
        <ListRow icon="slider.horizontal.3" title="Demo controls" onPress={() => openDemoMenu(app)} />
      </ListGroup>
    </Group>
  </>;
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
  const zone = tzShort(tzOf(senior));

  return (
    <Card style={{ gap: 18 }}>
      <View style={st.cardHead}>
        <IconTile icon="phone.fill" tone={autoCall ? 'amber' : 'plain'} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="headline">Call {name} every day</T>
          <T v="footnote" muted>Porchlight phones her for a short chat.</T>
        </View>
        <Switch value={autoCall} onValueChange={(v) => { haptic.select(); setAutoCall(v); }} trackColor={{ true: accent.green }} accessibilityLabel={`Call ${name} every day`} />
      </View>

      <View style={[st.timePanel, !autoCall && { opacity: 0.55 }]} pointerEvents={autoCall ? 'auto' : 'none'}>
        <Press onPress={() => step(-15)} feedback={null} accessibilityLabel="Fifteen minutes earlier" style={st.stepBtn} scaleTo={0.92}><Icon name="minus" size={18} color={light.ink} weight="bold" /></Press>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={st.time} accessibilityLabel={`Call time ${clock(toHHMM(min))}`}>{clock(toHHMM(min)).split(' ')[0]}<Text style={st.ampm}> {clock(toHHMM(min)).split(' ')[1]}</Text></Text>
          <T v="footnote" muted>Her time{zone ? ` · ${zone}` : ''}</T>
        </View>
        <Press onPress={() => step(15)} feedback={null} accessibilityLabel="Fifteen minutes later" style={st.stepBtn} scaleTo={0.92}><Icon name="plus" size={18} color={light.ink} weight="bold" /></Press>
      </View>

      <View style={[st.days, !autoCall && { opacity: 0.55 }]} pointerEvents={autoCall ? 'auto' : 'none'}>
        {DAYS.map((label, d) => {
          const on = days.includes(d);
          return (
            <Press key={d} onPress={() => toggleDay(d)} feedback={null} scaleTo={0.92} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !autoCall }} accessibilityLabel={DAY_NAMES[d]} style={[st.day, on && (autoCall ? st.dayOn : st.dayIdle)]}>
              <Text style={[st.dayText, on && autoCall && { color: light.onPrimary }, !autoCall && { color: on ? light.ink2 : light.faint }]}>{label}</Text>
            </Press>
          );
        })}
      </View>

      <View style={[st.btnRow, { alignItems: 'center' }]}>
        {saved ? (
          <View style={st.savedNote} accessible accessibilityLabel={autoCall ? `Next call: ${nextCallLabel(senior)}` : 'Daily call is off'}>
            <Icon name={autoCall ? 'checkmark.circle.fill' : 'moon.zzz.fill'} size={16} color={autoCall ? accent.green : light.muted} />
            <View style={{ flex: 1 }}>
              <T v="footnote" muted>{autoCall ? 'Next call' : 'Schedule'}</T>
              <T v="callout" style={{ fontWeight: '600' }}>{autoCall ? nextCallLabel(senior) : 'Daily call is off'}</T>
            </View>
          </View>
        ) : (
          <Button
            variant="primary"
            style={{ flex: 1 }}
            label="Save schedule"
            disabled={autoCall && !days.length}
            onPress={run(() => api.setSchedule(senior._id, { autoCall, checkinTime: toHHMM(min), callDays: days }), autoCall ? [`Daily call set for ${clock(toHHMM(min))}`, `Porchlight will phone ${name} then.`] : 'Daily call turned off')}
          />
        )}
        <Button variant="soft" icon="phone.fill" label="Call now" onPress={callNow(senior, run)} accessibilityHint={`Porchlight phones ${name} right away.`} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 14, fontWeight: '700', color: accent.lampInk, fontVariant: ['tabular-nums'] },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 18 },

  hero: { padding: 20, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: -6 },
  heroName: { fontSize: 32, lineHeight: 36 },
  heroSummary: { fontSize: 17, lineHeight: 24, letterSpacing: -0.2, opacity: 0.92 },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listCard: { gap: 0, paddingVertical: 4, paddingHorizontal: 18 },
  moreRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  flagRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, alignItems: 'flex-start' },

  ladder: { paddingLeft: 2 },
  ladderRow: { flexDirection: 'row', gap: 12 },
  ladderRail: { alignItems: 'center', width: 12, paddingTop: 5 },
  ladderDot: { width: 10, height: 10, borderRadius: 5 },
  ladderLine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: light.lineStrong, marginTop: 4 },

  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { flex: 1, alignItems: 'center', gap: 6 },
  weekLetter: { fontSize: 12, fontWeight: '600', color: light.muted, letterSpacing: 0.3 },
  weekDot: { width: 36, height: 36, borderRadius: 18, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  weekButton: { backgroundColor: accent.lampSoft, borderWidth: 1, borderColor: 'rgba(224,138,18,0.30)' },
  weekToday: { borderWidth: 2, borderColor: light.ink },
  ring: { borderWidth: 1, borderColor: 'rgba(224,138,18,0.30)' },
  weekNum: { fontSize: 12, color: light.muted, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: light.line, marginHorizontal: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },

  starter: { backgroundColor: light.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: light.line, padding: 18, gap: 12, minHeight: 156 },

  quote: { borderLeftWidth: 3, borderLeftColor: accent.lamp, paddingLeft: 12, paddingVertical: 2 },
  details: { backgroundColor: light.surface2, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: light.line, paddingHorizontal: 14 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  detailLine: { height: StyleSheet.hairlineWidth, backgroundColor: light.line, marginLeft: 25 },
  track: { height: 6, borderRadius: 3, backgroundColor: light.sunken, overflow: 'hidden' },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: light.surface },
  stepLabels: { flexDirection: 'row' },
  stepLabel: { flex: 1, fontSize: 12, color: light.muted },
  simulated: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: light.sunken, borderRadius: radius.xs, paddingHorizontal: 10, paddingVertical: 7 },
  uberNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: accent.lampSoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  taskRow: { flexDirection: 'row', gap: 12, paddingVertical: 16, alignItems: 'flex-start' },
  addRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 58 },
  addIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  addInput: { flex: 1, minHeight: 44, fontSize: 16, color: light.ink },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: light.sunken, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: 4, backgroundColor: accent.lamp },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16 },

  syncRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2, marginTop: -4 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 2, marginTop: 4 },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16, paddingLeft: 16, paddingRight: 14 },
  tlTime: { width: 54, alignItems: 'flex-end', paddingTop: 1 },
  tlClock: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: light.ink, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  tlAmPm: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: light.muted },
  tlRail: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  tlAdd: { position: 'absolute', top: 12, right: 12 },

  localTime: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: light.ink, fontVariant: ['tabular-nums'] },
  bubble: { marginLeft: 32, alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: light.sunken, borderRadius: 18, borderTopLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },

  storiesHead: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 2 },
  filter: { flexDirection: 'row', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: light.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: light.lineStrong, alignItems: 'center', justifyContent: 'center' },
  filterOn: { backgroundColor: light.ink, borderColor: light.ink },
  filterText: { fontSize: 15, fontWeight: '600', color: light.ink, letterSpacing: -0.2 },
  story: { backgroundColor: light.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: light.line, padding: 20, gap: 16 },
  storyTitle: { fontSize: 21, lineHeight: 26 },
  storyQuote: { paddingTop: 2 },
  quoteMark: { fontFamily: SERIF, fontSize: 60, lineHeight: 60, height: 30, color: accent.lamp, fontWeight: '700', marginLeft: -2 },
  storyText: { fontFamily: SERIF, fontSize: 22, lineHeight: 31, color: light.ink, fontStyle: 'italic', letterSpacing: -0.2 },
  answering: { flexDirection: 'row', gap: 8, backgroundColor: accent.lampSoft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9 },
  askNext: { flexDirection: 'row', gap: 10, backgroundColor: light.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: light.line, borderRadius: radius.md, padding: 14 },
  storyFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: light.line },
  askBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: light.sunken, borderRadius: radius.pill, paddingLeft: 16, paddingRight: 4, minHeight: 52 },
  askInput: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 44, fontSize: 16, color: light.ink },
  qList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: light.line },
  qRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 },
  qRemove: { width: 36, height: 36, borderRadius: 18, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },

  timePanel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: light.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: light.line, borderRadius: radius.lg, padding: 12 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: light.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: light.lineStrong, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  time: { fontSize: 42, lineHeight: 48, fontWeight: '700', letterSpacing: -1.6, color: light.ink, fontVariant: ['tabular-nums'] },
  ampm: { fontSize: 18, fontWeight: '600', letterSpacing: 0, color: light.muted },
  savedNote: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingLeft: 4 },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  day: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: light.sunken, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: light.ink },
  dayIdle: { backgroundColor: light.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: light.lineStrong },
  dayText: { fontSize: 15, fontWeight: '600', color: light.ink },
});
