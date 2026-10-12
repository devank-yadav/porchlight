import { Children, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated from 'react-native-reanimated';
import * as Speech from 'expo-speech';
import { api } from './api';
import { useCalendarSync } from './calendar';
import { notifyLocally, pushRegistered, startPush } from './push';
import { useMedReminders } from './meds/reminders';
import PillsCard from './meds/PillsCard';
import MedsList from './meds/MedsList';
import { useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { Appear, Avatar, BigButton, Button, Card, HeroCard, IconTile, ListGroup, Press, Screen, Section, T, Tile, useSettled } from './design/ui';
import PlanRow, { upcomingPlans, isToday, dayLabel } from './design/PlanRow';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { toast } from './design/Toaster';
import { accent, night, seniorPalette as P, font, radius, shadow } from './design/tokens';

// Peggy's side. Atkinson Hyperlegible, never under 20pt; buttons 104pt or taller; every control labelled.

function say(text) {
  return new Promise((resolve) => {
    Speech.stop();
    Speech.speak(text, { rate: 0.92, language: 'en-US', onDone: resolve, onStopped: resolve, onError: resolve });
  });
}
const onError = (e) => toast.error('Please try again', { description: e.message });
const openLink = (url) => Linking.openURL(url).catch(onError);
const go = (page) => router.push('/senior/' + page);
const home = () => router.replace('/senior/today');
const firstName = (name = '') => name.split(' ')[0];
const zone = (senior) => senior.timezone || 'America/New_York';
const AI_PROMISE = 'Porchlight is an AI helper. It never asks for money, codes, passwords or ID numbers.';

function greeting(tz) {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz })) % 24;
  if (!Number.isFinite(h)) return 'Hello';
  return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
}
// "10:00" → "10:00 AM"
function clock12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
// "Today, 2:00 PM" / "Tomorrow, 2:00 PM" / "Mon, Oct 12 · 2:00 PM"
function whenLabel(iso, tz) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'Time to be confirmed';
  const time = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const day = (x) => x.toLocaleDateString('en-US', { timeZone: tz });
  if (isToday(iso, tz)) return 'Today, ' + time;
  if (day(d) === day(new Date(Date.now() + 86400000))) return 'Tomorrow, ' + time;
  return dayLabel(iso, tz);
}

// Phone-level work for Peggy's side, mounted once (senior/_layout.js) rather than once per open page,
// so the calendar, push sign-up, pill reminders and Uber notices don't run three or four times in parallel.
export function SeniorEffects() {
  const { state, refresh } = useAppContext();
  const senior = state?.seniors?.[0];
  return senior ? <PhoneSync senior={senior} state={state} refresh={refresh} /> : null;
}
function PhoneSync({ senior, state, refresh }) {
  useCalendarSync(senior, state);
  // Phone notifications: register this phone for Uber pushes, and tapping one opens Uber.
  useEffect(() => Platform.OS === 'web' ? undefined : startPush(), []);
  // Daily pill reminders on this phone, with an "I took it" button (meds/reminders.js).
  useMedReminders(senior, state, refresh);
  // Fallback when push isn't set up: the app shows the Uber notification itself for rides that arrive while it's open.
  const seen = useRef(null);
  useEffect(() => {
    const ubers = (state.notices || []).filter((n) => n.seniorId === senior._id && n.kind === 'uber');
    if (seen.current === null) { seen.current = new Set(ubers.map((n) => n._id)); return; }
    for (const n of ubers) {
      if (seen.current.has(n._id)) continue;
      seen.current.add(n._id);
      if (Platform.OS !== 'web' && !pushRegistered) notifyLocally({ title: 'Your Uber is ready to book', body: 'Tap to open Uber with your trip filled in, then press Request.', url: n.uberLink });
    }
  }, [state.notices, senior._id]);
  return null;
}

export default function SeniorScreen({ senior, page = 'today' }) {
  const { state, refresh, account } = useAppContext();
  const members = state.members.filter((m) => m.circleId === senior.circleId);
  const primary = members.find((m) => m.primary);
  const ride = (state.actions || []).find((a) => a.seniorId === senior._id && a.details?.uberLink && !['COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'].includes(a.status));
  const notices = (state.notices || []).filter((n) => n.seniorId === senior._id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);

  const plans = upcomingPlans(state, senior);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {page === 'today' && <Home senior={senior} primary={primary} plans={plans} state={state} refresh={refresh} notices={notices} />}
    {page === 'plans' && <Plans senior={senior} plans={plans} state={state} refresh={refresh} ride={ride} notices={notices} />}
    {page === 'family' && <Family senior={senior} members={members} account={account} />}
    {page === 'scam' && <ScamCheck senior={senior} state={state} back={home} />}
    {page === 'tech' && <TechHelp senior={senior} back={home} />}
    {page === 'help' && <Help senior={senior} back={home} refresh={refresh} />}
  </KeyboardAvoidingView>;
}

// ── Today ───────────────────────────────────────────────────────────────────
function Home({ senior, primary, plans, state, refresh, notices }) {
  const [calling, setCalling] = useState(false);
  const callReset = useRef(null);
  useEffect(() => () => clearTimeout(callReset.current), []);
  const settled = useSettled();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  const tz = zone(senior);
  const help = senior.status === 'help';
  const talked = !['help', 'missed'].includes(senior.status) && isToday(senior.lastCheckinAt, senior.timezone);
  const callMe = async () => {
    if (calling) return;
    setCalling(true);
    try {
      await api.phoneCall(senior._id);
      haptic.success();
      toast.success('Your phone will ring', { description: 'Pick up and Porchlight will talk first. It’s an AI.' });
      callReset.current = setTimeout(() => setCalling(false), 20000);
    } catch (e) {
      haptic.warn();
      toast.info('The call didn’t go through', { description: e.message });
      setCalling(false);
    }
  };

  const status = help ? 'You asked for help' : talked ? 'We talked today' : senior.status === 'talking' ? 'On a call now' : 'Your call is coming';
  const detail = help ? 'Your family has been asked to contact you.'
    : talked ? 'Your family can see how you’re doing.'
      : senior.status === 'missed' ? 'We missed you today. Tap “Call me now” when you can.'
        : senior.autoCall ? 'Porchlight will call at ' + clock12(senior.checkinTime) + '.' : 'Tap “Call me now” any time.';
  const next = plans[0];
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz });

  return <Screen>
    <Appear on index={0}>
      <View style={st.greet}>
        <T v="readSmall" muted>{greeting(tz)} · {date}</T>
        <T v="readDisplay" style={st.name}>{senior.preferredName}</T>
      </View>
    </Appear>

    <Appear on index={1}>
      <HeroCard glowAt="left" tone={help ? 'red' : 'lamp'} style={st.hero}>
        <View style={st.heroTop}>
          <Lamp state={lampState(senior)} size={88} />
          <View style={{ flex: 1, gap: 4 }} accessible accessibilityLabel={status + '. ' + detail} accessibilityLiveRegion="polite">
            <T v="readHeadline" style={st.heroStatus}>{status}</T>
            <T v="readSmall" muted>{detail}</T>
          </View>
        </View>
        <View style={st.heroNext} accessible accessibilityLabel={next ? 'Next: ' + next.title + ', ' + whenLabel(next.startsAt, tz) : 'Nothing planned. Your day is open.'}>
          <IconTile icon="calendar" tone="lamp" size={52} iconSize={26} style={{ borderRadius: 16 }} />
          <View style={{ flex: 1 }}>
            <T v="readSmall" muted>{next ? whenLabel(next.startsAt, tz) : 'Nothing planned'}</T>
            <T v="readHeadline" style={st.heroNextTitle} numberOfLines={2}>{next ? next.title : 'Your day is open'}</T>
          </View>
        </View>
      </HeroCard>
    </Appear>

    {help && <Card tone="red" style={{ gap: 16 }}>
      <T v="readHeadline" color={accent.redText}>If you’re hurt or in danger, call 911.</T>
      <Button variant="danger" icon="phone.fill" label="Call 911" accessibilityHint="Opens a phone call to 911." onPress={() => openLink('tel:911')} />
    </Card>}

    <PillsCard senior={senior} state={state} refresh={refresh} />

    <Appear on index={2}>
      <BigButton tone="lamp" icon="phone.arrow.down.left" title={calling ? 'Your phone will ring' : 'Call me now'} sub="Talk with Porchlight, your AI helper" hint="Rings your phone. Porchlight is an AI and will talk first." onPress={callMe} disabled={calling} />
    </Appear>

    <Appear on index={3} style={st.grid}>
      <ActionGrid compact={compact}>
        {primary ? <Action compact={compact} icon="phone.fill" title={'Call ' + firstName(primary.name)} sub={primary.relation} onPress={() => openLink('tel:' + primary.phone)} disabled={!primary.phone} /> : null}
        <Action compact={compact} icon="shield.lefthalf.filled" title="Is this a scam?" sub="Check first" onPress={() => go('scam')} />
      </ActionGrid>
      <BigButton icon="iphone" title="Help with my phone" sub="Show me the screen" hint="Take a picture of a screen and Porchlight explains what to do next." chevron onPress={() => go('tech')} />
    </Appear>

    <Notices notices={notices} settled={settled} />
    <HelpButton />
    <AiPromise />
  </Screen>;
}

// Two-up tiles; one big button per row when the screen is narrow or the text is large.
function ActionGrid({ compact, children }) {
  const items = Children.toArray(children).filter(Boolean);
  if (compact) return items;
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows.map((row, i) => <View key={i} style={st.gridRow}>{row}</View>);
}
function Action({ compact, ...props }) {
  return compact ? <BigButton {...props} /> : <Tile {...props} />;
}

function HelpButton() {
  return <BigButton tone="help" icon="hand.raised.fill" title="I need help" sub="Alert my family" hint="Opens a confirmation before alerting anyone." onPress={() => go('help')} />;
}

// The product promise, always on screen somewhere on Peggy's side.
function AiPromise({ children = AI_PROMISE }) {
  return <View style={st.promise} accessible accessibilityLabel={children}>
    <Icon name="checkmark.shield.fill" size={24} color={P.muted} />
    <T v="readSmall" muted style={{ flex: 1 }}>{children}</T>
  </View>;
}

function Notices({ notices, settled }) {
  if (!notices.length) return null;
  return <Section title="Updates for you" style={{ gap: 14 }}>
    {notices.map((n) => <Appear key={n._id} on={settled}><Notice n={n} /></Appear>)}
  </Section>;
}
function Notice({ n }) {
  if (n.uberLink) {
    return <Card tone="lamp" style={st.warm}>
      <View style={st.warmHead}>
        <IconTile icon="car.fill" tone="amber" size={56} iconSize={28} style={{ borderRadius: 18 }} />
        <T v="readHeadline" style={{ flex: 1 }}>Your ride</T>
      </View>
      <T v="read">{n.text}</T>
      <BigButton tone="lamp" icon="car.fill" title="Book my Uber" sub="Confirm your ride in Uber" hint="Opens Uber. You confirm the booking and price there." onPress={() => openLink(n.uberLink)} />
    </Card>;
  }
  const icon = n.kind === 'ride' ? 'car.fill' : n.kind === 'task' ? 'checkmark.circle.fill' : 'bell.fill';
  return <Card style={st.notice}>
    <IconTile icon={icon} tone="lamp" size={52} iconSize={26} style={{ borderRadius: 16 }} />
    <View style={{ flex: 1, gap: 6 }}>
      <T v="read">{n.text}</T>
    </View>
  </Card>;
}

function RideCard({ ride }) {
  return <Card tone="lamp" style={st.warm}>
    <View style={st.warmHead}>
      <IconTile icon="car.fill" tone="amber" size={56} iconSize={28} style={{ borderRadius: 18 }} />
      <View style={{ flex: 1 }}>
        <T v="readSmall" color={accent.lampText}>Your ride</T>
        <T v="readHeadline">{ride.details.to}</T>
      </View>
    </View>
    {ride.details.pickupAt && <View style={st.inline}>
      <Icon name="clock" size={22} color={P.muted} />
      <T v="readSmall" muted style={{ flex: 1 }}>Pick up {dayLabel(ride.details.pickupAt)}</T>
    </View>}
    <BigButton tone="lamp" icon="car.fill" title="Book with Uber" sub="Your trip is filled in" hint="Opens Uber. You confirm the booking and price there." onPress={() => openLink(ride.details.uberLink)} />
    <T v="readSmall" muted>You confirm the ride and its price in Uber. Porchlight never pays for you.</T>
  </Card>;
}

// ── My plans ────────────────────────────────────────────────────────────────
function Plans({ senior, plans, state, refresh, ride, notices }) {
  const settled = useSettled();
  // The ride card already carries this ride's Uber button.
  const rest = ride ? notices.filter((n) => n.actionId !== ride._id) : notices;
  return <Screen>
    <PageTitle title="My plans" sub="What’s coming up." />
    {plans.length
      ? <ListGroup>{plans.map((plan) => <PlanRow key={plan._id} plan={plan} senior={senior} state={state} />)}</ListGroup>
      : <Card style={st.empty} accessible accessibilityLabel="Your day is open. No upcoming appointments.">
        <IconTile icon="calendar" tone="lamp" size={64} iconSize={32} style={{ borderRadius: 20 }} />
        <T v="readHeadline" center>Your day is open</T>
        <T v="readSmall" muted center>No upcoming appointments.</T>
      </Card>}
    {ride && <RideCard ride={ride} />}
    <MedsList senior={senior} state={state} refresh={refresh} />
    <Notices notices={rest} settled={settled} />
    <HelpButton />
  </Screen>;
}

// ── My family ───────────────────────────────────────────────────────────────
function Family({ senior, members, account }) {
  const [code, setCode] = useState(null);
  const invite = async () => {
    try {
      const r = code && new Date(code.expiresAt) > new Date() ? code : await api.invite();
      setCode(r);
      await Share.share({ message: `Join me on Porchlight. Install the app, choose “I’m family”, and enter this code: ${r.code}` });
    } catch (e) { onError(e); }
  };
  const confirmDelete = () => Alert.alert('Delete your account?', 'This removes your calls, stories, medicines and plans from Porchlight, and your family loses access. It can’t be undone.', [
    { text: 'Keep my account', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => account.deleteAccount().catch(onError) },
  ]);
  return <Screen>
    <PageTitle title="My family" sub="A familiar voice is a tap away." />
    {members.length ? <ListGroup>{members.map((m) => <CallRow key={m._id} member={m} dividerInset={18 + 60 + 16} />)}</ListGroup>
      : <Card style={st.empty}><T v="readHeadline" center>No family here yet</T><T v="readSmall" muted center>Invite them with a code below.</T></Card>}
    <BigButton tone={members.length ? 'plain' : 'lamp'} icon="person.badge.plus" title="Invite my family" sub={code ? `Your code: ${code.code}` : 'Share a code with them'} hint="Opens the share sheet with an invite code." onPress={invite} />
    <Section title="Stay safe" style={{ gap: 14 }}>
      <BigButton icon="shield.lefthalf.filled" title="Is this a scam?" sub="Porchlight calls you to check" chevron onPress={() => go('scam')} />
      <HelpButton />
    </Section>
    <Section title="My account" style={{ gap: 14 }}>
      <T v="readSmall" muted>Signed in as {senior.preferredName}{account.me?.phone ? ` · ${account.me.phone}` : ''}</T>
      <Button label="Sign out" icon="rectangle.portrait.and.arrow.right" onPress={account.signOut} />
      <Button variant="ghost" label="Delete my account" onPress={confirmDelete} />
    </Section>
    <AiPromise />
  </Screen>;
}

function CallRow({ member: m }) {
  const name = firstName(m.name);
  const sub = m.relation + (m.primary ? ' · First contact' : '');
  return <Pressable
    disabled={!m.phone}
    onPress={() => { haptic.tap(); openLink('tel:' + m.phone); }}
    accessibilityRole="button"
    accessibilityLabel={`Call ${name}. ${sub}`}
    accessibilityState={{ disabled: !m.phone }}
    style={({ pressed }) => [st.callRow, pressed && { backgroundColor: P.sunken }, !m.phone && { opacity: 0.45 }]}
  >
    <Avatar name={name} size={60} />
    <View style={{ flex: 1, gap: 2 }}>
      <T v="readHeadline" style={{ fontSize: 24, lineHeight: 30 }}>{'Call ' + name}</T>
      <T v="readSmall" muted>{sub}</T>
    </View>
    <View style={st.callDisc}><Icon name="phone.fill" size={24} color={accent.lampInk} /></View>
  </Pressable>;
}

function PageTitle({ title, sub }) {
  return <View style={st.greet}>
    <T v="readDisplay" style={st.name}>{title}</T>
    {sub ? <T v="read" muted>{sub}</T> : null}
  </View>;
}

// A centered page heading for the focused pages (scam check, phone help).
function PageHead({ icon, tone = 'lamp', title, sub }) {
  return <View style={st.pageHead}>
    <IconTile icon={icon} tone={tone} size={84} iconSize={42} style={{ borderRadius: 26 }} />
    <T v="readTitle" center>{title}</T>
    {sub ? <T v="read" muted center>{sub}</T> : null}
  </View>;
}

// ── Help with my phone ──────────────────────────────────────────────────────
// A picture of the screen (camera or screenshot) → what it is + ONE next step, read aloud.
// "I did it" asks for the next step; a new picture shows where she is now. Scams are called out.
function TechHelp({ senior, back }) {
  const [shot, setShot] = useState(null); // { base64, uri }
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const ask = async (img, q) => {
    setBusy(true);
    try {
      const r = await api.techHelp(senior._id, img.base64, q, history);
      setAnswer(r);
      setHistory((h) => [...h, { who: 'senior', text: q || 'What is this, and what should I do?' }, { who: 'porchlight', text: `${r.says} ${r.step}` }]);
      if (r.scam) haptic.warn(); else haptic.success();
      say(`${r.says} ${r.step}`);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (camera) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast.info('Porchlight needs permission', { description: camera ? 'Allow the camera in Settings to take a picture of the screen.' : 'Allow Photos in Settings to choose a screenshot.' });
      const opts = { base64: true, quality: 0.4, mediaTypes: ['images'] };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]?.base64) return;
      const img = { base64: res.assets[0].base64, uri: res.assets[0].uri };
      setShot(img);
      setAnswer(null);
      await ask(img, question.trim());
    } catch (e) {
      onError(e);
    }
  };

  const V = answer?.scam ? VERDICT.danger : answer?.done ? VERDICT.safe : VERDICT.step;
  return (
    <Screen>
      <BackLink onPress={back} />
      <PageHead icon="iphone" title="Help with my phone" sub={answer ? null : 'Show me the screen. I’ll tell you what to do, one step at a time.'} />
      <TextInput
        style={st.textarea}
        multiline
        value={question}
        onChangeText={setQuestion}
        placeholder="What would you like to do? (optional)"
        placeholderTextColor={P.muted}
        accessibilityLabel="Your question, optional"
      />
      {answer && (
        <Animated.View style={[st.verdict, { backgroundColor: V.bg, borderColor: V.border }]} accessibilityLiveRegion="polite">
          <View style={[st.verdictIcon, { backgroundColor: V.solid }]}><Icon name={answer.scam ? V.icon : answer.done ? V.icon : 'lightbulb.fill'} size={40} color={V.on} /></View>
          <Text style={[st.verdictWord, { color: V.fg }]}>{answer.scam ? 'This looks like a scam.' : answer.done ? 'All done.' : 'Next step'}</Text>
          <Text style={[st.verdictText, { textAlign: 'center' }]}>{answer.says}</Text>
          <View style={st.verdictPanel}><Text style={[st.verdictText, { fontFamily: font.readBold }]}>{answer.step}</Text></View>
          {answer.scam && <Notified />}
        </Animated.View>
      )}
      <View style={st.stack}>
        {answer && !answer.done && !answer.scam && <BigButton tone="lamp" icon="checkmark.circle.fill" title={busy ? 'Looking…' : 'I did it. What’s next?'} sub="Take a new picture if the screen changed" onPress={() => ask(shot, 'I did that. What do I do next?')} disabled={busy} />}
        <BigButton tone={answer ? 'plain' : 'lamp'} icon="camera.fill" title={busy ? 'Looking…' : answer ? 'Take a new picture' : 'Take a picture of the screen'} sub="Use this phone’s camera" onPress={() => pick(true)} disabled={busy} />
        <BigButton icon="photo" title="Choose a screenshot" sub="From your photos" onPress={() => pick(false)} disabled={busy} />
        {answer && <Button variant="primary" icon="house.fill" label="Back to start" onPress={back} />}
      </View>
    </Screen>
  );
}

// ── Is this a scam? ─────────────────────────────────────────────────────────
const VERDICT = {
  danger: { bg: accent.redSoft, border: 'rgba(217,63,43,0.28)', fg: accent.redText, solid: accent.red, on: '#FFFFFF', icon: 'exclamationmark.octagon.fill' },
  warn: { bg: accent.lampSoft, border: 'rgba(224,138,18,0.30)', fg: accent.lampText, solid: accent.lamp, on: accent.lampInk, icon: 'exclamationmark.triangle.fill' },
  safe: { bg: accent.greenSoft, border: 'rgba(47,138,78,0.24)', fg: accent.greenText, solid: accent.green, on: '#FFFFFF', icon: 'checkmark.shield.fill' },
  step: { bg: accent.lampSoft, border: 'rgba(224,138,18,0.30)', fg: accent.lampText, solid: accent.lamp, on: accent.lampInk, icon: 'lightbulb.fill' },
};

// "Is this a scam?" is a phone call: Porchlight rings, asks what happened, and says what to do.
// The verdict from that call shows here too.
function ScamCheck({ senior, state, back }) {
  const [asked, setAsked] = useState(null); // when she tapped
  const [busy, setBusy] = useState(false);
  const [opened] = useState(() => Date.now()); // only show a verdict from the last two hours
  const call = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.phoneCall(senior._id, 'scam');
      haptic.success();
      setAsked(Date.now());
      say('Your phone will ring. Tell Porchlight what happened.');
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const latest = (state.scamChecks || []).find((c) => c.channel === 'call' && opened - new Date(c.createdAt).getTime() < 2 * 3600000);
  const result = latest && (!asked || new Date(latest.createdAt).getTime() > asked - 60000) ? latest : null;
  const V = VERDICT[result?.verdict === 'likely scam' ? 'danger' : result?.verdict === 'be careful' ? 'warn' : 'safe'];

  return (
    <Screen>
      <BackLink onPress={back} />
      {result ? (
        <>
          <Animated.View style={[st.verdict, { backgroundColor: V.bg, borderColor: V.border }]} accessibilityLiveRegion="polite">
            <View style={[st.verdictIcon, { backgroundColor: V.solid }]}><Icon name={V.icon} size={40} color={V.on} /></View>
            <Text style={[st.verdictWord, { color: V.fg }]} accessibilityRole="header">
              {result.verdict === 'likely scam' ? 'This looks like a scam.' : result.verdict === 'be careful' ? 'Be careful.' : 'This looks okay.'}
            </Text>
            {result.redFlags?.length ? <View style={st.verdictPanel}>
              {result.redFlags.map((f) => (
                <View key={f} style={st.flag}>
                  <View style={[st.flagDot, { backgroundColor: V.solid }]} />
                  <Text style={[st.verdictText, { flex: 1 }]}>{f}</Text>
                </View>
              ))}
            </View> : null}
            <Text style={[st.verdictText, { textAlign: 'center' }]}>{result.advice}</Text>
            {result.verdict !== 'probably fine' && <Notified />}
          </Animated.View>
          <View style={st.stack}>
            <Button variant="primary" icon="house.fill" label="Back to start" onPress={back} />
            <Button variant="secondary" icon="phone.fill" label="Check something else" onPress={call} busy={busy} />
          </View>
        </>
      ) : (
        <>
          <PageHead icon="shield.lefthalf.filled" title="Is this a scam?" sub={asked ? 'Your phone will ring. Tell Porchlight who contacted you and what they wanted.' : 'Porchlight will call you. Tell it who contacted you and what they asked for, and it will tell you what to do.'} />
          {asked
            ? <Card style={st.notice} accessibilityLiveRegion="polite"><Lamp state="lit" size={52} still /><T v="read" style={{ flex: 1 }}>Calling you now. The answer shows here after the call too.</T></Card>
            : <BigButton tone="lamp" icon="phone.arrow.down.left" title={busy ? 'Calling…' : 'Call me about it'} sub="Your phone will ring" onPress={call} disabled={busy} />}
          <T v="readSmall" muted>Don’t send money, gift cards or codes to anyone while you wait.</T>
        </>
      )}
    </Screen>
  );
}

function Notified() {
  return <View style={st.notified}>
    <Icon name="person.2.fill" size={22} color={P.ink} />
    <Text style={[st.verdictText, { fontFamily: font.readBold, flexShrink: 1 }]}>I’ve let your family know.</Text>
  </View>;
}

// ── I need help ─────────────────────────────────────────────────────────────
function Help({ senior, back, refresh }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      await api.help(senior._id);
      haptic.warn();
      setSent(true);
      refresh();
    } catch (e) {
      onError(e);
    } finally {
      setSending(false);
    }
  };
  if (sent) {
    return (
      <Screen contentStyle={st.centerPage}>
        <Animated.View style={st.centerStack}>
          <Lamp state="alert" size={168} label="Help requested" />
          <T v="readTitle" center>Your help request is sent.</T>
          <T v="read" muted center>Porchlight has asked your family to contact you. A response is not confirmed yet. If you’re hurt, call 911.</T>
        </Animated.View>
        <View style={st.stack}>
          <Button variant="danger" icon="phone.fill" label="Call 911" accessibilityHint="Opens a phone call to 911." onPress={() => openLink('tel:911')} />
          <Button variant="secondary" icon="house.fill" label="Back to start" onPress={back} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      <BackLink onPress={back} label="No, go back" />
      <View style={st.pageHead}>
        <View style={st.helpHalo}><View style={st.helpDisc}><Icon name="hand.raised.fill" size={46} color="#FFFFFF" /></View></View>
        <T v="readDisplay" center style={st.name}>Do you need help now?</T>
        <T v="read" muted center>I’ll text your family right away, then your neighbor. If you’re hurt, call 911.</T>
      </View>
      <View style={st.stack}>
        <Button variant="danger" icon="bell.fill" label="Yes, alert my family" accessibilityHint="Texts your family now, then your neighbor." onPress={send} busy={sending} />
        <Button variant="secondary" icon="phone.fill" label="Call 911" accessibilityHint="Opens a phone call to 911." onPress={() => openLink('tel:911')} />
      </View>
    </Screen>
  );
}

function BackLink({ onPress, label = 'Back' }) {
  return (
    <Press onPress={onPress} accessibilityLabel={label} hitSlop={16} style={st.back}>
      <View style={st.backDisc}><Icon name="chevron.left" size={20} color={P.ink} weight="bold" /></View>
      <Text style={st.backText}>{label}</Text>
    </Press>
  );
}

const st = StyleSheet.create({
  greet: { gap: 2, paddingTop: 4 },
  name: { fontSize: 44, lineHeight: 50, letterSpacing: -1 },
  hero: { gap: 18, padding: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroStatus: { fontSize: 27, lineHeight: 32, letterSpacing: -0.4 },
  heroNext: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: 'rgba(255,247,236,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: night.line },
  heroNextTitle: { fontSize: 22, lineHeight: 28 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  promise: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 4, paddingTop: 4 },
  warm: { gap: 16 },
  warmHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  stack: { gap: 14 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 108, paddingHorizontal: 18, paddingVertical: 16 },
  callDisc: { width: 56, height: 56, borderRadius: 28, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center' },
  pageHead: { alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  centerPage: { flexGrow: 1, justifyContent: 'center' },
  centerStack: { alignItems: 'center', gap: 16 },
  // Talk
  talkHead: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.line },
  talkHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  talkStatus: { fontFamily: font.readBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: P.ink },
  talkSub: { fontFamily: font.read, fontSize: 20, lineHeight: 26, color: P.muted },
  toggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 10, minHeight: 56, paddingLeft: 16, paddingRight: 10, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  toggleOn: { backgroundColor: accent.lampSoft, borderColor: 'rgba(224,138,18,0.30)' },
  toggleOff: { backgroundColor: P.surface, borderColor: P.lineStrong },
  toggleText: { fontFamily: font.readBold, fontSize: 20, lineHeight: 25 },
  track: { width: 52, height: 34, borderRadius: 17, padding: 3, justifyContent: 'center' },
  knob: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', shadowColor: '#3B2A1A', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  transcript: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20, gap: 14 },
  themRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, maxWidth: '94%' },
  lampAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: night.bg, alignItems: 'center', justifyContent: 'center' },
  bubble: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24 },
  bubbleThem: { flexShrink: 1, backgroundColor: P.surface, borderTopLeftRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: P.line, ...shadow.card },
  bubbleMe: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: P.ink, borderBottomRightRadius: 8 },
  bubbleText: { fontFamily: font.read, fontSize: 22, lineHeight: 30, color: P.ink },
  typing: { paddingVertical: 22, paddingHorizontal: 22 },
  composer: { paddingHorizontal: 16, paddingTop: 10, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: P.line, backgroundColor: P.bg },
  typeRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  input: { flex: 1, minWidth: 0, minHeight: 68, maxHeight: 168, backgroundColor: P.surface, borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: P.lineStrong, paddingHorizontal: 22, paddingTop: 19, paddingBottom: 19, fontFamily: font.read, fontSize: 22, lineHeight: 28, color: P.ink },
  send: { width: 68, height: 68, borderRadius: 34, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center', shadowColor: '#C46E00', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  // Scam, phone help
  textarea: { minHeight: 168, backgroundColor: P.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: P.lineStrong, padding: 20, paddingTop: 18, fontFamily: font.read, fontSize: 22, lineHeight: 30, color: P.ink, textAlignVertical: 'top', ...shadow.card },
  verdict: { borderRadius: radius.xl, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 26, gap: 16, alignItems: 'center' },
  verdictIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  verdictWord: { fontFamily: font.readBold, fontSize: 32, lineHeight: 38, letterSpacing: -0.5, textAlign: 'center' },
  verdictPanel: { alignSelf: 'stretch', gap: 12, padding: 18, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.72)' },
  verdictText: { fontFamily: font.read, fontSize: 22, lineHeight: 30, color: P.ink },
  flag: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  flagDot: { width: 10, height: 10, borderRadius: 5, marginTop: 11 },
  notified: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.72)' },
  // Help, thanks
  helpHalo: { width: 132, height: 132, borderRadius: 66, backgroundColor: accent.redSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  helpDisc: { width: 96, height: 96, borderRadius: 48, backgroundColor: accent.red, alignItems: 'center', justifyContent: 'center' },
  thanksHero: { alignItems: 'center', gap: 14, paddingTop: 30, paddingBottom: 34, paddingHorizontal: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, alignSelf: 'flex-start', paddingRight: 12 },
  backDisc: { width: 48, height: 48, borderRadius: 24, backgroundColor: P.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: P.line, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  backText: { fontFamily: font.readBold, fontSize: 22, lineHeight: 28, color: P.ink },
});
