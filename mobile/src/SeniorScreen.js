import { Children, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { api } from './api';
import { useCalendarSync } from './calendar';
import { notifyLocally, pushRegistered, startPush } from './push';
import { useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { Appear, Avatar, BigButton, Button, Card, HeroCard, IconTile, ListGroup, Press, Screen, Section, T, Tile, useSettled } from './design/ui';
import PlanRow, { upcomingPlans, isToday, dayLabel } from './design/PlanRow';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { toast } from './design/Toaster';
import { accent, night, seniorPalette as P, ease, font, radius, shadow } from './design/tokens';

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

export default function SeniorScreen({ senior, page = 'today' }) {
  const { state, refresh, setRole } = useAppContext();
  useCalendarSync(senior, state);
  const members = state.members.filter((m) => m.circleId === senior.circleId);
  const primary = members.find((m) => m.primary);
  const ride = (state.actions || []).find((a) => a.seniorId === senior._id && a.details?.uberLink && !['COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'].includes(a.status));
  const notices = (state.notices || []).filter((n) => n.seniorId === senior._id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  // Phone notifications: register this phone for Uber pushes, and tapping one opens Uber.
  useEffect(() => Platform.OS === 'web' ? undefined : startPush(senior._id), [senior._id]);
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

  const plans = upcomingPlans(state, senior);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {page === 'today' && <Home senior={senior} primary={primary} plans={plans} refresh={refresh} notices={notices} />}
    {page === 'plans' && <Plans senior={senior} plans={plans} state={state} ride={ride} notices={notices} />}
    {page === 'family' && <Family members={members} setRole={setRole} />}
    {page === 'talk' && <Talk senior={senior} done={() => { router.replace('/senior/thanks'); refresh(); }} />}
    {page === 'scam' && <ScamCheck senior={senior} back={home} />}
    {page === 'tech' && <TechHelp senior={senior} back={home} />}
    {page === 'help' && <Help senior={senior} back={home} refresh={refresh} />}
    {page === 'thanks' && <Thanks senior={senior} back={home} />}
  </KeyboardAvoidingView>;
}

// ── Today ───────────────────────────────────────────────────────────────────
function Home({ senior, primary, plans, refresh, notices }) {
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const callReset = useRef(null);
  useEffect(() => () => clearTimeout(callReset.current), []);
  const settled = useSettled();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  const tz = zone(senior);
  const help = senior.status === 'help';
  const checkedIn = !['help', 'missed'].includes(senior.status) && isToday(senior.lastCheckinAt, senior.timezone);
  const imOkay = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.ok(senior._id); await refresh(); router.push('/senior/thanks'); }
    catch (e) { onError(e); } finally { setBusy(false); }
  };
  const callMe = async () => {
    if (calling) return;
    setCalling(true);
    try {
      await api.phoneCall(senior._id);
      haptic.success();
      toast.success('Your call is requested', { description: 'Pick up when your phone rings. Porchlight is an AI and will talk first.' });
      callReset.current = setTimeout(() => setCalling(false), 20000);
    } catch (_e) {
      haptic.warn();
      toast.info('The phone call didn’t go through', { description: 'Tap “Talk with Porchlight” to chat here, or try the call again.' });
      setCalling(false);
    }
  };

  const status = help ? 'You asked for help' : checkedIn ? 'You checked in today' : 'Waiting for today’s check-in';
  const detail = help ? 'Your family has been asked to contact you.'
    : checkedIn ? 'Your family can see it.'
      : senior.status === 'missed' ? 'Tap “I’m okay today” when you can.'
        : senior.autoCall ? 'Porchlight will call at ' + clock12(senior.checkinTime) + '.' : 'Check in when you’re ready.';
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

    <Appear on index={2}>
      <BigButton tone="lamp" icon="bubble.left.and.bubble.right.fill" title="Talk with Porchlight" sub="Your AI helper" chevron onPress={() => go('talk')} />
    </Appear>

    <Appear on index={3} style={st.grid}>
      <ActionGrid compact={compact}>
        <Action compact={compact} icon="checkmark.circle.fill" title={busy ? 'Checking in…' : checkedIn ? 'Check in again' : 'I’m okay today'} sub="Tell my family" onPress={imOkay} disabled={busy} />
        <Action compact={compact} icon="phone.arrow.down.left" title={calling ? 'Call requested' : 'Call me now'} sub="Rings my phone" hint="Requests a phone call. Porchlight is an AI and will talk first." onPress={callMe} disabled={calling} />
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
  const demo = n.simulated ? (n.kind === 'ride' ? 'Demo update · not a real booking' : 'Sample update') : null;
  if (n.uberLink) {
    return <Card tone="lamp" style={st.warm}>
      <View style={st.warmHead}>
        <IconTile icon="car.fill" tone="amber" size={56} iconSize={28} style={{ borderRadius: 18 }} />
        <T v="readHeadline" style={{ flex: 1 }}>Your ride</T>
      </View>
      <T v="read">{n.text}</T>
      <BigButton tone="lamp" icon="car.fill" title="Book my Uber" sub="Confirm your ride in Uber" hint="Opens Uber. You confirm the booking and price there." onPress={() => openLink(n.uberLink)} />
      {demo && <T v="readSmall" muted>{demo}</T>}
    </Card>;
  }
  const icon = n.kind === 'ride' ? 'car.fill' : n.kind === 'task' ? 'checkmark.circle.fill' : 'bell.fill';
  return <Card style={st.notice}>
    <IconTile icon={icon} tone="lamp" size={52} iconSize={26} style={{ borderRadius: 16 }} />
    <View style={{ flex: 1, gap: 6 }}>
      <T v="read">{n.text}</T>
      {demo && <T v="readSmall" muted>{demo}</T>}
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
    <T v="readSmall" muted>{ride.simulated ? 'Porchlight’s booking is a demo. Confirm a real ride and its price in Uber.' : 'Confirm the ride and its price in Uber.'}</T>
  </Card>;
}

// ── My plans ────────────────────────────────────────────────────────────────
function Plans({ senior, plans, state, ride, notices }) {
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
    <Notices notices={rest} settled={settled} />
    <BigButton icon="bubble.left.and.bubble.right.fill" title="Ask about my plans" sub="Talk with your AI helper" chevron onPress={() => go('talk')} />
    <HelpButton />
  </Screen>;
}

// ── My family ───────────────────────────────────────────────────────────────
function Family({ members, setRole }) {
  return <Screen>
    <PageTitle title="My family" sub="A familiar voice is a tap away." />
    <ListGroup>{members.map((m) => <CallRow key={m._id} member={m} dividerInset={18 + 60 + 16} />)}</ListGroup>
    <Section title="Stay safe" style={{ gap: 14 }}>
      <BigButton icon="shield.lefthalf.filled" title="Is this a scam?" sub="Check a call, letter or message" chevron onPress={() => go('scam')} />
      <HelpButton />
    </Section>
    <BigButton icon="person.crop.circle" title="Switch person" sub="Choose a different sample profile" onPress={() => setRole(null)} />
    <AiPromise>{'Sample people. ' + AI_PROMISE}</AiPromise>
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

function MicHint({ children }) {
  return <View style={st.inline}>
    <Icon name="mic.fill" size={22} color={P.muted} />
    <T v="readSmall" muted style={{ flex: 1 }}>{children}</T>
  </View>;
}

// The tab bar and the "done" button step aside while the keyboard is up.
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return shown;
}

// ── Talk with Porchlight ────────────────────────────────────────────────────
function Talk({ senior, done }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
  const [checkin, setCheckin] = useState(null);
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState('starting'); // starting | speaking | ready | thinking | ending
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceRef = useRef(true);
  const scroller = useRef(null);
  const started = useRef(false);

  useEffect(() => { voiceRef.current = voiceOn; if (!voiceOn) Speech.stop(); }, [voiceOn]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const c = await api.startCheckin(senior._id);
        setCheckin(c);
        setLines(c.transcript);
        setPhase('speaking');
        if (voiceRef.current) await say(c.transcript[0].text);
        setPhase('ready');
      } catch (e) {
        onError(e);
        setPhase('ready');
      }
    })();
    return () => { Speech.stop(); };
  }, [senior._id]);

  const finish = async (c = checkin) => {
    if (!c) return;
    setPhase('ending');
    Speech.stop();
    try {
      await api.finish(c._id);
      done();
    } catch (e) {
      onError(e);
      setPhase('ready');
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !checkin || !['ready', 'speaking'].includes(phase)) return;
    haptic.tap();
    setDraft('');
    Speech.stop();
    setLines((l) => [...l, { who: 'senior', text }]);
    setPhase('thinking');
    try {
      const r = await api.say(checkin._id, text);
      setLines((l) => [...l, { who: 'porchlight', text: r.reply }]);
      setPhase('speaking');
      if (voiceRef.current) await say(r.reply);
      if (r.ended) return finish(checkin);
      setPhase('ready');
    } catch (e) {
      onError(e);
      setPhase('ready');
    }
  };

  const status = { starting: 'Starting…', speaking: 'Porchlight is talking', ready: 'Your turn', thinking: 'Thinking…', ending: 'Saying goodbye…' }[phase];
  const waiting = phase === 'thinking' || phase === 'starting';
  const canSend = !!draft.trim() && !!checkin && ['ready', 'speaking'].includes(phase);

  return (
    <View style={{ flex: 1 }}>
      <View style={st.talkHead}>
        <View style={st.talkHeadRow}>
          <Lamp state="lit" size={52} label="Porch light on" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={st.talkStatus} accessibilityLiveRegion="polite">{status}</Text>
            <Text style={st.talkSub}>Porchlight is an AI</Text>
          </View>
        </View>
        <VoiceToggle on={voiceOn} onChange={(v) => { haptic.select(); setVoiceOn(v); }} />
      </View>

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={st.transcript}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        {lines.map((l, i) => <Bubble key={i} line={l} reduced={reduced} />)}
        {waiting && <Typing reduced={reduced} />}
      </ScrollView>

      <View style={[st.composer, { paddingBottom: keyboard ? 12 : insets.bottom + 12 }]}>
        <MicHint>Tap the keyboard mic to speak.</MicHint>
        <View style={st.typeRow}>
          <TextInput
            style={st.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Your answer"
            placeholderTextColor={P.muted}
            multiline
            {...(Platform.OS === 'web' ? { rows: 1 } : null)}
            blurOnSubmit
            returnKeyType="send"
            onSubmitEditing={send}
            editable={phase !== 'ending'}
            accessibilityLabel="Your answer"
          />
          <Press onPress={send} disabled={!canSend} hitSlop={18} accessibilityLabel="Send" style={st.send} feedback={null}>
            <Icon name="arrow.up" size={32} color={accent.lampInk} weight="bold" />
          </Press>
        </View>
        {!keyboard && <Button
          label={checkin ? 'I’m done talking' : 'Back to Today'}
          icon={checkin ? 'checkmark' : 'chevron.left'}
          variant="secondary"
          onPress={() => (checkin ? finish() : home())}
          disabled={phase === 'ending'}
        />}
      </View>
    </View>
  );
}

// Porchlight speaks from the left, next to a small lamp; Peggy's words sit on the right in ink.
function Bubble({ line, reduced }) {
  const me = line.who === 'senior';
  const entering = reduced ? undefined : FadeInDown.duration(250).easing(ease.out);
  if (me) {
    return <Animated.View entering={entering} style={[st.bubble, st.bubbleMe]} accessible accessibilityLabel={'You said: ' + line.text}>
      <Text style={[st.bubbleText, { color: night.ink }]}>{line.text}</Text>
    </Animated.View>;
  }
  return <Animated.View entering={entering} style={st.themRow} accessible accessibilityLabel={'Porchlight said: ' + line.text}>
    <LampAvatar />
    <View style={[st.bubble, st.bubbleThem]}><Text style={st.bubbleText}>{line.text}</Text></View>
  </Animated.View>;
}
function LampAvatar() {
  return <View style={st.lampAvatar}><Lamp state="lit" size={40} night /></View>;
}
function Typing({ reduced }) {
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={st.themRow} accessible accessibilityLabel="Porchlight is thinking">
    <LampAvatar />
    <View style={[st.bubble, st.bubbleThem, st.typing]}><Dots /></View>
  </Animated.View>;
}

// A clear on/off chip for reading replies aloud.
function VoiceToggle({ on, onChange }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(on ? 18 : 0);
  useEffect(() => { x.set(reduced ? (on ? 18 : 0) : withTiming(on ? 18 : 0, { duration: 180, easing: ease.out })); }, [on, reduced, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <Press
      onPress={() => onChange(!on)}
      feedback={null}
      hitSlop={16}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Read replies aloud"
      style={[st.toggle, on ? st.toggleOn : st.toggleOff]}
    >
      <Icon name={on ? 'speaker.wave.2.fill' : 'speaker.slash.fill'} size={22} color={on ? accent.lampText : P.muted} />
      <Text style={[st.toggleText, { color: on ? accent.lampText : P.ink2 }]}>{on ? 'Read aloud is on' : 'Read aloud is off'}</Text>
      <View style={[st.track, { backgroundColor: on ? accent.lamp : P.lineStrong }]}>
        <Animated.View style={[st.knob, knob]} />
      </View>
    </Press>
  );
}

// Three dots while Porchlight thinks. Runs only while waiting.
function Dots() {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessible={false}>
      {[0, 1, 2].map((i) => <Dot key={i} i={i} />)}
    </View>
  );
}
function Dot({ i }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0.3);
  useEffect(() => {
    if (reduced) { o.set(0.8); return; }
    o.set(withDelay(i * 150, withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })), -1)));
  }, [i, o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: P.muted }, style]} />;
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
        <Animated.View entering={FadeInDown.duration(300).easing(ease.out)} style={[st.verdict, { backgroundColor: V.bg, borderColor: V.border }]} accessibilityLiveRegion="polite">
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

function ScamCheck({ senior, back }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await api.scamCheck(senior._id, text);
      setResult(r);
      if (r.verdict === 'likely scam') haptic.warn();
      say(`${r.verdict === 'likely scam' ? 'This looks like a scam.' : r.verdict === 'be careful' ? 'Be careful with this one.' : 'This looks okay.'} ${r.advice}`);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const V = VERDICT[result?.verdict === 'likely scam' ? 'danger' : result?.verdict === 'be careful' ? 'warn' : 'safe'];

  return (
    <Screen>
      <BackLink onPress={back} />
      {!result ? (
        <>
          <PageHead icon="shield.lefthalf.filled" title="Is this a scam?" sub="Tell me who contacted you and what they asked for." />
          <TextInput
            style={st.textarea}
            multiline
            value={text}
            onChangeText={setText}
            placeholder="A man called and said my grandson is in jail…"
            placeholderTextColor={P.muted}
            accessibilityLabel="Describe the call or message"
          />
          <MicHint>Tap the microphone on the keyboard to say it out loud.</MicHint>
          <BigButton tone="lamp" icon="magnifyingglass" title={busy ? 'Checking…' : 'Check it'} sub="Porchlight looks for warning signs" onPress={check} disabled={busy || !text.trim()} />
        </>
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(300).easing(ease.out)} style={[st.verdict, { backgroundColor: V.bg, borderColor: V.border }]} accessibilityLiveRegion="polite">
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
            <Button variant="secondary" label="Check something else" onPress={() => { setResult(null); setText(''); }} />
          </View>
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
        <Animated.View entering={FadeIn.duration(250)} style={st.centerStack}>
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

// ── Thank you: the light switching on, the one celebration in the app ────────
function Thanks({ senior, back }) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setLit(true); haptic.success(); }, 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <Screen contentStyle={st.centerPage}>
      <HeroCard glowAt="center" style={st.thanksHero}>
        <Lamp state={lit ? 'lit' : 'dim'} size={168} label="Porch light on" />
        <T v="readDisplay" center style={st.name}>Thank you, {senior.preferredName}.</T>
        <T v="read" muted center>Your check-in is saved. Your family can see your update.</T>
      </HeroCard>
      <Button variant="primary" icon="house.fill" label="Back to start" onPress={back} />
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
  lampAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: night.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
