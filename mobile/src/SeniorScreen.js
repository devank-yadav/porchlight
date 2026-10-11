import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { BigButton, Button, H1 } from './ui';
import Icon from './Icon';
import { color, font, radius } from './theme';

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

export default function SeniorScreen({ senior, state, refresh, onError }) {
  const [mode, setMode] = useState('home'); // home | talk | scam | help | thanks
  const primary = state.members.find((m) => m.circleId === senior.circleId && m.primary);
  const home = () => setMode('home');
  // Confirmed facts only (a ride that's booked, a task someone claimed). Newest first.
  const notices = (state.notices || [])
    .filter((n) => n.seniorId === senior._id)
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 3);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {mode === 'home' && <Home senior={senior} notices={notices} primary={primary} setMode={setMode} refresh={refresh} onError={onError} />}
      {mode === 'talk' && <Talk senior={senior} done={() => { setMode('thanks'); refresh(); }} onError={onError} />}
      {mode === 'scam' && <ScamCheck senior={senior} back={home} onError={onError} />}
      {mode === 'help' && <Help senior={senior} back={home} refresh={refresh} onError={onError} />}
      {mode === 'thanks' && (
        <ScrollView contentContainerStyle={[st.pad, st.center]}>
          <Lamp state="lit" size={170} label="Porch light on" />
          <H1 onDusk style={st.bigH1}>Thank you, {senior.preferredName}.</H1>
          <Text style={st.lead}>Your family will see that you’re doing well today.</Text>
          <BigButton icon="back" title="Back to start" onPress={home} style={{ alignSelf: 'stretch' }} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function Home({ senior, notices, primary, setMode, refresh, onError }) {
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
    <ScrollView contentContainerStyle={st.pad}>
      <View style={st.hero}>
        <Lamp state={lampState(senior)} size={92} label={checkedIn ? 'Porch light on. You checked in today.' : 'Porch light waiting for today’s check-in'} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={st.greeting}>{greetingFor()},</Text>
          <H1 style={st.bigH1}>{senior.preferredName}</H1>
        </View>
      </View>
      <View style={st.statusPill}>
        <View style={[st.statusDot, { backgroundColor: checkedIn ? color.sage : color.muted }]} />
        <Text style={st.statusText}>{checkedIn ? 'You’ve checked in today' : 'Waiting for today’s check-in'}</Text>
      </View>

      {notices.length > 0 && (
        <View style={st.notices} accessibilityLiveRegion="polite">
          <Text style={st.noticesTitle} accessibilityRole="header">Good news</Text>
          {notices.map((n) => (
            <View key={n._id} style={st.notice} accessible accessibilityLabel={`${n.text}${n.simulated ? ' This is a demo booking.' : ''}`}>
              <Icon name="checkCircle" size={26} color={color.sage} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={st.noticeText}>{n.text}</Text>
                {n.simulated && <Text style={st.noticeMeta}>Demo booking</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={st.stack}>
        <BigButton tone="lamp" icon="chat" title="Talk with Porchlight" sub="A friendly chat about your day" hint="Starts a conversation. Porchlight is an AI and will talk first." onPress={() => setMode('talk')} />
        <BigButton icon="check" title="I’m okay today" sub="One tap lets your family know" hint="Tells your family you are okay today." onPress={imOkay} disabled={busy} />
        {primary && (
          <BigButton icon="phone" title={`Call ${primary.name.split(' ')[0]}`} sub={primary.relation} hint={`Opens a phone call to ${primary.name.split(' ')[0]}.`} onPress={() => Linking.openURL(`tel:${primary.phone}`)} />
        )}
        <BigButton icon="shield" title="Is this a scam?" sub="Tell me about a call or letter" hint="Opens a page where you can describe the call or letter." onPress={() => setMode('scam')} />
        <BigButton tone="help" icon="alert" title="I need help" sub="Your family and neighbor are alerted" hint="Asks you to confirm before anyone is alerted." onPress={() => setMode('help')} />
      </View>
    </ScrollView>
  );
}

function Talk({ senior, done, onError }) {
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
        onError(e.message);
        setPhase('ready');
      }
    })();
    return () => { Speech.stop(); };
  }, [senior._id, onError]);

  const finish = async (c = checkin) => {
    if (!c) return;
    setPhase('ending');
    Speech.stop();
    try {
      await api.finish(c._id);
      done();
    } catch (e) {
      onError(e.message);
      setPhase('ready');
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !checkin) return;
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
      onError(e.message);
      setPhase('ready');
    }
  };

  const status = { starting: 'Calling…', speaking: 'Porchlight is talking', ready: 'Your turn', thinking: 'Thinking…', ending: 'Saying goodbye…' }[phase];

  return (
    <View style={{ flex: 1 }}>
      <View style={st.talkHead}>
        <Lamp state="lit" size={64} label="Porch light on" />
        <Text style={st.talkStatus} accessibilityLiveRegion="polite">{status}</Text>
        <View style={st.voiceToggle}>
          <Text style={st.toggleLabel}>Read aloud</Text>
          <Switch value={voiceOn} onValueChange={setVoiceOn} trackColor={{ true: color.lamp }} accessibilityLabel="Read replies aloud" />
        </View>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={st.transcript} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
        {lines.map((l, i) => (
          <View key={i} style={[st.line, l.who === 'senior' ? st.lineSenior : st.linePorch]}>
            <Text style={[st.lineWho, l.who === 'senior' && { color: color.muted }]}>{l.who === 'porchlight' ? 'Porchlight' : senior.preferredName}</Text>
            <Text style={[st.lineText, l.who === 'senior' && { color: color.ink }]}>{l.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={st.composer}>
        <Text style={st.hint}>Tap the microphone on the keyboard to speak your answer.</Text>
        <View style={st.typeRow}>
          <TextInput
            style={st.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Your answer"
            placeholderTextColor={color.muted}
            returnKeyType="send"
            onSubmitEditing={send}
            editable={phase !== 'ending'}
            accessibilityLabel="Your answer"
          />
          <Button label="Send" variant="light" onPress={send} disabled={!draft.trim() || phase === 'thinking'} style={{ minHeight: 56 }} />
        </View>
        <Button label="I’m done talking" variant="quiet" onDusk onPress={() => finish()} disabled={!checkin || phase === 'ending'} style={st.doneBtn} />
      </View>
    </View>
  );
}

function ScamCheck({ senior, back, onError }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await api.scamCheck(senior._id, text);
      setResult(r);
      say(`${r.verdict === 'likely scam' ? 'This looks like a scam.' : r.verdict === 'be careful' ? 'Be careful with this one.' : 'This looks okay.'} ${r.advice}`);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const tone = result?.verdict === 'likely scam' ? 'danger' : result?.verdict === 'be careful' ? 'warn' : 'safe';
  const bg = { danger: color.brickSoft, warn: color.lampSoft, safe: color.sageSoft }[tone];
  const fg = { danger: color.brick, warn: color.lamp, safe: color.sage }[tone];

  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <H1 onDusk style={st.bigH1}>Is this a scam?</H1>
      <Text style={st.lead}>Tell me who contacted you and what they asked for.</Text>
      {!result ? (
        <View style={st.stack}>
          <TextInput
            style={[st.input, st.textarea]}
            multiline
            value={text}
            onChangeText={setText}
            placeholder="A man called and said my grandson is in jail…"
            placeholderTextColor={color.muted}
            accessibilityLabel="Describe the call or message"
          />
          <Text style={st.hint}>Tap the microphone on the keyboard to say it out loud.</Text>
          <BigButton tone="lamp" title={busy ? 'Checking…' : 'Check it'} onPress={check} disabled={busy || !text.trim()} />
        </View>
      ) : (
        <View style={[st.verdict, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
          <Text style={[st.verdictWord, { color: fg }]}>
            {result.verdict === 'likely scam' ? 'This looks like a scam.' : result.verdict === 'be careful' ? 'Be careful.' : 'This looks okay.'}
          </Text>
          {result.redFlags?.map((f) => <Text key={f} style={st.verdictText}>•  {f}</Text>)}
          <Text style={st.verdictText}>{result.advice}</Text>
          {result.verdict !== 'probably fine' && <Text style={[st.verdictText, { fontFamily: font.bodyBold }]}>I’ve let your family know.</Text>}
        </View>
      )}
      <Button label="Back to start" variant="quiet" onDusk onPress={back} style={st.doneBtn} />
    </ScrollView>
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
    <ScrollView contentContainerStyle={[st.pad, st.center]}>
      {!sent ? (
        <>
          <H1 onDusk style={st.bigH1}>Do you need help now?</H1>
          <Text style={st.lead}>I’ll text your family right away, then your neighbor. If you’re hurt, call 911.</Text>
          <View style={[st.stack, { alignSelf: 'stretch' }]}>
            <BigButton tone="help" icon="alert" title="Yes, alert my family" hint="Texts your family now, then your neighbor." onPress={send} />
            <BigButton icon="phone" title="Call 911" hint="Opens a phone call to 911." onPress={() => Linking.openURL('tel:911')} />
          </View>
          <Button label="No, go back" variant="quiet" onDusk onPress={back} style={st.doneBtn} />
        </>
      ) : (
        <>
          <Lamp state="alert" size={150} label="Help requested" />
          <H1 onDusk style={st.bigH1}>Help is on the way.</H1>
          <Text style={st.lead}>Your family has been texted. Stay where you are if you can. If you’re hurt, call 911.</Text>
          <BigButton tone="help" icon="phone" title="Call 911" hint="Opens a phone call to 911." onPress={() => Linking.openURL('tel:911')} style={{ alignSelf: 'stretch' }} />
          <Button label="Back to start" variant="quiet" onDusk onPress={back} style={st.doneBtn} />
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  pad: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, gap: 16 },
  center: { alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  greeting: { fontFamily: font.body, fontSize: 21, lineHeight: 26, color: color.mutedOnDusk },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: color.surface, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 4 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontFamily: font.bodyBold, fontSize: 20, color: color.ink },
  bigH1: { fontSize: 40, lineHeight: 44, textAlign: 'left' },
  lead: { fontFamily: font.body, fontSize: 21, lineHeight: 29, color: color.mutedOnDusk },
  stack: { gap: 12 },
  notices: { backgroundColor: color.surface, borderRadius: radius.lg, padding: 20, gap: 16 },
  noticesTitle: { fontFamily: font.bodyBold, fontSize: 15, letterSpacing: 0.6, textTransform: 'uppercase', color: color.sage },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  noticeText: { fontFamily: font.body, fontSize: 22, lineHeight: 30, color: color.ink },
  noticeMeta: { fontFamily: font.body, fontSize: 16, color: color.muted },
  talkHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  talkStatus: { flex: 1, fontFamily: font.displaySemi, fontSize: 22, color: color.ink },
  voiceToggle: { alignItems: 'center', gap: 2 },
  toggleLabel: { fontFamily: font.body, fontSize: 13, color: color.mutedOnDusk },
  transcript: { padding: 16, gap: 12 },
  line: { padding: 16, borderRadius: radius.lg, maxWidth: '88%' },
  linePorch: { backgroundColor: color.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  lineSenior: { backgroundColor: color.surface3, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  lineWho: { fontFamily: font.bodyBold, fontSize: 14, color: color.mutedOnDusk, marginBottom: 2 },
  lineText: { fontFamily: font.body, fontSize: 21, lineHeight: 28, color: color.ink },
  composer: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 10, gap: 8, backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  hint: { fontFamily: font.body, fontSize: 16, color: color.mutedOnDusk },
  typeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, minHeight: 56, backgroundColor: color.surface2, borderRadius: radius.md, paddingHorizontal: 16, fontFamily: font.body, fontSize: 21, color: color.ink },
  textarea: { minHeight: 140, paddingTop: 14, textAlignVertical: 'top', flex: 0 },
  doneBtn: { alignSelf: 'center' },
  verdict: { borderRadius: radius.lg, padding: 22, gap: 10 },
  verdictWord: { fontFamily: font.display, fontSize: 30, lineHeight: 34 },
  verdictText: { fontFamily: font.body, fontSize: 20, lineHeight: 28, color: color.ink },
});
