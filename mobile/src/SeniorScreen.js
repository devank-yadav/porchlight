import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as Speech from 'expo-speech';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { BigButton, Button, H1 } from './ui';
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {mode === 'home' && <Home senior={senior} primary={primary} setMode={setMode} refresh={refresh} onError={onError} />}
      {mode === 'talk' && <Talk senior={senior} done={() => { setMode('thanks'); refresh(); }} onError={onError} />}
      {mode === 'scam' && <ScamCheck senior={senior} back={home} onError={onError} />}
      {mode === 'help' && <Help senior={senior} back={home} refresh={refresh} onError={onError} />}
      {mode === 'thanks' && (
        <ScrollView contentContainerStyle={[st.pad, st.center]}>
          <Lamp state="lit" size={170} label="Porch light on" />
          <H1 onDusk style={st.bigH1}>Thank you, {senior.preferredName}.</H1>
          <Text style={st.lead}>Your family will see that you’re doing well today.</Text>
          <BigButton title="Back to start" onPress={home} style={{ alignSelf: 'stretch' }} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
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
    <ScrollView contentContainerStyle={st.pad}>
      <View style={st.hero}>
        <Lamp state={lampState(senior)} size={120} label={checkedIn ? 'Porch light on. You checked in today.' : 'Porch light waiting for today’s check-in'} />
        <View style={{ flex: 1 }}>
          <H1 onDusk style={st.bigH1}>{greetingFor()}, {senior.preferredName}.</H1>
        </View>
      </View>
      <Text style={st.lead}>{checkedIn ? 'You’ve checked in today. Your porch light is on.' : 'Your porch light is waiting for today’s check-in.'}</Text>

      <View style={st.stack}>
        <BigButton tone="lamp" title="Talk with Porchlight" sub="A friendly chat about your day" onPress={() => setMode('talk')} />
        <BigButton title="I’m okay today" sub="One tap lets your family know" onPress={imOkay} disabled={busy} />
        {primary && (
          <BigButton title={`Call ${primary.name.split(' ')[0]}`} sub={primary.relation} onPress={() => Linking.openURL(`tel:${primary.phone}`)} />
        )}
        <BigButton title="Is this a scam?" sub="Tell me about a call or letter" onPress={() => setMode('scam')} />
        <BigButton tone="help" title="I need help" sub="Your family and neighbor are alerted" onPress={() => setMode('help')} />
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
            placeholderTextColor="#7B859C"
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
  const fg = { danger: color.brick, warn: '#6A4300', safe: color.sage }[tone];

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
            placeholderTextColor="#7B859C"
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
            <BigButton tone="help" title="Yes, alert my family" onPress={send} />
            <BigButton title="Call 911" onPress={() => Linking.openURL('tel:911')} />
          </View>
          <Button label="No, go back" variant="quiet" onDusk onPress={back} style={st.doneBtn} />
        </>
      ) : (
        <>
          <Lamp state="alert" size={150} label="Help requested" />
          <H1 onDusk style={st.bigH1}>Help is on the way.</H1>
          <Text style={st.lead}>Your family has been texted. Stay where you are if you can. If you’re hurt, call 911.</Text>
          <BigButton tone="help" title="Call 911" onPress={() => Linking.openURL('tel:911')} style={{ alignSelf: 'stretch' }} />
          <Button label="Back to start" variant="quiet" onDusk onPress={back} style={st.doneBtn} />
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 48, gap: 18 },
  center: { alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigH1: { fontSize: 36, lineHeight: 40, textAlign: 'left' },
  lead: { fontFamily: font.body, fontSize: 21, lineHeight: 29, color: '#DFE5F3' },
  stack: { gap: 14 },
  talkHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
  talkStatus: { flex: 1, fontFamily: font.displaySemi, fontSize: 22, color: '#fff' },
  voiceToggle: { alignItems: 'center', gap: 2 },
  toggleLabel: { fontFamily: font.body, fontSize: 13, color: '#DFE5F3' },
  transcript: { padding: 16, gap: 12 },
  line: { padding: 16, borderRadius: radius.lg, maxWidth: '88%' },
  linePorch: { backgroundColor: color.dusk2, alignSelf: 'flex-start' },
  lineSenior: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  lineWho: { fontFamily: font.bodyBold, fontSize: 14, color: '#DFE5F3', marginBottom: 2 },
  lineText: { fontFamily: font.body, fontSize: 21, lineHeight: 28, color: '#fff' },
  composer: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 8, borderTopWidth: 1, borderTopColor: color.dusk2 },
  hint: { fontFamily: font.body, fontSize: 16, color: '#DFE5F3' },
  typeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, minHeight: 56, backgroundColor: '#fff', borderRadius: radius.sm, paddingHorizontal: 14, fontFamily: font.body, fontSize: 21, color: color.ink },
  textarea: { minHeight: 140, paddingTop: 14, textAlignVertical: 'top', flex: 0 },
  doneBtn: { alignSelf: 'center' },
  verdict: { borderRadius: radius.lg, padding: 22, gap: 10 },
  verdictWord: { fontFamily: font.display, fontSize: 30, lineHeight: 34 },
  verdictText: { fontFamily: font.body, fontSize: 20, lineHeight: 28, color: color.ink },
});
