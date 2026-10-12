import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { DefaultTheme, Redirect, ThemeProvider as NavThemeProvider, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible';
import { useAppState } from './src/useAppState';
import { startPushResponseListener } from './src/push';
import { AppContext, useAppContext, HEADER_H } from './src/AppContext';
import { api } from './src/api';
import { loadSession, saveSession, clearSession, setOnExpired } from './src/session';
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

// Who is signed in on this phone. session: { token, role } from the Keychain (null = signed out);
// me: the account from the server (name, setupDone, seniorId…). The role never changes on a phone.
function useAccount() {
  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState(null);
  const loadMe = useCallback(async () => {
    try { setMe(await api.me()); setMeError(null); } catch (e) { if (e.status !== 401) setMeError(e.message); }
  }, []);
  useEffect(() => {
    (async () => {
      const saved = await loadSession();
      setSession(saved);
      if (saved) await loadMe();
      setBooted(true);
    })();
  }, [loadMe]);
  const signedOut = useCallback(async () => {
    await clearSession();
    setSession(null);
    setMe(null);
    router.replace('/');
  }, []);
  useEffect(() => setOnExpired(() => { signedOut(); toast.info('Please sign in again', { description: 'Your sign-in on this phone ended.' }); }), [signedOut]);
  const signedIn = useCallback(async ({ token, role, me: who }) => {
    await saveSession({ token, role });
    setSession({ token, role });
    setMe(who);
  }, []);
  const signOut = useCallback(async () => {
    await api.signOut().catch(() => {});
    await signedOut();
  }, [signedOut]);
  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    await signedOut();
  }, [signedOut]);
  return useMemo(() => ({ booted, session, me, setMe, loadMe, meError, signedIn, signOut, deleteAccount }), [booted, session, me, loadMe, meError, signedIn, signOut, deleteAccount]);
}

function Main({ children }) {
  const path = usePathname();
  const account = useAccount();
  const { session, me } = account;
  const ready = Boolean(session && me?.setupDone);
  const { state, error, refresh } = useAppState(ready ? me.id : null);
  // The circle went away (the older adult deleted their account): back to setup.
  useEffect(() => {
    if (ready && state?.me && !state.me.seniorId) account.loadMe().then(() => router.replace('/'));
  }, [ready, state?.me, account]);
  const inApp = path.startsWith('/senior') || path.startsWith('/family');
  const roleId = ready && inApp ? session.role : null;
  const memberId = me?.memberId;
  const myName = me?.name;
  const role = useMemo(() => (roleId ? { id: roleId, who: memberId, title: myName || 'You' } : null), [roleId, memberId, myName]);
  const run = useCallback((fn, success) => async () => {
    try {
      const result = await fn();
      const msg = typeof success === 'function' ? success(result) : success;
      if (msg) toast.success(...(Array.isArray(msg) ? [msg[0], { description: msg[1] }] : [msg]));
      await refresh();
      return result;
    } catch (e) { toast.error('That didn’t go through', { description: e.message }); }
  }, [refresh]);
  const ctx = useMemo(() => ({ state, error, refresh, run, role, account }), [state, error, refresh, run, role, account]);
  const senior = (role?.id ?? session?.role) === 'senior';
  // Navigators paint warm paper too (no stock grey behind any screen).
  const navTheme = useMemo(() => ({ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: senior ? seniorPalette.bg : light.bg, card: light.surface, text: light.ink, border: light.line, primary: accent.lampDeep } }), [senior]);
  return <AppContext.Provider value={ctx}><NavThemeProvider value={navTheme}><ThemeProvider value={senior ? 'senior' : 'light'}>
    <StatusBar style="dark" />
    <SheetBackground style={{ backgroundColor: senior ? seniorPalette.bg : light.bg }}>
      {role && <Header senior={senior} />}
      {account.booted ? children : <View style={st.loading}><Lamp state="lit" size={104} /></View>}
    </SheetBackground>
    <SheetHost /><Toaster top={role ? HEADER_H + 6 : 12} senior={senior} />
  </ThemeProvider></NavThemeProvider></AppContext.Provider>;
}

function Header({ senior }) {
  const insets = useSafeAreaInsets();
  const ctx = useAppContext();
  const bg = senior ? seniorPalette.bg : light.bg;
  const person = ctx.state?.seniors?.[0];
  const who = ctx.role;
  const openAccount = () => router.navigate(senior ? '/senior/family' : '/family/settings');
  return <View style={[st.header, { paddingTop: insets.top, backgroundColor: bg }]}>
    {/* Content softens as it scrolls up under the bar. Drawn first, so the avatar's shadow sits on top of it. */}
    <Svg pointerEvents="none" style={st.fade} width="100%" height={18}>
      <Defs><LinearGradient id="headerFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={bg} stopOpacity="1" /><Stop offset="1" stopColor={bg} stopOpacity="0" /></LinearGradient></Defs>
      <Rect x="0" y="0" width="100%" height="18" fill="url(#headerFade)" />
    </Svg>
    <View style={st.headerRow}>
      <View style={st.brandButton} accessible accessibilityRole="header" accessibilityLabel="Porchlight">
        <Lamp state={lampState(person)} size={senior ? 36 : 32} still />
        <Text style={[st.brand, senior && st.brandSenior]}>Porchlight</Text>
      </View>
      <Press onPress={openAccount} scaleTo={0.94} accessibilityLabel={`Signed in as ${who.title}. ${senior ? 'Opens your family page' : 'Opens settings'}`} style={st.avatarButton}>
        <Avatar name={who.title} size={senior ? 44 : 36} style={st.avatarRing} />
      </Press>
    </View>
    {ctx.error && ctx.state ? <View accessibilityLiveRegion="polite" style={st.offline}>
      <View style={st.offlineDot} />
      <Text style={[st.offlineText, senior && { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 20, lineHeight: 26 }]}>Connection lost. Showing the last update.</Text>
    </View> : null}
  </View>;
}

// Signed-in pages only: the right role, setup finished, and the circle's data loaded.
export function DataGate({ role: want, children }) {
  const { state, error, refresh, account } = useAppContext();
  const [trying, setTrying] = useState(false);
  if (!account.session || !account.me?.setupDone || account.session.role !== want) return <Redirect href="/" />;
  const senior = state?.seniors?.[0];
  if (senior) return children(senior);
  const isSenior = want === 'senior';
  const Retry = isSenior ? BigButton : Button;
  const retry = async () => { setTrying(true); await refresh(); setTrying(false); };
  return <View style={st.loading}>
    <Lamp state={error ? 'dim' : 'lit'} size={104} />
    <View style={{ gap: 8, alignItems: 'center', maxWidth: 340 }}>
      <T v={isSenior ? 'readHeadline' : 'title'} center>{error ? 'Let’s reconnect' : 'Opening your day…'}</T>
      {/* The real reason (no internet, or the app pointed at the wrong server), not a generic line. */}
      {error ? <T v={isSenior ? 'readSmall' : 'callout'} muted center>{error}</T> : null}
    </View>
    {error ? <Retry title={trying ? 'Trying again…' : 'Try again'} label="Try again" variant="primary" icon="arrow.clockwise" busy={trying} disabled={trying} onPress={retry} style={{ alignSelf: 'stretch', maxWidth: 340, width: '100%' }} /> : <ActivityIndicator color={light.muted} />}
  </View>;
}

const st = StyleSheet.create({
  header: { zIndex: 10 },
  headerRow: { height: HEADER_H, paddingLeft: 12, paddingRight: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 },
  brand: { fontSize: 20, fontWeight: '700', letterSpacing: -0.6, color: light.ink },
  brandSenior: { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 23, letterSpacing: -0.3 },
  avatarButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { borderWidth: 2, borderColor: '#FFFFFF', ...shadow.card, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginHorizontal: 20, marginBottom: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: accent.lampSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(224,138,18,0.25)' },
  offlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: accent.lamp },
  offlineText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: accent.lampText, flexShrink: 1 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: -18 }, // not top: '100%': on iPhone that ignores the safe-area padding
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 22, padding: 24 },
});
