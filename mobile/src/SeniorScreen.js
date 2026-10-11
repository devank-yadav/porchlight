import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import * as Speech from 'expo-speech';
import { api } from './api';
import Lamp, { lampState } from './Lamp';
import { BigButton, Button, Card, Field, IconCircle, List, Row, Screen, Section, T, Title } from './ui';
import { color, radius, space } from './theme';

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
        <Screen>
          <Lamp state="lit" size={160} label="Porch light on" />
          <Title senior>Thank you, {senior.preferredName}.</Title>
          <T v="seniorBody" tone="soft">Your family will see that you’re doing well today.</T>
          <BigButton title="Back to start" icon="back" onPress={home} />
        </Screen>
      )}
    </KeyboardAvoidingView>
  );
}

function Home({ senior, notices, primary, setMode, refresh, onError }) {
  const [busy, setBusy] = useState(false);
  const checkedIn = senior.status === 'ok' && senior.lastCheckinAt && new Date(senior.lastCheckinAt).toDateString() === new Date().toDateString();
  const primaryName = primary?.name.split(' ')[0];

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
    <Screen>
      <View style={{ gap: 12 }}>
        <View style={st.hero}>
          <Lamp state={lampState(senior)} size={96} label={checkedIn ? 'Porch light on. You checked in today.' : 'Porch light waiting for today’s check-in'} />
          <Title senior style={{ flex: 1 }}>{greetingFor()}, {senior.preferredName}.</Title>
        </View>
        <T v="seniorBody" tone="soft">{checkedIn ? 'You’ve checked in today. Your porch light is on.' : 'Your porch light is waiting for today’s check-in.'}</T>
      </View>

      {notices.length > 0 && (
        <Section label="Good news" senior>
          <Card flush accessibilityLiveRegion="polite">
            <List inset={66}>
              {notices.map((n) => (
                <Row
                  key={n._id}
                  leading={<IconCircle name="check" tone="sage" size={36} />}
                  style={{ alignItems: 'flex-start' }}
                  accessible
                  accessibilityLabel={`${n.text}${n.simulated ? ' This is a demo.' : ''}`}
                >
                  <T v="seniorBody">{n.text}</T>
                  {n.simulated && <T v="seniorSub" tone="muted">{n.kind === 'ride' ? 'Demo booking' : 'Demo'}</T>}
                </Row>
              ))}
            </List>
          </Card>
        </Section>
      )}

      <View style={{ gap: 12 }}>
        <BigButton tone="lamp" icon="chat" title="Talk with Porchlight" sub="A friendly chat about your day" hint="Starts a conversation. Porchlight is an AI and will talk first." onPress={() => setMode('talk')} />
        <BigButton icon="check" title="I’m okay today" sub="One tap lets your family know" hint="Tells your family you are okay today." onPress={imOkay} disabled={busy} />
        {primary && (
          <BigButton icon="phone" title={`Call ${primaryName}`} sub={primary.relation} hint={`Opens a phone call to ${primaryName}.`} onPress={() => Linking.openURL(`tel:${primary.phone}`)} />
        )}
        <BigButton icon="shield" title="Is this a scam?" sub="Tell me about a call or letter" hint="Opens a page where you can describe the call or letter." onPress={() => setMode('scam')} />
        <BigButton tone="help" icon="alert" title="I need help" sub="Your family and neighbor are alerted" hint="Asks you to confirm before anyone is alerted." onPress={() => setMode('help')} />
      </View>
    </Screen>
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
        <Lamp state="lit" size={56} label="Porch light on" />
        <T v="seniorLabel" style={{ flex: 1, fontSize: 22 }} accessibilityLiveRegion="polite">{status}</T>
        <View style={st.toggle}>
          <T v="seniorSub" tone="soft">Read aloud</T>
          <Switch value={voiceOn} onValueChange={setVoiceOn} trackColor={{ true: color.lamp }} accessibilityLabel="Read replies aloud" />
        </View>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={st.transcript} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
        {lines.map((l, i) => {
          const mine = l.who === 'senior';
          return (
            <View key={i} style={[st.msg, mine ? { alignSelf: 'flex-end', alignItems: 'flex-end' } : { alignSelf: 'flex-start' }]}>
              <T v="seniorLabel" tone="muted" style={{ marginHorizontal: 4 }}>{mine ? 'You' : 'Porchlight'}</T>
              <View style={[st.bubble, mine ? st.bubbleMine : st.bubbleTheirs]}>
                <T v="seniorBody">{l.text}</T>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={st.composer}>
        <T v="seniorSub" tone="soft">Tap the microphone on the keyboard to speak.</T>
        <View style={st.typeRow}>
          <Field
            senior
            style={{ flex: 1 }}
            value={draft}
            onChangeText={setDraft}
            placeholder="Your answer"
            returnKeyType="send"
            onSubmitEditing={send}
            editable={phase !== 'ending'}
            accessibilityLabel="Your answer"
          />
          <Button senior label="Send" variant="primary" onPress={send} disabled={!draft.trim() || phase === 'thinking'} />
        </View>
        <Button senior label="I’m done talking" variant="ghost" onPress={() => finish()} disabled={!checkin || phase === 'ending'} style={{ alignSelf: 'center' }} />
      </View>
    </View>
  );
}

const VERDICT = {
  'likely scam': { tone: 'urgent', word: 'This looks like a scam.' },
  'be careful': { tone: 'attention', word: 'Be careful.' },
  'probably fine': { tone: 'ok', word: 'This looks okay.' },
};

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

  const v = VERDICT[result?.verdict] ?? VERDICT['probably fine'];
  const fg = { urgent: 'brick', attention: 'lamp', ok: 'sage' }[v.tone];

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Title senior>Is this a scam?</Title>
        <T v="seniorBody" tone="soft">Tell me who contacted you and what they asked for.</T>
      </View>
      {!result ? (
        <View style={{ gap: 12 }}>
          <Field
            senior
            multiline
            style={{ minHeight: 140, paddingTop: 14, textAlignVertical: 'top' }}
            value={text}
            onChangeText={setText}
            placeholder="A man called and said my grandson is in jail…"
            accessibilityLabel="Describe the call or message"
          />
          <T v="seniorSub" tone="soft">Tap the microphone on the keyboard to say it out loud.</T>
          <BigButton tone="lamp" icon="shield" title={busy ? 'Checking…' : 'Check it'} onPress={check} disabled={busy || !text.trim()} />
        </View>
      ) : (
        <Card tone={v.tone === 'urgent' ? 'urgent' : 'default'} accessibilityLiveRegion="polite">
          <T v="seniorTitle" tone={fg}>{v.word}</T>
          {result.redFlags?.map((f) => (
            <View key={f} style={st.flagRow}>
              <View style={[st.bullet, { backgroundColor: color[fg] }]} />
              <T v="seniorSub" style={{ flex: 1 }}>{f}</T>
            </View>
          ))}
          <T v="seniorSub">{result.advice}</T>
          {result.verdict !== 'probably fine' && <T v="seniorLabel">I’ve let your family know.</T>}
        </Card>
      )}
      <Button senior label="Back to start" variant="ghost" onPress={back} style={{ alignSelf: 'center' }} />
    </Screen>
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
  if (!sent) {
    return (
      <Screen>
        <View style={{ gap: 8 }}>
          <Title senior>Do you need help now?</Title>
          <T v="seniorBody" tone="soft">I’ll text your family right away, then your neighbor. If you’re hurt, call 911.</T>
        </View>
        <View style={{ gap: 12 }}>
          <BigButton tone="help" icon="alert" title="Yes, alert my family" hint="Texts your family now, then your neighbor." onPress={send} />
          <BigButton icon="phone" title="Call 911" hint="Opens a phone call to 911." onPress={() => Linking.openURL('tel:911')} />
        </View>
        <Button senior label="No, go back" variant="ghost" onPress={back} style={{ alignSelf: 'center' }} />
      </Screen>
    );
  }
  return (
    <Screen>
      <Lamp state="alert" size={140} label="Help requested" />
      <View style={{ gap: 8 }}>
        <Title senior>Help is on the way.</Title>
        <T v="seniorBody" tone="soft">Your family has been texted. Stay where you are if you can. If you’re hurt, call 911.</T>
      </View>
      <BigButton tone="help" icon="phone" title="Call 911" hint="Opens a phone call to 911." onPress={() => Linking.openURL('tel:911')} />
      <Button senior label="Back to start" variant="ghost" onPress={back} style={{ alignSelf: 'center' }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  talkHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.screen, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.hairline },
  toggle: { alignItems: 'center', gap: 4 },
  transcript: { padding: space.screen, gap: 14 },
  msg: { maxWidth: '86%', gap: 4 },
  bubble: { paddingHorizontal: 16, paddingVertical: 14 },
  bubbleTheirs: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, borderRadius: radius.card, borderBottomLeftRadius: 6 },
  bubbleMine: { backgroundColor: color.dusk2, borderRadius: radius.card, borderBottomRightRadius: 6 },
  composer: { paddingHorizontal: space.screen, paddingTop: 12, paddingBottom: 12, gap: 10, borderTopWidth: 1, borderTopColor: color.hairline },
  typeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  flagRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bullet: { width: 8, height: 8, borderRadius: 4, marginTop: 10 },
});
