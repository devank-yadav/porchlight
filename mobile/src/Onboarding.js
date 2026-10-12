import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from './api';
import { askForLocation } from './location';
import { useAppContext } from './AppContext';
import Lamp from './Lamp';
import { Appear, BigButton, Button, Card, HeroCard, IconTile, Press, T } from './design/ui';
import { ThemeProvider } from './design/theme';
import Icon from './design/Icon';
import { haptic } from './design/haptics';
import { toast } from './design/Toaster';
import { accent, font, radius, seniorPalette as P, shadow } from './design/tokens';

// First run on a phone: who is it for → phone number → a call reads a code → a little setup → the app.
// The role picked here stays with this phone; only signing out (or deleting the account) starts over.
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; } catch { return 'America/New_York'; } };
export const pretty = (e164) => {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 || '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
};

export default function Onboarding() {
  const { account } = useAppContext();
  const { session, me } = account;
  const insets = useSafeAreaInsets();
  const [picked, setRole] = useState(null);
  const [chosenStep, setStep] = useState('role');
  // Signed in = setup; signed out never lands on setup.
  const role = session?.role ?? picked;
  const step = session ? 'setup' : chosenStep === 'setup' ? 'role' : chosenStep;
  const [phone, setPhone] = useState(null); // E.164 from the server
  const [devCode, setDevCode] = useState(null);

  const back = step === 'phone' ? () => setStep('role') : step === 'code' ? () => setStep('phone') : null;

  let page;
  if (session && !me) page = <Reconnect account={account} />;
  else if (step === 'role') page = <ChooseRole onPick={(r) => { setRole(r); setStep('phone'); }} />;
  else if (step === 'phone') page = <PhoneStep role={role} onSent={(r) => { setPhone(r.phone); setDevCode(r.devCode || null); setStep('code'); }} />;
  else if (step === 'code') page = <CodeStep role={role} phone={phone} devCode={devCode} onResent={(r) => setDevCode(r.devCode || null)} onDone={async (r) => { await account.signedIn({ token: r.token, role, me: r.me }); if (r.me.setupDone) finish(role); }} />;
  else if (role === 'senior') page = <SeniorSetup me={me} account={account} />;
  else page = <FamilySetup me={me} account={account} />;

  return <ThemeProvider value="senior">
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: P.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[st.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
        {back ? <BackLink onPress={back} /> : null}
        {page}
      </ScrollView>
    </KeyboardAvoidingView>
  </ThemeProvider>;
}

function finish(role) {
  haptic.success();
  router.replace(role === 'senior' ? '/senior/today' : '/family/today');
}

// ── Who is this phone for? ─────────────────────────────────────────────────
function ChooseRole({ onPick }) {
  return <>
    <Appear on>
      <HeroCard glowAt="center" style={st.hero}>
        <View style={st.lamp}><Lamp state="lit" size={112} /></View>
        <View style={st.heroText}>
          <Text style={st.wordmark} accessibilityRole="header">Porchlight</Text>
          <T v="readTitle" center>A little closer,{'\n'}every day.</T>
          <T v="readSmall" muted center style={{ maxWidth: 300 }}>A friendly AI phone call every day, with family close at hand.</T>
        </View>
      </HeroCard>
    </Appear>
    <Appear on index={2} style={{ gap: 14 }}>
      <T v="readHeadline" style={{ paddingHorizontal: 2 }}>Who is this phone for?</T>
      <BigButton tone="lamp" title="It’s for me" sub="I’d like a daily call and help from my family" icon="house.fill" chevron onPress={() => onPick('senior')} />
      <BigButton title="I’m family" sub="I help look after someone" icon="person.2.fill" chevron onPress={() => onPick('family')} />
      <T v="readSmall" muted style={{ paddingHorizontal: 2 }}>Each phone is set up for one person. You can’t switch later without signing out.</T>
    </Appear>
  </>;
}

// ── Phone number ───────────────────────────────────────────────────────────
function PhoneStep({ role, onSent }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy || value.replace(/\D/g, '').length < 10) return;
    setBusy(true);
    try { onSent(await api.startSignIn(value, role)); } catch (e) { toast.error('We couldn’t call you', { description: e.message }); } finally { setBusy(false); }
  };
  return <View style={st.stack}>
    <Head icon="phone.fill" title="Your phone number" sub="Porchlight will call this number and read you a 6-digit code. There’s nothing to type in from a text." />
    <Field value={value} onChangeText={setValue} placeholder="(814) 555-0123" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" autoFocus returnKeyType="done" onSubmitEditing={send} accessibilityLabel="Your phone number" />
    <Button variant="primary" icon="phone.arrow.down.left" label="Call me with a code" onPress={send} busy={busy} disabled={value.replace(/\D/g, '').length < 10} />
    <T v="readSmall" muted>We use your number to sign you in and to reach you. We never share it.</T>
  </View>;
}

// ── The code from the call ─────────────────────────────────────────────────
function CodeStep({ role, phone, devCode, onDone, onResent }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(30);
  const sent = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const check = async (value = code) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    try { await onDone(await api.verify(phone, role, value)); } catch (e) { haptic.warn(); toast.error('That didn’t work', { description: e.message }); setCode(''); } finally { setBusy(false); }
  };
  const again = async () => {
    try { onResent(await api.startSignIn(phone, role)); setWait(30); toast.success('Calling you again'); } catch (e) { toast.error('We couldn’t call you', { description: e.message }); }
  };
  return <View style={st.stack}>
    <Head icon="phone.connection.fill" title="Answer the call" sub={`We’re calling ${pretty(phone)}. Type the 6-digit code you hear.`} />
    {devCode ? <Card style={st.devNote} accessible accessibilityLabel={`Test server. Your code is ${devCode.split('').join(' ')}`}>
      <Icon name="wrench.and.screwdriver.fill" size={20} color={P.muted} />
      <T v="readSmall" muted style={{ flex: 1 }}>Test server, so no call: your code is {devCode}.</T>
    </Card> : null}
    <Field
      value={code}
      onChangeText={(v) => { const d = v.replace(/\D/g, '').slice(0, 6); setCode(d); if (d.length === 6 && !sent.current) { sent.current = true; check(d).finally(() => { sent.current = false; }); } }}
      placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" autoFocus maxLength={6}
      style={st.code} accessibilityLabel="The 6-digit code"
    />
    <Button variant="primary" icon="checkmark" label="Sign in" onPress={() => check()} busy={busy} disabled={code.length !== 6} />
    <Button label={wait ? `Call me again in ${wait} s` : 'Call me again'} icon="arrow.clockwise" onPress={again} disabled={wait > 0} />
  </View>;
}

// ── Setup: older adult ─────────────────────────────────────────────────────
function SeniorSetup({ me, account }) {
  const offer = (me?.offers || []).find((o) => o.kind === 'senior');
  const [join, setJoin] = useState(offer ? offer.id : null);
  const [name, setName] = useState(me?.name || offer?.name || '');
  const [home, setHome] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const me = await api.setupSenior({ preferredName: name.trim(), home: home.trim(), timezone: zone(), join: join || undefined });
      await askForLocation(); // for "I need help" only
      account.setMe(me);
      finish('senior');
    } catch (e) { toast.error('That didn’t save', { description: e.message }); } finally { setBusy(false); }
  };
  return <View style={st.stack}>
    {offer && join ? <Card tone="lamp" style={{ gap: 12 }}>
      <T v="readHeadline">{offer.by ? `${offer.by} set up Porchlight for you` : 'Your family set up Porchlight for you'}</T>
      <T v="readSmall" muted>You’ll join them, and they’ll see your daily calls.</T>
      <Button label="Start on my own instead" onPress={() => setJoin(null)} />
    </Card> : <Head icon="house.fill" title="Welcome" sub="Just two questions, and you’re set." />}
    <Label>What should Porchlight call you?</Label>
    <Field value={name} onChangeText={setName} placeholder="Your first name" textContentType="givenName" autoComplete="given-name" accessibilityLabel="What should Porchlight call you" />
    <Label>Your home address (for rides)</Label>
    <Field value={home} onChangeText={setHome} placeholder="12 Main St, Springfield" textContentType="fullStreetAddress" autoComplete="street-address" accessibilityLabel="Your home address, optional" />
    <T v="readSmall" muted>Optional. Uber uses it as your pickup spot.</T>
    <T v="readSmall" muted>Next, your phone asks to share your location. Porchlight only sends it to your family when you press “I need help”.</T>
    <Button variant="primary" icon="checkmark" label={join ? 'Join my family' : 'Done'} onPress={save} busy={busy} disabled={!name.trim()} />
    <SignOutLink account={account} />
  </View>;
}

// ── Setup: family ──────────────────────────────────────────────────────────
function FamilySetup({ me, account }) {
  const [name, setName] = useState(me?.name || '');
  const [mode, setMode] = useState(null); // null | 'parent' | 'code'
  const [busy, setBusy] = useState(false);
  const step1 = !me?.name;
  const go = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await fn();
      account.setMe(next);
      if (next.setupDone) finish('family');
    } catch (e) { toast.error('That didn’t save', { description: e.message }); } finally { setBusy(false); }
  };

  if (step1) {
    return <View style={st.stack}>
      <Head icon="person.fill" title="Your name" sub="So your family knows who’s helping." />
      <Field value={name} onChangeText={setName} placeholder="First and last name" textContentType="name" autoComplete="name" autoFocus accessibilityLabel="Your name" />
      <Button variant="primary" label="Next" icon="chevron.right" onPress={() => go(() => api.setupFamily({ name: name.trim(), timezone: zone() }))} busy={busy} disabled={!name.trim()} />
      <SignOutLink account={account} />
    </View>;
  }
  if (mode === 'parent') return <ParentForm busy={busy} onBack={() => setMode(null)} onSave={(body) => go(() => api.setupParent({ ...body, timezone: zone() }))} />;
  if (mode === 'code') return <CodeForm busy={busy} onBack={() => setMode(null)} onSave={(body) => go(() => api.joinCircle(body))} />;
  const offers = (me?.offers || []).filter((o) => o.kind === 'member');
  return <View style={st.stack}>
    <Head icon="person.2.fill" title={`Hi ${me.name.split(' ')[0]}`} sub="Who are you looking after?" />
    {offers.map((o) => <BigButton key={o.id} tone="lamp" icon="person.crop.circle.badge.checkmark" title={`Join ${o.name}’s circle`} sub="You were added by phone number" chevron onPress={() => go(() => api.joinCircle({ memberId: o.id, relation: o.relation }))} />)}
    <BigButton tone={offers.length ? 'plain' : 'lamp'} icon="house.fill" title="Set it up for someone" sub="A parent or relative, with their phone number" chevron onPress={() => setMode('parent')} />
    <BigButton icon="number" title="I have an invite code" sub="From their Porchlight, or another family member" chevron onPress={() => setMode('code')} />
    <SignOutLink account={account} />
  </View>;
}

function ParentForm({ busy, onBack, onSave }) {
  const [f, setF] = useState({ preferredName: '', phone: '', relation: '', home: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const ok = f.preferredName.trim() && f.phone.replace(/\D/g, '').length >= 10;
  return <View style={st.stack}>
    <BackLink onPress={onBack} />
    <Head icon="house.fill" title="Who are you setting up?" sub="Porchlight calls them every day on this number. When they install Porchlight with it, they’ll join you." />
    <Label>Their first name</Label>
    <Field value={f.preferredName} onChangeText={set('preferredName')} placeholder="What they like to be called" accessibilityLabel="Their first name" />
    <Label>Their phone number</Label>
    <Field value={f.phone} onChangeText={set('phone')} placeholder="(814) 555-0123" keyboardType="phone-pad" accessibilityLabel="Their phone number" />
    <Label>You are their…</Label>
    <Field value={f.relation} onChangeText={set('relation')} placeholder="Daughter, son, niece, friend" accessibilityLabel="Your relationship to them" />
    <Label>Their home address (for rides)</Label>
    <Field value={f.home} onChangeText={set('home')} placeholder="Optional" textContentType="fullStreetAddress" accessibilityLabel="Their home address, optional" />
    <Button variant="primary" icon="checkmark" label="Set up Porchlight" onPress={() => onSave(f)} busy={busy} disabled={!ok} />
  </View>;
}

function CodeForm({ busy, onBack, onSave }) {
  const [code, setCode] = useState('');
  const [relation, setRelation] = useState('');
  return <View style={st.stack}>
    <BackLink onPress={onBack} />
    <Head icon="number" title="Enter the invite code" sub="Anyone in the circle can share one from their Porchlight." />
    <Field value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC123" autoCapitalize="characters" autoCorrect={false} style={st.code} accessibilityLabel="Invite code" />
    <Label>You are their…</Label>
    <Field value={relation} onChangeText={setRelation} placeholder="Daughter, son, neighbor" accessibilityLabel="Your relationship to them" />
    <Button variant="primary" icon="checkmark" label="Join" onPress={() => onSave({ code, relation })} busy={busy} disabled={code.length !== 6} />
  </View>;
}

// Signed in but the server can't be reached (or the account just changed): try again, or sign out.
function Reconnect({ account }) {
  return <View style={[st.stack, { alignItems: 'center', paddingTop: 40 }]}>
    <Lamp state="dim" size={104} />
    <T v="readHeadline" center>Let’s reconnect</T>
    <T v="readSmall" muted center>{account.meError || 'Opening Porchlight…'}</T>
    <Button variant="primary" icon="arrow.clockwise" label="Try again" onPress={account.loadMe} style={{ alignSelf: 'stretch' }} />
    <SignOutLink account={account} />
  </View>;
}

function SignOutLink({ account }) {
  return <Button variant="ghost" label="Sign out" onPress={account.signOut} />;
}

function Head({ icon, title, sub }) {
  return <View style={st.head}>
    <IconTile icon={icon} tone="lamp" size={72} iconSize={34} style={{ borderRadius: 22 }} />
    <T v="readTitle">{title}</T>
    {sub ? <T v="read" muted>{sub}</T> : null}
  </View>;
}
function Label({ children }) {
  return <T v="readSmall" style={{ fontFamily: font.readBold, marginBottom: -6 }}>{children}</T>;
}
function Field({ style, ...props }) {
  return <TextInput placeholderTextColor={P.muted} style={[st.field, style]} {...props} />;
}
function BackLink({ onPress }) {
  return <Press onPress={onPress} accessibilityLabel="Back" style={st.back} scaleTo={0.96}>
    <Icon name="chevron.left" size={20} color={P.ink} weight="bold" />
    <Text style={st.backText}>Back</Text>
  </Press>;
}

const st = StyleSheet.create({
  page: { paddingHorizontal: 20, gap: 24, width: '100%', maxWidth: 620, alignSelf: 'center', flexGrow: 1 },
  hero: { paddingTop: 24, paddingBottom: 28, alignItems: 'center', gap: 4 },
  lamp: { marginTop: 4 },
  heroText: { alignItems: 'center', gap: 10 },
  wordmark: { fontFamily: font.readBold, fontSize: 20, lineHeight: 24, letterSpacing: 1.6, textTransform: 'uppercase', color: accent.lamp },
  stack: { gap: 16 },
  head: { gap: 10, marginBottom: 4 },
  field: { minHeight: 68, backgroundColor: P.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: P.lineStrong, paddingHorizontal: 20, fontFamily: font.read, fontSize: 24, color: P.ink, ...shadow.card },
  code: { fontFamily: font.readBold, fontSize: 34, letterSpacing: 10, textAlign: 'center' },
  devNote: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingRight: 12 },
  backText: { fontFamily: font.readBold, fontSize: 20, color: P.ink },
});
