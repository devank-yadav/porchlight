import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible';
import { api } from './src/api';
import { useAppState } from './src/useAppState';
import { AppContext, useAppContext as useAppContextSafe, HEADER_H } from './src/AppContext';
import StartScreen from './src/StartScreen';
import SeniorScreen from './src/SeniorScreen';
import FamilyScreen from './src/FamilyScreen';
import DeskScreen from './src/DeskScreen';
import { openDemoMenu, openRoleSheet } from './src/menus';
import Lamp, { lampState } from './src/Lamp';
import { ThemeProvider } from './src/design/theme';
import { Toaster, toast } from './src/design/Toaster';
import { SheetBackground, SheetHost, SheetProgressProvider } from './src/design/Sheet';
import { Press, T, Button } from './src/design/ui';
import Icon from './src/design/Icon';
import { accent, dark, light } from './src/design/tokens';

export default function App() {
  const [loaded] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic });
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider>
        <SheetProgressProvider>
          {loaded ? <Main /> : <View style={{ flex: 1, backgroundColor: dark.bg }} />}
        </SheetProgressProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Main() {
  const [role, setRole] = useState(null);
  const { state, error, refresh } = useAppState(role?.id === 'family' ? role.who : null);

  // Runs a server call, refreshes, and reports the outcome as a toast.
  const run = useCallback((fn, success) => async () => {
    try {
      const r = await fn();
      if (success) {
        const msg = typeof success === 'function' ? success(r) : success;
        if (msg) toast.success(...(Array.isArray(msg) ? [msg[0], { description: msg[1] }] : [msg]));
      }
    } catch (e) {
      toast.error('That didn’t go through', { description: e.message });
    }
    refresh();
  }, [refresh]);

  const ctx = useMemo(() => ({ state, error, refresh, run, role, setRole }), [state, error, refresh, run, role]);
  const dusk = !role || role.id === 'senior';
  const theme = dusk ? 'dark' : 'light';

  return (
    <AppContext.Provider value={ctx}>
      <ThemeProvider value={theme}>
        <StatusBar style={dusk ? 'light' : 'dark'} />
        <SheetBackground style={{ backgroundColor: dusk ? dark.bg : light.bg }}>
          {!role ? <StartScreen onPick={setRole} /> : <Shell />}
        </SheetBackground>
        <SheetHost />
        <Toaster top={role ? HEADER_H : 8} />
      </ThemeProvider>
    </AppContext.Provider>
  );
}

function Shell() {
  const { state, error, role, refresh } = useAppContextSafe();
  const peggy = state?.seniors.find((s) => s._id === 'peggy');
  const dusk = role.id === 'senior';

  let body;
  if (!state || !peggy) body = <Loading error={error} refresh={refresh} />;
  else if (role.id === 'senior') body = <SeniorScreen senior={peggy} />;
  else if (role.id === 'family') body = <FamilyScreen senior={peggy} me={role.who} />;
  else body = <DeskScreen />;

  return (
    <View style={{ flex: 1 }}>
      {body}
      <Header dusk={dusk} offline={!!error && !!state} />
    </View>
  );
}

// Floating, translucent chrome. Content scrolls underneath it.
function Header({ dusk, offline }) {
  const insets = useSafeAreaInsets();
  const ctx = useAppContextSafe();
  const { role, state } = ctx;
  const peggy = state?.seniors.find((s) => s._id === 'peggy');
  const c = dusk ? dark : light;
  const who = role.id === 'senior' ? 'Peggy’s side' : role.id === 'family' ? role.title : 'Volunteer desk';

  return (
    <View style={[st.header, { paddingTop: insets.top, height: insets.top + HEADER_H }]}>
      <BlurView intensity={dusk ? 40 : 70} tint={dusk ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dusk ? 'rgba(12,12,14,0.72)' : 'rgba(247,247,245,0.72)' }]} />
      <View style={[st.headerEdge, { backgroundColor: c.line }]} />
      <View style={st.headerRow}>
        {/* Peggy never sees demo controls: on her side they're behind a long press on the name. */}
        <Press
          onPress={() => openRoleSheet(ctx)}
          onLongPress={() => openDemoMenu(ctx)}
          delayLongPress={600}
          accessibilityLabel={`Porchlight. ${who}. Switch who is using this phone`}
          accessibilityHint="Long press for demo controls"
          style={st.brand}
        >
          <View style={st.brandLamp}><Lamp state={lampState(peggy)} size={30} /></View>
          <Text style={[st.brandText, { color: c.ink }]}>Porchlight</Text>
          <View style={[st.whoPill, { backgroundColor: dusk ? dark.raised : 'rgba(0,0,0,0.05)' }]}>
            <Text style={[st.whoText, { color: c.ink2 }]} numberOfLines={1}>{who}</Text>
            <Icon name="chevron.down" size={10} color={c.muted} weight="bold" />
          </View>
        </Press>
        <View style={{ flex: 1 }} />
        {offline && (
          <View style={st.offline} accessibilityLabel="Can’t reach the server. Retrying.">
            <View style={st.offlineDot} />
            <Text style={st.offlineText}>Offline</Text>
          </View>
        )}
        {role.id !== 'senior' && (
          <Press onPress={() => openDemoMenu(ctx)} accessibilityLabel="Demo controls" style={[st.iconBtn, { backgroundColor: 'rgba(0,0,0,0.05)' }]}>
            <Icon name="ellipsis" size={17} color={c.ink} />
          </Press>
        )}
      </View>
    </View>
  );
}

function Loading({ error, refresh }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.loading, { paddingTop: insets.top + HEADER_H }]}>
      <Lamp state="dim" size={96} />
      {error ? (
        <View style={{ gap: 12, alignItems: 'center', maxWidth: 320 }}>
          <T v="headline" center>Can’t reach Porchlight</T>
          <T v="callout" muted center>{error}</T>
          <Button label="Try again" icon="arrow.clockwise" onPress={refresh} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator />
          <T v="callout" muted>Lighting the porch…</T>
        </View>
      )}
    </View>
  );
}


const st = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  headerEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  headerRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  brandLamp: { width: 30, height: 30, marginRight: -2 },
  brandText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.5 },
  whoPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 4, maxWidth: 170 },
  whoText: { fontSize: 13, fontWeight: '600' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent.redSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: accent.red },
  offlineText: { fontSize: 12, fontWeight: '600', color: accent.redText },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
});
