import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { api } from './api';
import { useCalendarSync } from './calendar';
import { notifyLocally, pushRegistered, startPush } from './push';
import { HEADER_H, useAppContext } from './AppContext';
import Lamp, { lampState } from './Lamp';
import { BigButton, Button, Press, T } from './design/ui';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { toast } from './design/Toaster';
import { accent, dark, ease, font, radius } from './design/tokens';

// Peggy's side. Evening palette, Atkinson Hyperlegible, text ≥ 20pt, buttons ≥ 104pt.

function greetingFor(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function say(text) {
  return new Promise((resolve) => {
    Speech.stop();
    Speech.speak(text, { rate: 0.92, language: 'en-US', onDone: resolve, onStopped: resolve, onError: resolve });
  });
}

const onError = (e) => toast.error('Something went wrong', { description: e.message });

export default function SeniorScreen({ senior }) {
  const { state, refresh } = useAppContext();
  const [mode, setMode] = useState('home'); // home | talk | scam | help | thanks
  const primary = state.members.find((m) => m.circleId === senior.circleId && m.primary);
  const home = () => setMode('home');
  useCalendarSync(senior, state); // her iPhone calendar in, Porchlight's rides/reminders/call-backs out
  // Confirmed facts only (a ride that's booked, a task someone claimed). Newest first.
  // Her next ride, if Porchlight is arranging one. Peggy books the real Uber herself; family is only told.
  const ride = (state.actions || []).find((a) => a.seniorId === senior._id && a.details?.uberLink && !['COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'].includes(a.status));
  const notices = (state.notices || [])
    .filter((n) => n.seniorId === senior._id)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 3);

  // Phone notifications: register this phone for Uber pushes, and tapping one opens Uber.
  useEffect(() => startPush(senior._id), [senior._id]);
  // Fallback when push isn't set up: the app shows the Uber notification itself for rides that arrive while it's open.
  const seen = useRef(null);
  useEffect(() => {
    const ubers = (state.notices || []).filter((n) => n.seniorId === senior._id && n.kind === 'uber');
    if (seen.current === null) { seen.current = new Set(ubers.map((n) => n._id)); return; }
    for (const n of ubers) {
      if (seen.current.has(n._id)) continue;
      seen.current.add(n._id);
      if (!pushRegistered) notifyLocally({ title: 'Your Uber is ready to book', body: 'Tap to open Uber with your trip filled in, then press Request.', url: n.uberLink });
    }
  }, [state.notices, senior._id]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Animated.View key={mode} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        {mode === 'home' && <Home senior={senior} ride={ride} notices={notices} primary={primary} setMode={setMode} refresh={refresh} />}
        {mode === 'talk' && <Talk senior={senior} done={() => { setMode('thanks'); refresh(); }} />}
        {mode === 'scam' && <ScamCheck senior={senior} back={home} />}
        {mode === 'help' && <Help senior={senior} back={home} refresh={refresh} />}
        {mode === 'thanks' && <Thanks senior={senior} back={home} />}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function rideTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.round((new Date(d.toDateString()) - new Date(new Date().toDateString())) / 86400000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function RideCard({ ride }) {
  const d = ride.details || {};
  const to = String(d.to || '').replace(/\s*\(sample\)/i, '');
  const pickup = rideTime(d.pickupAt);
  return (
    <Animated.View entering={FadeInDown.duration(300).easing(ease.out)} style={st.notices} accessibilityLiveRegion="polite">
      <View style={st.noticesHead}>
        <Icon name="car.fill" size={18} color={accent.lamp} />
        <Text style={st.noticesTitle} accessibilityRole="header">Your ride</Text>
      </View>
      <Text style={st.noticeText}>{pickup ? `Pickup ${pickup.charAt(0).toLowerCase() + pickup.slice(1)}` : 'A ride is being arranged'}{to ? `, to ${to}.` : '.'}</Text>
      <BigButton
        tone="lamp"
        icon="car.side.fill"
        title="Book with Uber"
        sub="Your address is filled in"
        hint="Opens the Uber app with your pickup and drop-off filled in. You confirm the ride there."
        onPress={() => Linking.openURL(d.uberLink)}
      />
      {ride.simulated && <Text style={st.noticeMeta}>Porchlight’s booking is a demo. Uber is the real one.</Text>}
    </Animated.View>
  );
}

function Page({ children, center }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[st.pad, center && st.center, { paddingTop: insets.top + HEADER_H + 16, paddingBottom: insets.bottom + 40 }]}
    >
      {children}
    </ScrollView>
  );
}

function Home({ senior, ride, notices, primary, setMode, refresh }) {
  const [busy, setBusy] = useState(false);
  const checkedIn = !['help', 'missed'].includes(senior.status) && !!senior.lastCheckinAt && new Date(senior.lastCheckinAt).toDateString() === new Date().toDateString();
  const lamp = lampState(senior);
  const primaryFirst = primary?.name.split(' ')[0];

  const imOkay = async () => {
    setBusy(true);
    try {
      await api.ok(senior._id);
      await refresh();
      setMode('thanks');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  // Rings her real phone (Twilio). Without Twilio set up the server says no; point her to Talk instead.
  const [calling, setCalling] = useState(false);
  const callMe = async () => {
    setCalling(true);
    try {
      await api.phoneCall(senior._id);
      haptic.success();
      toast.success('Calling your phone now…', { description: 'Pick up when it rings. Porchlight is an AI and will talk first.' });
      setTimeout(() => setCalling(false), 20000); // one call at a time
    } catch (e) {
      haptic.warn();
      toast.info('Phone calls aren’t set up here', { description: 'Tap “Talk with Porchlight” instead.' });
      setCalling(false);
    }
  };

  return (
    <Page>
      <View style={st.hero}>
        <Lamp state={lamp} size={96} label={checkedIn ? 'Porch light on. You checked in today.' : 'Porch light waiting for today’s check-in'} />
        <View style={[st.statusPill, checkedIn && { backgroundColor: 'rgba(245,165,36,0.14)' }]}>
          <View style={[st.statusDot, { backgroundColor: checkedIn ? accent.lamp : dark.muted }]} />
          <Text style={[st.statusText, checkedIn && { color: '#FFD58A' }]}>{checkedIn ? 'You checked in today' : 'Waiting for today’s check-in'}</Text>
        </View>
      </View>
      <T v="readTitle" style={{ marginTop: -6 }}>{greetingFor()},{'\n'}{senior.preferredName}.</T>

      {notices.length > 0 && (
        <Animated.View entering={FadeInDown.duration(300).easing(ease.out)} layout={LinearTransition.duration(200)} style={st.notices} accessibilityLiveRegion="polite">
          <View style={st.noticesHead}>
            <Icon name="sparkles" size={18} color={accent.lamp} />
            <Text style={st.noticesTitle} accessibilityRole="header">Good news</Text>
          </View>
          {notices.map((n) => (
            <View key={n._id} style={{ gap: 12 }}>
            <View style={st.notice} accessible accessibilityLabel={`${n.text}${n.simulated ? ' This is a demo booking.' : ''}`}>
              <Icon name="checkmark.circle.fill" size={22} color="#6FCF8E" style={{ marginTop: 4 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={st.noticeText}>{n.text}</Text>
                {n.simulated && <Text style={st.noticeMeta}>Demo booking</Text>}
              </View>
            </View>
            {/* Her ride, her booking: Uber opens with home and the clinic filled in; she confirms there. */}
            {n.uberLink && (
              <BigButton tone="lamp" icon="car.fill" title="Book my Uber" sub="Opens Uber with your trip filled in" hint="Opens the Uber app with your home and the clinic already filled in. You confirm the ride in Uber." onPress={() => Linking.openURL(n.uberLink)} />
            )}
            </View>
          ))}
        </Animated.View>
      )}

      {ride && <RideCard ride={ride} />}

      <View style={st.stack}>
        <BigButton tone="lamp" icon="bubble.left.and.bubble.right.fill" title="Talk with Porchlight" sub="A friendly chat about your day" hint="Starts a conversation. Porchlight is an AI and will talk first." onPress={() => setMode('talk')} />
        <BigButton icon="phone.arrow.down.left.fill" title={calling ? 'Calling you…' : 'Call me now'} sub="Porchlight rings your phone" hint="Porchlight calls your phone now." onPress={callMe} disabled={calling} />
        <BigButton icon="checkmark.circle.fill" title="I’m okay today" sub="One tap lets your family know" hint="Tells your family you are okay today." onPress={imOkay} disabled={busy} />
        {primary && (
          <BigButton icon="phone.fill" title={`Call ${primaryFirst}`} sub={primary.relation} hint={`Opens a phone call to ${primaryFirst}.`} onPress={() => Linking.openURL(`tel:${primary.phone}`)} />
        )}
        <BigButton icon="shield.lefthalf.filled" title="Is this a scam?" sub="Tell me about a call or letter" hint="Opens a page where you can describe the call or letter." onPress={() => setMode('scam')} />
        <BigButton tone="help" icon="hand.raised.fill" title="I need help" sub="Your family and neighbor are alerted" hint="Asks you to confirm before anyone is alerted." onPress={() => setMode('help')} />
      </View>
      <Text style={st.footer}>Porchlight is an AI helper. It never asks for money, codes or passwords.</Text>
    </Page>
  );
}

function Talk({ senior, done }) {
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
    if (!text || !checkin) return;
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

  const status = { starting: 'Calling…', speaking: 'Porchlight is talking', ready: 'Your turn', thinking: 'Thinking', ending: 'Saying goodbye…' }[phase];

  return (
    <View style={{ flex: 1, paddingTop: insets.top + HEADER_H }}>
      <View style={st.talkHead}>
        <Lamp state="lit" size={56} label="Porch light on" />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={st.talkStatus} accessibilityLiveRegion="polite">{status}</Text>
            {(phase === 'thinking' || phase === 'starting') && <Dots />}
          </View>
          <Text style={st.talkSub}>Porchlight is an AI</Text>
        </View>
        <View style={st.voiceToggle}>
          <Switch value={voiceOn} onValueChange={(v) => { haptic.select(); setVoiceOn(v); }} trackColor={{ true: accent.lamp }} accessibilityLabel="Read replies aloud" />
          <Text style={st.toggleLabel}>Read aloud</Text>
        </View>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={st.transcript} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
        {lines.map((l, i) => (
          <Animated.View key={i} entering={FadeInDown.duration(250).easing(ease.out)} style={[st.bubble, l.who === 'senior' ? st.bubbleMe : st.bubbleThem]}>
            <Text style={[st.bubbleWho, l.who === 'senior' && { color: '#52525B' }]}>{l.who === 'porchlight' ? 'Porchlight' : senior.preferredName}</Text>
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
          <Press onPress={send} disabled={!draft.trim() || phase === 'thinking'} accessibilityLabel="Send" style={st.sendBtn} feedback={null}>
            <Icon name="arrow.up" size={24} color={accent.lampInk} weight="bold" />
          </Press>
        </View>
        <Button label="I’m done talking" variant="ghost" onPress={() => finish()} disabled={!checkin || phase === 'ending'} style={{ alignSelf: 'center' }} />
      </View>
    </View>
  );
}

// Three dots while Porchlight thinks. Runs only while waiting.
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
    danger: { bg: '#2A1311', border: '#5B231B', fg: '#FF9B88', icon: 'exclamationmark.octagon.fill' },
    warn: { bg: '#2A1F0C', border: '#5A4116', fg: '#FFCF7A', icon: 'exclamationmark.triangle.fill' },
    safe: { bg: '#10241A', border: '#1F4A33', fg: '#8EE0AC', icon: 'checkmark.shield.fill' },
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
          <T v="readTitle" center>Help is on the way.</T>
          <T v="read" muted center>Your family has been texted. Stay where you are if you can. If you’re hurt, call 911.</T>
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
      <T v="read" muted center>Your family will see that you’re doing well today.</T>
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
  pad: { paddingHorizontal: 18, gap: 18 },
  center: { alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: -10 },
  statusPill: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: dark.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontFamily: font.readBold, fontSize: 17, color: dark.ink2, flexShrink: 1 },
  stack: { gap: 12 },
  notices: { backgroundColor: dark.surface, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: dark.lineStrong, padding: 20, gap: 16 },
  noticesHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticesTitle: { fontFamily: font.readBold, fontSize: 22, color: dark.ink },
  notice: { flexDirection: 'row', gap: 12 },
  noticeText: { fontFamily: font.read, fontSize: 22, lineHeight: 30, color: dark.ink },
  noticeMeta: { fontFamily: font.read, fontSize: 17, color: dark.muted },
  footer: { fontFamily: font.read, fontSize: 16, lineHeight: 22, color: dark.muted, textAlign: 'center', paddingHorizontal: 12 },
  talkHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: dark.line },
  talkStatus: { fontFamily: font.readBold, fontSize: 22, color: dark.ink },
  talkSub: { fontFamily: font.read, fontSize: 15, color: dark.muted },
  voiceToggle: { alignItems: 'center', gap: 4 },
  toggleLabel: { fontFamily: font.read, fontSize: 13, color: dark.muted },
  transcript: { padding: 16, gap: 12 },
  bubble: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24, maxWidth: '88%' },
  bubbleThem: { backgroundColor: dark.raised, alignSelf: 'flex-start', borderBottomLeftRadius: 8 },
  bubbleMe: { backgroundColor: '#FAFAFA', alignSelf: 'flex-end', borderBottomRightRadius: 8 },
  bubbleWho: { fontFamily: font.readBold, fontSize: 14, color: dark.muted, marginBottom: 3 },
  bubbleText: { fontFamily: font.read, fontSize: 22, lineHeight: 30, color: dark.ink },
  composer: { paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dark.line, backgroundColor: dark.bg },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { fontFamily: font.read, fontSize: 16, color: dark.muted, flex: 1 },
  typeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, minHeight: 60, backgroundColor: dark.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: dark.lineStrong, paddingHorizontal: 18, fontFamily: font.read, fontSize: 22, color: dark.ink },
  textarea: { minHeight: 150, paddingTop: 16, textAlignVertical: 'top', flex: 0 },
  sendBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center' },
  verdict: { borderRadius: radius.xl, borderWidth: 1, padding: 22, gap: 12 },
  verdictWord: { fontFamily: font.readBold, fontSize: 28, lineHeight: 34, flex: 1 },
  verdictText: { fontFamily: font.read, fontSize: 21, lineHeight: 29, color: dark.ink },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, alignSelf: 'flex-start' },
  backText: { fontFamily: font.readBold, fontSize: 20, color: dark.ink },
});
