import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { api } from './api';
import { useCalendarSync } from './calendar';
import { notifyLocally, pushRegistered, startPush } from './push';
import { useMedReminders } from './meds/reminders';
import PillsCard from './meds/PillsCard';
import MedsList from './meds/MedsList';
import { useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { BigButton, Button, Press, T } from './design/ui';
import PlanRow, { upcomingPlans, isToday, dayLabel } from './design/PlanRow';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { toast } from './design/Toaster';
import { accent, seniorPalette as dark, ease, font, radius } from './design/tokens';

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

export default function SeniorScreen({ senior, page = 'today' }) {
  const { state, refresh, setRole } = useAppContext();
  useCalendarSync(senior, state);
  const primary = state.members.find((m) => m.circleId === senior.circleId && m.primary);
  const ride = (state.actions || []).find((a) => a.seniorId === senior._id && a.details?.uberLink && !['COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'].includes(a.status));
  const notices = (state.notices || []).filter((n) => n.seniorId === senior._id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  // Phone notifications: register this phone for Uber pushes, and tapping one opens Uber.
  useEffect(() => Platform.OS === 'web' ? undefined : startPush(senior._id), [senior._id]);
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

  const plans = upcomingPlans(state, senior);
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {page === 'today' && <Home senior={senior} primary={primary} plans={plans} state={state} refresh={refresh} notices={notices} />}
    {page === 'plans' && <Page><T v="readTitle">My plans</T><T v="read" muted>What’s coming up, all in one place.</T>
      {ride && <RideCard ride={ride} />}
      {plans.length ? plans.map((plan) => <PlanRow key={plan._id} plan={plan} senior={senior} state={state} />) : <T v="read" muted>No upcoming appointments. Your day is open.</T>}
      <MedsList senior={senior} state={state} refresh={refresh} />
      <Notices notices={notices} />
      <BigButton icon="bubble.left.and.bubble.right" title="Ask about my plans" sub="Talk with your AI helper" onPress={() => go('talk')} />
      <HelpButton />
    </Page>}
    {page === 'family' && <Page><T v="readTitle">My family</T><T v="read" muted>A familiar voice is a tap away.</T>
      {state.members.filter((m) => m.circleId === senior.circleId).map((m) => <BigButton key={m._id} icon="phone" title={'Call ' + m.name.split(' ')[0]} sub={m.relation + (m.primary ? ' · First contact' : '')} disabled={!m.phone} onPress={() => openLink('tel:' + m.phone)} />)}
      <BigButton icon="shield.lefthalf.filled" title="Is this a scam?" sub="Check a call, letter or message" onPress={() => go('scam')} />
      <HelpButton />
      <T v="readSmall" muted>Sample people. Tella is an AI helper. It never asks for money, codes, passwords or ID numbers.</T>
      <BigButton icon="person.crop.circle" title="Switch person" sub="Choose a different sample profile" onPress={() => setRole(null)} />
    </Page>}
    {page === 'talk' && <Talk senior={senior} done={() => { router.replace('/senior/thanks'); refresh(); }} />}
    {page === 'scam' && <ScamCheck senior={senior} back={home} />}
    {page === 'tech' && <TechHelp senior={senior} back={home} />}
    {page === 'help' && <Help senior={senior} back={home} refresh={refresh} />}
    {page === 'thanks' && <Thanks senior={senior} back={home} />}
  </KeyboardAvoidingView>;
}
function Page({ children, center }) {
  const insets = useSafeAreaInsets();
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[st.pad, center && st.center, { paddingTop: 28, paddingBottom: Math.max(insets.bottom, 24) }]}>
    {children}
  </ScrollView>;
}
function HelpButton() {
  return <BigButton tone="help" icon="hand.raised" title="I need help" sub="Ask your family to contact you" hint="Opens a confirmation before alerting anyone." onPress={() => go('help')} />;
}
function Home({ senior, primary, plans, state, refresh, notices }) {
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);
  const callReset = useRef(null);
  useEffect(() => () => clearTimeout(callReset.current), []);
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  const checkedIn = !['help', 'missed'].includes(senior.status) && isToday(senior.lastCheckinAt, senior.timezone);
  const imOkay = async () => {
    if (busy) return;
    setBusy(true);
    try { await api.ok(senior._id); await refresh(); router.push('/senior/thanks'); }
    catch (e) { onError(e); } finally { setBusy(false); }
  };
  const checkinButton = <BigButton tone="lamp" icon="checkmark.circle" title={busy ? 'Checking in…' : checkedIn ? 'Check in again' : 'I’m okay today'} sub="Let your family know" onPress={imOkay} disabled={busy} />;
  const callMe = async () => {
    if (calling) return;
    setCalling(true);
    try {
      await api.phoneCall(senior._id);
      haptic.success();
      toast.success('Your call is requested', { description: 'Pick up when your phone rings. Tella is an AI and will talk first.' });
      callReset.current = setTimeout(() => setCalling(false), 20000);
    } catch (_e) {
      haptic.warn();
      toast.info('The phone call didn’t go through', { description: 'Tap “Talk with Tella” to chat here, or try the call again.' });
      setCalling(false);
    }
  };
  return <Page>
    <View style={st.dailyTitle}><T v="readTitle" style={{ flex: 1 }}>Today, {senior.preferredName}.</T><Lamp state={lampState(senior)} size={64} /></View>
    {!compact && <T v="read" muted>Here’s your day, at a glance.</T>}
    {senior.status === 'help' && <View style={st.attention}><T v="readHeadline" color={accent.redText}>You’ve asked for help.</T><T v="readSmall">If you’re hurt or in danger, call 911.</T><BigButton title="Call 911" icon="phone" tone="help" onPress={() => openLink('tel:911')} /></View>}
    <T v="readSmall" style={{ marginTop: 8 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: senior.timezone })}</T>
    <View style={st.agendaRow}>
      <T v="readHeadline">{checkedIn ? 'You checked in today' : 'Daily check-in'}</T>
      <T v="readSmall" muted>{checkedIn ? 'Your update is shared with family.' : senior.autoCall ? 'Your daily call is set for ' + senior.checkinTime + '.' : 'Check in whenever you’re ready.'}</T>
    </View>
    {compact && checkinButton}
    {plans[0] ? <PlanRow plan={plans[0]} senior={senior} state={state} /> : <View style={st.agendaRow}><T v="readHeadline">A little room in your day</T><T v="readSmall" muted>No upcoming appointments.</T></View>}
    {!compact && checkinButton}
    <PillsCard senior={senior} state={state} refresh={refresh} />
    <BigButton icon="bubble.left.and.bubble.right" title="Talk with Tella" sub="Your AI helper for the day" onPress={() => go('talk')} />
    <BigButton icon="phone.arrow.down.left" title={calling ? 'Call requested…' : 'Call me now'} sub="Tella rings your phone" hint="Requests a phone call. Tella is an AI and will talk first." onPress={callMe} disabled={calling} />
    <HelpButton />
    <Notices notices={notices} />
    {primary && <BigButton icon="phone" title={'Call ' + primary.name.split(' ')[0]} sub={primary.relation} onPress={() => openLink('tel:' + primary.phone)} />}
    <BigButton icon="iphone" title="Help with my phone" sub="Show me the screen, I’ll walk you through it" hint="Take a picture of a screen and Tella explains what to do next." onPress={() => go('tech')} />
    <BigButton icon="shield.lefthalf.filled" title="Is this a scam?" sub="Check before you act" onPress={() => go('scam')} />
    <T v="readSmall" muted>Tella is an AI helper. It never asks for money, codes, passwords or ID numbers.</T>
  </Page>;
}
function Notices({ notices }) {
  if (!notices.length) return null;
  return <View style={st.stack}><T v="readHeadline">Updates for you</T>{notices.map((n) => <View key={n._id} style={st.agendaRow}>
    <T v="read">{n.text}</T>
    {n.simulated && <T v="readSmall" muted>{n.kind === 'ride' ? 'Demo update · not a real booking' : 'Sample update'}</T>}
    {n.uberLink && <BigButton icon="car" title="Book my Uber" sub="Confirm your ride in Uber" onPress={() => openLink(n.uberLink)} />}
  </View>)}</View>;
}
function RideCard({ ride }) {
  return <View style={st.notices}>
    <T v="readHeadline">Your ride</T>
    <T v="read">{ride.details.to}</T>
    {ride.details.pickupAt && <T v="readSmall" muted>{dayLabel(ride.details.pickupAt)}</T>}
    <BigButton tone="lamp" icon="car" title="Book with Uber" sub="Your trip is filled in" hint="Opens Uber. You confirm the booking and price there." onPress={() => openLink(ride.details.uberLink)} />
    <T v="readSmall" muted>{ride.simulated ? 'Tella’s booking is a demo. Confirm a real ride and its price in Uber.' : 'Confirm the ride and its price in Uber.'}</T>
  </View>;
}

function Talk({ senior, done }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
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

  const status = { starting: 'Calling…', speaking: 'Tella is talking', ready: 'Your turn', thinking: 'Thinking', ending: 'Saying goodbye…' }[phase];

  return (
    <View style={{ flex: 1, paddingTop: 0 }}>
      <View style={{ paddingHorizontal: 24 }}><BackLink onPress={() => checkin ? phase !== 'ending' && finish() : home()} label={checkin ? 'Finish this chat' : 'Back to Today'} /></View><View style={st.talkHead}>
        <Lamp state="lit" size={56} label="Porch light on" />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={st.talkStatus} accessibilityLiveRegion="polite">{status}</Text>
            {(phase === 'thinking' || phase === 'starting') && <Dots />}
          </View>
          <Text style={st.talkSub}>Tella is an AI</Text>
        </View>
        <View style={st.voiceToggle}>
          <Switch value={voiceOn} onValueChange={(v) => { haptic.select(); setVoiceOn(v); }} trackColor={{ true: accent.lamp }} accessibilityLabel="Read replies aloud" />
          <Text style={st.toggleLabel}>Read aloud</Text>
        </View>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={st.transcript} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
        {lines.map((l, i) => (
          <Animated.View key={i} entering={reduced ? undefined : FadeInDown.duration(250).easing(ease.out)} style={[st.bubble, l.who === 'senior' ? st.bubbleMe : st.bubbleThem]}>
            <Text style={[st.bubbleWho, l.who === 'senior' && { color: '#52525B' }]}>{l.who === 'porchlight' ? 'Tella' : senior.preferredName}</Text>
            <Text style={[st.bubbleText, l.who === 'senior' && { color: '#111' }]}>{l.text}</Text>
          </Animated.View>
        ))}
      </ScrollView>

      <View style={[st.composer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={st.hintRow}>
          <Icon name="mic.fill" size={15} color={dark.muted} />
          <Text style={st.hint}>Tap the microphone on the keyboard to speak.</Text>
        </View>
        <View style={st.typeRow}>
          <TextInput
            style={st.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Your answer"
            placeholderTextColor="#71717A"
            returnKeyType="send"
            onSubmitEditing={send}
            editable={phase !== 'ending'}
            accessibilityLabel="Your answer"
          />
          <Press onPress={send} disabled={!draft.trim() || !checkin || !['ready', 'speaking'].includes(phase)} accessibilityLabel="Send" style={st.sendBtn} feedback={null}>
            <Text style={{ fontFamily: font.readBold, fontSize: 22, color: accent.lampInk }}>Send</Text>
          </Press>
        </View>
        <Button label="I’m done talking" variant="ghost" onPress={() => finish()} disabled={!checkin || phase === 'ending'} style={{ alignSelf: 'center' }} />
      </View>
    </View>
  );
}

// Three dots while Tella thinks. Runs only while waiting.
function Dots() {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessible={false}>
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
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: dark.ink }, style]} />;
}

// Tech help: a picture of the screen (camera or screenshot) → what it is + ONE next step, read aloud.
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
      if (!perm.granted) return toast.info('Tella needs permission', { description: camera ? 'Allow the camera in Settings to take a picture of the screen.' : 'Allow Photos in Settings to choose a screenshot.' });
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

  return (
    <Page>
      <BackLink onPress={back} />
      <T v="readTitle">Help with my phone</T>
      <T v="read" muted>Show me the screen and I’ll tell you what to do, one step at a time.</T>
      <TextInput
        style={[st.input, st.textarea]}
        multiline
        value={question}
        onChangeText={setQuestion}
        placeholder="What would you like to do? (optional)"
        placeholderTextColor="#71717A"
        accessibilityLabel="Your question, optional"
      />
      {answer && (
        <Animated.View entering={FadeInDown.duration(300).easing(ease.out)} style={[st.verdict, { backgroundColor: answer.scam ? accent.redSoft : accent.greenSoft, borderColor: answer.scam ? accent.red : accent.green }]} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name={answer.scam ? 'exclamationmark.octagon.fill' : 'lightbulb.fill'} size={30} color={answer.scam ? accent.redText : accent.greenText} />
            <Text style={[st.verdictWord, { color: answer.scam ? accent.redText : accent.greenText, flex: 1 }]}>{answer.scam ? 'This looks like a scam.' : answer.done ? 'All done.' : 'Next step'}</Text>
          </View>
          <Text style={st.verdictText}>{answer.says}</Text>
          <Text style={[st.verdictText, { fontFamily: font.readBold }]}>{answer.step}</Text>
          {answer.scam && <Text style={st.verdictText}>I’ve let your family know.</Text>}
        </Animated.View>
      )}
      <View style={st.stack}>
        {answer && !answer.done && !answer.scam && <BigButton tone="lamp" icon="checkmark.circle" title={busy ? 'Looking…' : 'I did it. What’s next?'} sub="Take a new picture if the screen changed" onPress={() => ask(shot, 'I did that. What do I do next?')} disabled={busy} />}
        <BigButton tone={answer ? 'plain' : 'lamp'} icon="camera" title={busy ? 'Looking…' : answer ? 'Take a new picture' : 'Take a picture of the screen'} sub="Use this phone’s camera" onPress={() => pick(true)} disabled={busy} />
        <BigButton icon="photo" title="Choose a screenshot" sub="From your photos" onPress={() => pick(false)} disabled={busy} />
        {answer && <BigButton icon="house.fill" title="Back to start" onPress={back} />}
      </View>
    </Page>
  );
}

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

  const tone = result?.verdict === 'likely scam' ? 'danger' : result?.verdict === 'be careful' ? 'warn' : 'safe';
  const V = {
    danger: { bg: accent.redSoft, border: accent.red, fg: accent.redText, icon: 'exclamationmark.octagon.fill' },
    warn: { bg: accent.lampSoft, border: accent.lamp, fg: accent.lampText, icon: 'exclamationmark.triangle.fill' },
    safe: { bg: accent.greenSoft, border: accent.green, fg: accent.greenText, icon: 'checkmark.shield.fill' },
  }[tone];

  return (
    <Page>
      <BackLink onPress={back} />
      <T v="readTitle">Is this a scam?</T>
      <T v="read" muted>Tell me who contacted you and what they asked for.</T>
      {!result ? (
        <View style={st.stack}>
          <TextInput
            style={[st.input, st.textarea]}
            multiline
            value={text}
            onChangeText={setText}
            placeholder="A man called and said my grandson is in jail…"
            placeholderTextColor="#71717A"
            accessibilityLabel="Describe the call or message"
          />
          <View style={st.hintRow}>
            <Icon name="mic.fill" size={15} color={dark.muted} />
            <Text style={st.hint}>Tap the microphone on the keyboard to say it out loud.</Text>
          </View>
          <BigButton tone="lamp" icon="magnifyingglass" title={busy ? 'Checking…' : 'Check it'} onPress={check} disabled={busy || !text.trim()} />
        </View>
      ) : (
        <Animated.View entering={FadeInDown.duration(300).easing(ease.out)} style={[st.verdict, { backgroundColor: V.bg, borderColor: V.border }]} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name={V.icon} size={32} color={V.fg} />
            <Text style={[st.verdictWord, { color: V.fg }]}>
              {result.verdict === 'likely scam' ? 'This looks like a scam.' : result.verdict === 'be careful' ? 'Be careful.' : 'This looks okay.'}
            </Text>
          </View>
          {result.redFlags?.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={[st.verdictText, { color: V.fg }]}>•</Text>
              <Text style={[st.verdictText, { flex: 1 }]}>{f}</Text>
            </View>
          ))}
          <Text style={st.verdictText}>{result.advice}</Text>
          {result.verdict !== 'probably fine' && <Text style={[st.verdictText, { fontFamily: font.readBold }]}>I’ve let your family know.</Text>}
        </Animated.View>
      )}
      {result && <BigButton icon="house.fill" title="Back to start" onPress={back} />}
    </Page>
  );
}

function Help({ senior, back, refresh }) {
  const [sent, setSent] = useState(false);
  const send = async () => {
    try {
      await api.help(senior._id);
      haptic.warn();
      setSent(true);
      refresh();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <Page>
      {!sent ? (
        <>
          <BackLink onPress={back} label="No, go back" />
          <T v="readTitle">Do you need help now?</T>
          <T v="read" muted>I’ll text your family right away, then your neighbor. If you’re hurt, call 911.</T>
          <View style={st.stack}>
            <BigButton tone="help" icon="bell.and.waves.left.and.right.fill" title="Yes, alert my family" hint="Texts your family now, then your neighbor." onPress={send} />
            <BigButton icon="phone.fill" title="Call 911" hint="Opens a phone call to 911." onPress={() => Linking.openURL('tel:911')} />
          </View>
        </>
      ) : (
        <Animated.View entering={FadeIn.duration(250)} style={{ gap: 18, alignItems: 'center' }}>
          <Lamp state="alert" size={160} label="Help requested" />
          <T v="readTitle" center>Your help request is sent.</T>
          <T v="read" muted center>Tella has asked your family to contact you. A response is not confirmed yet. If you’re hurt, call 911.</T>
          <BigButton tone="help" icon="phone.fill" title="Call 911" hint="Opens a phone call to 911." onPress={() => Linking.openURL('tel:911')} style={{ alignSelf: 'stretch' }} />
          <Button label="Back to start" variant="ghost" onPress={back} />
        </Animated.View>
      )}
    </Page>
  );
}

// The light switching on: the one celebration in the app.
function Thanks({ senior, back }) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setLit(true); haptic.success(); }, 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <Page center>
      <Lamp state={lit ? 'lit' : 'dim'} size={180} label="Porch light on" />
      <T v="readTitle" center>Thank you, {senior.preferredName}.</T>
      <T v="read" muted center>Your check-in is saved. Your family can see your update.</T>
      <BigButton icon="house.fill" title="Back to start" onPress={back} style={{ alignSelf: 'stretch', marginTop: 8 }} />
    </Page>
  );
}

function BackLink({ onPress, label = 'Back' }) {
  return (
    <Press onPress={onPress} accessibilityLabel={label} style={st.back}>
      <Icon name="chevron.left" size={18} color={dark.ink} weight="bold" />
      <Text style={st.backText}>{label}</Text>
    </Press>
  );
}

const st = StyleSheet.create({
  pad: { paddingHorizontal: 24, gap: 20, width: '100%', maxWidth: 680, alignSelf: 'center' }, dailyTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 }, agendaRow: { paddingVertical: 16, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: dark.line }, attention: { gap: 14, padding: 20, backgroundColor: accent.redSoft, borderRadius: radius.md },
  center: { alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: -10 },
  statusPill: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: dark.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontFamily: font.readBold, fontSize: 20, color: dark.ink2, flexShrink: 1 },
  stack: { gap: 12 },
  notices: { backgroundColor: dark.surface, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: dark.lineStrong, padding: 20, gap: 16 },
  noticesHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticesTitle: { fontFamily: font.readBold, fontSize: 22, color: dark.ink },
  notice: { flexDirection: 'row', gap: 12 },
  noticeText: { fontFamily: font.read, fontSize: 22, lineHeight: 30, color: dark.ink },
  noticeMeta: { fontFamily: font.read, fontSize: 20, color: dark.muted },
  footer: { fontFamily: font.read, fontSize: 20, lineHeight: 22, color: dark.muted, textAlign: 'center', paddingHorizontal: 12 },
  talkHead: { flexWrap: 'wrap', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: dark.line },
  talkStatus: { fontFamily: font.readBold, fontSize: 22, color: dark.ink },
  talkSub: { fontFamily: font.read, fontSize: 20, color: dark.muted },
  voiceToggle: { alignItems: 'center', gap: 4 },
  toggleLabel: { fontFamily: font.read, fontSize: 20, color: dark.muted },
  transcript: { padding: 16, gap: 12 },
  bubble: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24, maxWidth: '88%' },
  bubbleThem: { backgroundColor: dark.raised, alignSelf: 'flex-start', borderBottomLeftRadius: 8 },
  bubbleMe: { backgroundColor: '#FAFAFA', alignSelf: 'flex-end', borderBottomRightRadius: 8 },
  bubbleWho: { fontFamily: font.readBold, fontSize: 20, color: dark.muted, marginBottom: 3 },
  bubbleText: { fontFamily: font.read, fontSize: 22, lineHeight: 30, color: dark.ink },
  composer: { paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dark.line, backgroundColor: dark.bg },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { fontFamily: font.read, fontSize: 20, color: dark.muted, flex: 1 },
  typeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 60, backgroundColor: dark.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: dark.lineStrong, paddingHorizontal: 18, fontFamily: font.read, fontSize: 22, color: dark.ink },
  textarea: { minHeight: 150, paddingTop: 16, textAlignVertical: 'top', flex: 0 },
  sendBtn: { width: 104, minHeight: 104, borderRadius: 16, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center' },
  verdict: { borderRadius: radius.xl, borderWidth: 1, padding: 22, gap: 12 },
  verdictWord: { fontFamily: font.readBold, fontSize: 28, lineHeight: 34, flex: 1 },
  verdictText: { fontFamily: font.read, fontSize: 21, lineHeight: 29, color: dark.ink },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 104, alignSelf: 'stretch' },
  backText: { fontFamily: font.readBold, fontSize: 20, color: dark.ink },
});
