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
import { H1, Meta, P, tap } from './src/ui';
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
        <Pressable accessibilityRole="button" accessibilityLabel="Switch who is using this phone" onPress={() => { tap(); setRole(null); }} style={st.brand}>
          <View style={st.brandDot} />
          <Text style={st.brandText}>Porchlight</Text>
        </Pressable>
        {role && <Text style={st.roleText} numberOfLines={1}>{role.id === 'senior' ? `${role.title}’s side` : role.id === 'family' ? `Family · ${role.title}` : 'Volunteer desk'}</Text>}
        <Pressable accessibilityRole="button" onPress={demoMenu} style={st.demoBtn}>
          <Text style={st.demoText}>Demo</Text>
        </Pressable>
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
function RolePicker({ onPick }) {
  const [step, setStep] = useState('side'); // side | family
  const family = ROLES.filter((r) => r.id === 'family');
  const senior = ROLES.find((r) => r.id === 'senior');
  const desk = ROLES.find((r) => r.id === 'desk');
  const pick = (r) => () => { tap(); onPick(r); };

  if (step === 'family') {
    return (
      <ScrollView contentContainerStyle={st.pickerPad}>
        <H1 onDusk style={{ fontSize: 34, lineHeight: 38 }}>Which family member are you?</H1>
        <P style={{ color: color.mutedOnDusk }}>Each person sees what they need. Only {family[0]?.title} can approve rides and see medicines.</P>
        {family.map((r) => (
          <Pressable key={r.who} accessibilityRole="button" accessibilityLabel={`${r.title}, ${r.sub}`} onPress={pick(r)} style={({ pressed }) => [st.roleCard, pressed && { opacity: 0.85 }]}>
            <Text style={st.roleTitle}>{r.title}</Text>
            <Text style={st.roleSub}>{r.sub}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => { tap(); setStep('side'); }} style={st.backLink}>
          <Text style={st.linkText}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={st.pickerPad}>
      <Lamp state="lit" size={110} label="Porchlight" />
      <H1 onDusk style={{ fontSize: 34, lineHeight: 38 }}>Who is this phone for?</H1>
      <P style={{ color: color.mutedOnDusk }}>Porchlight has two sides. Tap the Porchlight name at the top to switch later.</P>
      <Pressable accessibilityRole="button" accessibilityLabel={`I'm ${senior.title}. Big buttons, a daily chat, and help when I need it.`} onPress={pick(senior)} style={({ pressed }) => [st.roleCard, st.sideCard, { backgroundColor: color.lamp }, pressed && { opacity: 0.85 }]}>
        <Text style={[st.sideKicker, { color: color.lampInk }]}>Older adult</Text>
        <Text style={[st.roleTitle, { color: color.lampInk }]}>I’m {senior.title}</Text>
        <Text style={[st.roleSub, { color: color.lampInk }]}>Big buttons, a daily chat, and help when I need it.</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`I'm family. See how ${senior.title} is doing, approve rides, and take on tasks.`} onPress={() => { tap(); setStep('family'); }} style={({ pressed }) => [st.roleCard, st.sideCard, pressed && { opacity: 0.85 }]}>
        <Text style={st.sideKicker}>Family and neighbors</Text>
        <Text style={st.roleTitle}>I’m family</Text>
        <Text style={st.roleSub}>See how {senior.title} is doing, approve rides, and take on tasks.</Text>
      </Pressable>
      {desk && (
        <Pressable accessibilityRole="button" onPress={pick(desk)} style={st.backLink}>
          <Text style={st.linkText}>Volunteer desk for the nonprofit</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.sky },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: color.sky, borderBottomWidth: 1, borderBottomColor: color.hairline },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  brandDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.lamp, shadowColor: color.lamp, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  brandText: { fontFamily: font.display, fontSize: 21, color: color.ink },
  roleText: { flex: 1, fontFamily: font.body, fontSize: 15, color: color.mutedOnDusk },
  demoBtn: { marginLeft: 'auto', minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8 },
  demoText: { fontFamily: font.bodyBold, fontSize: 15, color: color.mutedOnDusk },
  error: { backgroundColor: color.brickSoft, paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
  errorText: { fontFamily: font.body, fontSize: 15, color: color.brick },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  pickerPad: { padding: 20, paddingBottom: 48, gap: 14 },
  roleCard: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline, borderRadius: radius.lg, paddingHorizontal: 20, paddingVertical: 16, gap: 2 },
  roleTitle: { fontFamily: font.display, fontSize: 24, color: color.ink },
  roleSub: { fontFamily: font.body, fontSize: 16, color: color.muted },
  sideCard: { paddingVertical: 24, gap: 4 },
  sideKicker: { fontFamily: font.bodyBold, fontSize: 15, color: color.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  backLink: { minHeight: 48, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: 12 },
  linkText: { fontFamily: font.bodyBold, fontSize: 17, color: color.mutedOnDusk, textDecorationLine: 'underline' },
});
