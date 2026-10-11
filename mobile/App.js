import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible';
import { useAppState } from './src/useAppState';
import { startPushResponseListener } from './src/push';
import { AppContext, useAppContext, PEOPLE } from './src/AppContext';
import { openDemoMenu, openRoleSheet } from './src/menus';
import Lamp from './src/Lamp';
import { ThemeProvider } from './src/design/theme';
import { Toaster, toast } from './src/design/Toaster';
import { SheetBackground, SheetHost, SheetProgressProvider } from './src/design/Sheet';
import { Press, T, BigButton, Button } from './src/design/ui';
import Icon from './src/design/Icon';
import { accent, font, light, seniorPalette } from './src/design/tokens';

export default function App({ children }) {
  useEffect(startPushResponseListener, []);
  const [loaded, fontError] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic });
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: light.bg }}>
    <SafeAreaProvider><SheetProgressProvider>
      {loaded || fontError ? <Main>{children}</Main> : <View style={st.loading}><ActivityIndicator color={light.ink} accessibilityLabel="Loading Tella" /></View>}
    </SheetProgressProvider></SafeAreaProvider>
  </GestureHandlerRootView>;
}

function Main({ children }) {
  const path = usePathname();
  const { viewer } = useGlobalSearchParams();
  const role = path.startsWith('/senior') ? PEOPLE[0] : path.startsWith('/family') ? PEOPLE.find((p) => p.who === viewer && p.id === 'family') ?? PEOPLE[1] : path.startsWith('/desk') ? PEOPLE.find((p) => p.id === 'desk') : null;
  const { state, error, refresh } = useAppState(role?.id === 'family' ? role.who : null);
  const setRole = useCallback((person) => router.replace(!person ? '/' : person.id === 'family' ? '/family/' + person.who + '/today' : person.id === 'senior' ? '/senior/today' : '/desk'), []);
  const run = useCallback((fn, success) => async () => {
    try {
      const result = await fn();
      const msg = typeof success === 'function' ? success(result) : success;
      if (msg) toast.success(...(Array.isArray(msg) ? [msg[0], { description: msg[1] }] : [msg]));
      await refresh();
      return result;
    } catch (e) { toast.error('That didn’t go through', { description: e.message }); }
  }, [refresh]);
  const ctx = useMemo(() => ({ state, error, refresh, run, role, setRole }), [state, error, refresh, run, role, setRole]);
  const senior = role?.id === 'senior';
  return <AppContext.Provider value={ctx}><ThemeProvider value={senior ? 'senior' : 'light'}>
    <StatusBar style="dark" />
    <SheetBackground style={{ backgroundColor: senior ? seniorPalette.bg : light.bg }}>
      {role && <Header senior={senior} />}
      {children}
    </SheetBackground>
    <SheetHost /><Toaster top={64} senior={senior} />
  </ThemeProvider></AppContext.Provider>;
}

function Header({ senior }) {
  const insets = useSafeAreaInsets();
  const ctx = useAppContext();
  return <View style={[st.header, { paddingTop: insets.top + 4, backgroundColor: senior ? seniorPalette.bg : light.bg }]}>
    <View style={st.headerRow}>
      {senior ? <Text onLongPress={() => openDemoMenu(ctx)} style={[st.brand, { fontFamily: font.readBold }]}>Tella</Text> :
        <Press onPress={() => openRoleSheet(ctx)} onLongPress={() => openDemoMenu(ctx)} accessibilityLabel={'Using Tella as ' + ctx.role.title + '. Switch person'} style={st.brandButton}>
          <Text style={st.brand}>Tella</Text><Icon name="chevron.down" size={12} color={light.muted} />
        </Press>}
      <Text style={[st.sample, senior && { fontFamily: font.read, fontSize: 20 }]}>Sample</Text>
    </View>
    {ctx.error && ctx.state && <View accessibilityLiveRegion="polite" style={st.offline}><T v={senior ? 'readSmall' : 'callout'} color={accent.lampText}>Connection lost. Showing the last update.</T></View>}
  </View>;
}

export function DataGate({ children }) {
  const { state, error, refresh, role } = useAppContext();
  const senior = state?.seniors.find((s) => s._id === 'peggy');
  if (senior) return children(senior);
  const Retry = role?.id === 'senior' ? BigButton : Button;
  return <View style={st.loading}>
    <Lamp state="dim" size={80} />
    <T v={role?.id === 'senior' ? 'readHeadline' : 'title'} center>{error ? 'Let’s reconnect' : 'Opening your day…'}</T>
    {error ? <><T muted center>We can’t reach Tella. Check your connection and try again.</T><Retry title="Try again" label="Try again" onPress={refresh} /></> : <ActivityIndicator color={light.ink} />}
  </View>;
}

const st = StyleSheet.create({
  header: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: light.line },
  headerRow: { minHeight: 52, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandButton: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center' },
  brand: { fontSize: 21, fontWeight: '700', letterSpacing: -0.6, color: light.ink },
  sample: { fontSize: 13, color: light.muted },
  offline: { paddingHorizontal: 24, paddingVertical: 8, backgroundColor: accent.lampSoft },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 24 },
});
