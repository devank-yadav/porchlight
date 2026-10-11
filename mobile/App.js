import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
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
import { BigButton, Card, Icon, IconCircle, List, Row, Screen, Section, T, Title, tap } from './src/ui';
import { color, radius, space } from './src/theme';

export default function App() {
  const [loaded] = useFonts({
    AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic,
    BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold,
  });
  if (!loaded) {
    return <View style={[st.root, st.center]}><ActivityIndicator color={color.lamp} /></View>;
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

  const roleLabel = !role ? null : role.id === 'senior' ? role.title : role.id === 'family' ? role.title : 'Volunteer desk';

  return (
    <View style={st.root}>
      <StatusBar style="light" />
      <View style={[st.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Porchlight. Switch who is using this phone"
          accessibilityHint="Long press for demo controls"
          onPress={() => { tap(); setRole(null); }}
          onLongPress={demoMenu}
          delayLongPress={600}
          style={st.brand}
        >
          <View style={st.brandDot} />
          <T v="heading" style={{ fontSize: 17 }}>Porchlight</T>
        </Pressable>
        <View style={{ flex: 1 }} />
        {/* Peggy never sees demo controls; on her side they're behind a long press on the name. */}
        {role && role.id !== 'senior' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Demo controls" onPress={demoMenu} style={st.headerBtn}>
            <T v="small" tone="muted">Demo</T>
          </Pressable>
        )}
        {roleLabel && <View style={st.rolePill}><T v="small" tone="soft">{roleLabel}</T></View>}
      </View>

      {error && (
        <Pressable onPress={() => setError(null)} style={st.error} accessibilityRole="alert" accessibilityHint="Dismisses this message">
          <Icon name="alert" size={20} tint={color.brick} />
          <T v="caption" tone="brick" style={{ flex: 1 }}>{error}</T>
          <T v="small" tone="brick" style={{ textDecorationLine: 'underline' }}>Dismiss</T>
        </Pressable>
      )}

      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {!role ? (
          <RolePicker onPick={setRole} />
        ) : !state || !peggy ? (
          <View style={st.center}><ActivityIndicator color={color.lamp} /><T v="caption" tone="muted">Lighting the porch…</T></View>
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
  const pick = (r) => () => onPick(r);
  const chevron = <Icon name="chevron" size={20} tint={color.muted} />;

  if (step === 'family') {
    return (
      <Screen>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { tap(); setStep('side'); }} style={st.back}>
          <Icon name="back" size={20} tint={color.soft} />
          <T v="label" tone="soft">Back</T>
        </Pressable>
        <View style={{ gap: 8 }}>
          <Title>Which family member are you?</Title>
          <T tone="muted">Each person sees what they need. Only {family[0]?.title} can approve rides and see medicines.</T>
        </View>
        <Card flush>
          <List>
            {family.map((r) => (
              <Row key={r.who} title={r.title} sub={r.sub} leading={<IconCircle name="user" />} trailing={chevron} onPress={pick(r)} accessibilityLabel={`${r.title}, ${r.sub}`} />
            ))}
          </List>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Lamp state="lit" size={96} label="Porchlight" />
        <Title>Who is this phone for?</Title>
        <T tone="muted">Porchlight has two sides. Tap the Porchlight name at the top to switch later.</T>
      </View>
      <BigButton
        tone="lamp"
        icon="heart"
        title={`I’m ${senior.title}`}
        sub="Big buttons, a daily chat, and help when I need it."
        hint="Opens the older adult's side."
        onPress={pick(senior)}
      />
      <Section label="Family and volunteers">
        <Card flush>
          <List inset={72}>
            <Row title="I’m family" sub={`See how ${senior.title} is doing, approve rides, take on tasks.`} leading={<IconCircle name="user" />} trailing={chevron} onPress={() => setStep('family')} />
            {desk && <Row title="Volunteer desk" sub="For the nonprofit’s reassurance program." leading={<IconCircle name="phone" />} trailing={chevron} onPress={pick(desk)} />}
          </List>
        </Card>
      </Section>
    </Screen>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.screen, paddingBottom: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.lamp },
  headerBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  rolePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: color.raised },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: space.screen, marginBottom: 8, padding: 12, borderRadius: radius.control, backgroundColor: color.brickSoft },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
});
