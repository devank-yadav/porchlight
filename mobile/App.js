import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { DefaultTheme, ThemeProvider as NavThemeProvider, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible';
import { useAppState } from './src/useAppState';
import { startPushResponseListener } from './src/push';
import { AppContext, useAppContext, PEOPLE, HEADER_H } from './src/AppContext';
import { openDemoMenu, openRoleSheet } from './src/menus';
import Lamp, { lampState } from './src/Lamp';
import { ThemeProvider } from './src/design/theme';
import { Toaster, toast } from './src/design/Toaster';
import { SheetBackground, SheetHost, SheetProgressProvider } from './src/design/Sheet';
import { Avatar, Press, T, BigButton, Button } from './src/design/ui';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { accent, font, light, seniorPalette, shadow } from './src/design/tokens';

export default function App({ children }) {
  useEffect(startPushResponseListener, []);
  const [loaded, fontError] = useFonts({ AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic });
  return <GestureHandlerRootView style={{ flex: 1, backgroundColor: light.bg }}>
    <SafeAreaProvider><SheetProgressProvider>
      {loaded || fontError ? <Main>{children}</Main> : <View style={st.loading}><ActivityIndicator color={light.ink} accessibilityLabel="Loading Porchlight" /></View>}
    </SheetProgressProvider></SafeAreaProvider>
  </GestureHandlerRootView>;
}

function Main({ children }) {
  const path = usePathname();
  const { viewer } = useGlobalSearchParams();
  const role = path.startsWith('/senior') ? PEOPLE[0] : path.startsWith('/family') ? PEOPLE.find((p) => p.who === viewer && p.id === 'family') ?? PEOPLE[1] : null;
  const { state, error, refresh } = useAppState(role?.id === 'family' ? role.who : null);
  const setRole = useCallback((person) => router.replace(!person ? '/' : person.id === 'family' ? '/family/' + person.who + '/today' : '/senior/today'), []);
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
  // Navigators paint warm paper too (no stock grey behind any screen).
  const navTheme = useMemo(() => ({ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: senior ? seniorPalette.bg : light.bg, card: light.surface, text: light.ink, border: light.line, primary: accent.lampDeep } }), [senior]);
  return <AppContext.Provider value={ctx}><NavThemeProvider value={navTheme}><ThemeProvider value={senior ? 'senior' : 'light'}>
    <StatusBar style="dark" />
    <SheetBackground style={{ backgroundColor: senior ? seniorPalette.bg : light.bg }}>
      {role && <Header senior={senior} />}
      {children}
    </SheetBackground>
    <SheetHost /><Toaster top={HEADER_H + 6} senior={senior} />
  </ThemeProvider></NavThemeProvider></AppContext.Provider>;
}

function Header({ senior }) {
  const insets = useSafeAreaInsets();
  const ctx = useAppContext();
  const bg = senior ? seniorPalette.bg : light.bg;
  const peggy = ctx.state?.seniors?.find((s) => s._id === 'peggy');
  const who = ctx.role;
  const switchPerson = () => openRoleSheet(ctx);
  return <View style={[st.header, { paddingTop: insets.top, backgroundColor: bg }]}>
    <View style={st.headerRow}>
      <Press onPress={switchPerson} onLongPress={() => openDemoMenu(ctx)} delayLongPress={600} scaleTo={0.98} accessibilityLabel={'Porchlight, sample. Using it as ' + who.title + '. Switch person'} accessibilityHint="Long press for demo controls" style={st.brandButton}>
        <Lamp state={lampState(peggy)} size={senior ? 36 : 32} />
        <Text style={[st.brand, senior && st.brandSenior]}>Porchlight</Text>
        <View style={st.sample}><Text style={[st.sampleText, senior && st.sampleSenior]}>Sample</Text></View>
      </Press>
      <Press onPress={switchPerson} scaleTo={0.94} accessibilityLabel={'Signed in as ' + who.title + '. Switch person'} style={st.avatarButton}>
        <Avatar name={who.title} size={senior ? 44 : 36} style={st.avatarRing} />
      </Press>
    </View>
    {ctx.error && ctx.state ? <View accessibilityLiveRegion="polite" style={st.offline}>
      <View style={st.offlineDot} />
      <Text style={[st.offlineText, senior && { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 20, lineHeight: 26 }]}>Connection lost. Showing the last update.</Text>
    </View> : null}
    {/* Content softens as it scrolls up under the bar. */}
    <Svg pointerEvents="none" style={st.fade} width="100%" height={18}>
      <Defs><LinearGradient id="headerFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={bg} stopOpacity="1" /><Stop offset="1" stopColor={bg} stopOpacity="0" /></LinearGradient></Defs>
      <Rect x="0" y="0" width="100%" height="18" fill="url(#headerFade)" />
    </Svg>
  </View>;
}

export function DataGate({ children }) {
  const { state, error, refresh, role } = useAppContext();
  const senior = state?.seniors.find((s) => s._id === 'peggy');
  if (senior) return children(senior);
  const isSenior = role?.id === 'senior';
  const Retry = isSenior ? BigButton : Button;
  return <View style={st.loading}>
    <Lamp state={error ? 'dim' : 'lit'} size={104} />
    <View style={{ gap: 8, alignItems: 'center', maxWidth: 340 }}>
      <T v={isSenior ? 'readHeadline' : 'title'} center>{error ? 'Let’s reconnect' : 'Opening your day…'}</T>
      {error ? <T v={isSenior ? 'readSmall' : 'callout'} muted center>We can’t reach Porchlight. Check your connection and try again.</T> : null}
    </View>
    {error ? <Retry title="Try again" label="Try again" variant="primary" icon="arrow.clockwise" onPress={refresh} style={{ alignSelf: 'stretch', maxWidth: 340, width: '100%' }} /> : <ActivityIndicator color={light.muted} />}
  </View>;
}

const st = StyleSheet.create({
  header: { zIndex: 10 },
  headerRow: { height: HEADER_H, paddingLeft: 12, paddingRight: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 },
  brand: { fontSize: 20, fontWeight: '700', letterSpacing: -0.6, color: light.ink },
  brandSenior: { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 23, letterSpacing: -0.3 },
  sample: { marginLeft: 6, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(30,25,21,0.06)' },
  sampleText: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.2, color: light.muted },
  sampleSenior: { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 15, lineHeight: 18, color: seniorPalette.muted },
  avatarButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { borderWidth: 2, borderColor: '#FFFFFF', ...shadow.card, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginHorizontal: 20, marginBottom: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: accent.lampSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(224,138,18,0.25)' },
  offlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: accent.lamp },
  offlineText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: accent.lampText, flexShrink: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: -18 }, // not top: '100%': on iPhone that ignores the safe-area padding
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22, padding: 24 },
});
