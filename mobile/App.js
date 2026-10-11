import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { api, API_BASE } from './src/api';
import { useAppState } from './src/useAppState';
import SeniorScreen from './src/SeniorScreen';
import FamilyScreen from './src/FamilyScreen';
import DeskScreen from './src/DeskScreen';
import Lamp from './src/Lamp';
import { Meta, PageTitle, Row, Section, tap } from './src/ui';
import Icon from './src/Icon';
import { color, font, radius } from './src/theme';

export default function App() {
  const [loaded] = useFonts({
    AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic,
    BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold,
  });
  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: color.dusk, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.lamp} /></View>;
  }
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

// Who is using this phone? Each teammate can pick a different role for the demo.
const ROLES = [
  { id: 'senior', who: 'peggy', title: 'Peggy', sub: 'The senior. Big buttons, voice chat.' },
  { id: 'family', who: 'anne', title: 'Anne', sub: 'Daughter, primary contact' },
  { id: 'family', who: 'mark', title: 'Mark', sub: 'Son' },
  { id: 'family', who: 'dolores', title: 'Dolores', sub: 'Neighbor, next door' },
  { id: 'desk', who: 'sam', title: 'Sam', sub: 'Volunteer, reassurance program' },
];

function Main() {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState(null);
  const { state, error, setError, refresh } = useAppState(role?.id === 'family' ? role.who : null);

  const run = useCallback((fn) => async () => {
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    refresh();
  }, [refresh, setError]);

  const peggy = state?.seniors.find((s) => s._id === 'peggy');

  const demoMenu = () => {
    tap();
    Alert.alert('Demo controls', state ? `AI: ${state.config.llm ? 'live model' : 'demo mode'} · Texts: ${state.config.twilio ? 'Twilio' : 'logged only'} · Data: ${state.config.mongo ? 'MongoDB' : 'in memory'}` : API_BASE, [
      { text: 'Play the demo call (scam, no ride, milk)', onPress: run(() => api.demoCall('peggy')) },
      { text: 'Peggy presses Help', onPress: run(() => api.help('peggy')) },
      { text: 'Simulate a missed check-in', onPress: run(() => api.missed('peggy')) },
      ...(state?.config.twilio ? [{ text: 'Call Peggy’s phone now', onPress: run(() => api.phoneCall('peggy')) }] : []),
      { text: 'Reset demo data', style: 'destructive', onPress: run(() => api.reset()) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={st.root}>
      <StatusBar style="light" />
      <View style={[st.header, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Switch who is using this phone" accessibilityHint="Long press for demo controls" onPress={() => { tap(); setRole(null); }} onLongPress={demoMenu} delayLongPress={600} style={st.brand}>
          <View style={st.brandDot} />
          <Text style={st.brandText}>Porchlight</Text>
        </Pressable>
        {role && <Text style={st.roleText} numberOfLines={1}>{role.id === 'senior' ? `${role.title}’s side` : role.id === 'family' ? `Family · ${role.title}` : 'Volunteer desk'}</Text>}
        {/* Peggy never sees demo controls; on her side they're behind a long press on the name. */}
        {role?.id !== 'senior' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Demo controls" onPress={demoMenu} style={st.demoBtn}>
            <Text style={st.demoText}>Demo</Text>
          </Pressable>
        )}
      </View>

      {error && (
        <Pressable onPress={() => setError(null)} style={st.error} accessibilityRole="alert">
          <Text style={st.errorText}>{error}</Text>
          <Text style={[st.errorText, { textDecorationLine: 'underline' }]}>Dismiss</Text>
        </Pressable>
      )}

      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {!role ? (
          <RolePicker onPick={setRole} />
        ) : !state || !peggy ? (
          <View style={st.loading}><ActivityIndicator color={color.lamp} /><Meta>Lighting the porch…</Meta></View>
        ) : role.id === 'senior' ? (
          <SeniorScreen senior={peggy} state={state} refresh={refresh} onError={setError} />
        ) : role.id === 'family' ? (
          <FamilyScreen senior={peggy} state={state} me={role.who} run={run} />
        ) : (
          <DeskScreen state={state} run={run} />
        )}
      </View>
    </View>
  );
}

// Two clear sides: the older adult's phone, or a family member's phone.
// Family picks who they are next, because Anne (approves rides, sees meds) and Mark see different things.
const FAMILY_ICON = { anne: 'heart', mark: 'user', dolores: 'users' };

function RolePicker({ onPick }) {
  const [step, setStep] = useState('side'); // side | family
  const family = ROLES.filter((r) => r.id === 'family');
  const senior = ROLES.find((r) => r.id === 'senior');
  const desk = ROLES.find((r) => r.id === 'desk');
  const pick = (r) => () => { tap(); onPick(r); };

  if (step === 'family') {
    return (
      <ScrollView contentContainerStyle={st.pickerPad}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { tap(); setStep('side'); }} style={st.back}>
          <Icon name="back" size={20} color={color.mutedOnDusk} />
          <Text style={st.backText}>Back</Text>
        </Pressable>
        <PageTitle title="Which family member are you?" sub={`Each person sees what they need. Only ${family[0]?.title} can approve rides and see medicines.`} />
        <Section>
          {family.map((r) => (
            <Row key={r.who} icon={FAMILY_ICON[r.who] || 'user'} title={r.title} sub={r.sub} onPress={pick(r)} accessibilityLabel={`${r.title}, ${r.sub}`} />
          ))}
        </Section>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[st.pickerPad, { paddingTop: 28 }]}>
      <View style={st.hero}>
        <Lamp state="lit" size={96} label="Porchlight" />
        <PageTitle title="Who is this phone for?" sub="Porchlight has two sides. Tap the name at the top to switch later." center />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`I'm ${senior.title}. Big buttons, a daily chat, and help when I need it.`} onPress={pick(senior)} style={({ pressed }) => [st.side, { backgroundColor: color.lamp }, pressed && { opacity: 0.9 }]}>
        <View style={[st.sideIcon, { backgroundColor: 'rgba(36,22,0,0.12)' }]}><Icon name="chat" size={26} color={color.lampInk} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.sideKicker, { color: color.lampInk, opacity: 0.75 }]}>Older adult</Text>
          <Text style={[st.sideTitle, { color: color.lampInk }]}>I’m {senior.title}</Text>
          <Text style={[st.sideSub, { color: color.lampInk }]}>Big buttons, a daily chat, and help when I need it.</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`I'm family. See how ${senior.title} is doing, approve rides, and take on tasks.`} onPress={() => { tap(); setStep('family'); }} style={({ pressed }) => [st.side, pressed && { backgroundColor: color.surface2 }]}>
        <View style={st.sideIcon}><Icon name="users" size={26} color={color.ink} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.sideKicker}>Family and neighbors</Text>
          <Text style={st.sideTitle}>I’m family</Text>
          <Text style={st.sideSub}>See how {senior.title} is doing, approve rides, and take on tasks.</Text>
        </View>
        <Icon name="chevron" size={20} color={color.muted} />
      </Pressable>
      {desk && (
        <Pressable accessibilityRole="button" onPress={pick(desk)} style={st.deskLink}>
          <Text style={st.deskText}>Volunteer desk for the nonprofit</Text>
          <Icon name="chevron" size={16} color={color.muted} />
        </Pressable>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.sky },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: color.sky },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.lamp, shadowColor: color.lamp, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  brandText: { fontFamily: font.display, fontSize: 19, color: color.ink, letterSpacing: -0.2 },
  roleText: { flexShrink: 1, fontFamily: font.bodyBold, fontSize: 13, color: color.mutedOnDusk, backgroundColor: color.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  demoBtn: { marginLeft: 'auto', minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  demoText: { fontFamily: font.bodyBold, fontSize: 14, color: color.muted },
  error: { backgroundColor: color.brickSoft, marginHorizontal: 16, marginBottom: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  errorText: { fontFamily: font.body, fontSize: 15, color: color.brick },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  pickerPad: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48, gap: 16 },
  hero: { alignItems: 'center', gap: 12, marginBottom: 8 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: color.surface, borderRadius: radius.lg, padding: 20 },
  sideIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  sideKicker: { fontFamily: font.bodyBold, fontSize: 12, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.7 },
  sideTitle: { fontFamily: font.display, fontSize: 24, lineHeight: 28, color: color.ink },
  sideSub: { fontFamily: font.body, fontSize: 16, lineHeight: 22, color: color.mutedOnDusk },
  deskLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 },
  deskText: { fontFamily: font.bodyBold, fontSize: 15, color: color.muted },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  backText: { fontFamily: font.bodyBold, fontSize: 16, color: color.mutedOnDusk },
});

