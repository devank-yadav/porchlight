import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dark, ease, light, project, radius, rubberband, spring } from './tokens';
import { ThemeProvider } from './theme';
import { haptic } from './haptics';

// Vaul-style drawer for React Native: drag (or flick) down to close, rubber-band at the top,
// and the app behind it scales back and rounds its corners.
// Callers: sheet.open((close) => <Content close={close} />), sheet.close(). Render <SheetHost /> once.

let current = null; // { id, render, theme }
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => current;

export const sheet = {
  open(render, { theme = 'light' } = {}) {
    current = { id: ++seq, render, theme };
    emit();
  },
  close() {
    if (current) { current = { ...current, closing: true }; emit(); }
  },
};
const unmount = (id) => { if (current?.id === id) { current = null; emit(); } };

// 0 = closed, 1 = open. Shared so the app behind can scale with the drawer.
const ProgressContext = createContext(null);
export function SheetProgressProvider({ children }) {
  const progress = useSharedValue(0);
  return <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>;
}

// Wrap the app's content in this so it recedes while a sheet is open.
export function SheetBackground({ children, style }) {
  const progress = useContext(ProgressContext);
  const insets = useSafeAreaInsets();
  const anim = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      borderRadius: interpolate(p, [0, 1], [0, 18], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 1], [0, insets.top * 0.5], Extrapolation.CLAMP) },
        { scale: interpolate(p, [0, 1], [1, 0.94], Extrapolation.CLAMP) },
      ],
    };
  });
  return <Animated.View style={[{ flex: 1, overflow: 'hidden' }, style, anim]}>{children}</Animated.View>;
}

export function SheetHost() {
  const s = useSyncExternalStore(subscribe, snapshot);
  if (!s) return null;
  return <Drawer key={s.id} entry={s} />;
}

function Drawer({ entry }) {
  const progress = useContext(ProgressContext);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const screenH = Dimensions.get('window').height;
  const [height, setHeight] = useState(0);
  const y = useSharedValue(screenH);
  const start = useSharedValue(0);
  const H = useSharedValue(screenH);

  const close = useCallback(() => sheet.close(), []);

  // Open once measured; close when the store says so.
  useEffect(() => {
    if (!height) return;
    H.set(height);
    if (entry.closing) {
      y.set(withTiming(height, { duration: reduced ? 150 : 240, easing: ease.out }, (done) => { if (done) scheduleOnRN(unmount, entry.id); }));
    } else {
      if (y.get() >= screenH) y.set(height);
      y.set(withTiming(0, { duration: reduced ? 150 : 400, easing: ease.sheet }));
    }
  }, [height, entry.closing, entry.id, reduced, screenH, y, H]);

  useEffect(() => () => { progress.set(withTiming(0, { duration: 200, easing: ease.out })); }, [progress]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onStart(() => { start.set(y.get()); })
    .onUpdate((e) => {
      const next = start.get() + e.translationY;
      y.set(next >= 0 ? next : rubberband(next, H.get())); // up past the top resists
    })
    .onEnd((e) => {
      if (y.get() + project(e.velocityY) > H.get() * 0.4) {
        scheduleOnRN(close);
      } else {
        y.set(withSpring(0, { ...spring.sheet, velocity: e.velocityY }));
        scheduleOnRN(haptic.tap); // it snapped home
      }
    }), [y, start, H, close]);

  // The backdrop and the app behind derive from the same value, so they stay in sync.
  useAnimatedReaction(
    () => (H.get() ? Math.min(1, Math.max(0, 1 - y.get() / H.get())) : 0),
    (p) => { progress.set(reduced ? 0 : p); },
  );
  const sheetStyle = useAnimatedStyle(() => {
    const p = H.get() ? Math.min(1, Math.max(0, 1 - y.get() / H.get())) : 0;
    return reduced ? { opacity: p } : { transform: [{ translateY: y.get() }] };
  });
  const backdrop = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, H.get()], [1, 0], Extrapolation.CLAMP) }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={entry.closing ? 'none' : 'auto'}>
      <Animated.View style={[StyleSheet.absoluteFill, st.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityViewIsModal
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[st.sheet, entry.theme === 'dark' && st.sheetDark, { paddingBottom: insets.bottom + 16, maxHeight: screenH - insets.top - 24 }, sheetStyle]}
        >
          {/* Fills the gap below when the sheet is rubber-banded upward. */}
          <View style={[st.underfill, entry.theme === 'dark' && st.sheetDark]} />
          <View style={st.handleZone} accessibilityLabel="Drag down to close">
            <View style={[st.handle, entry.theme === 'dark' && { backgroundColor: 'rgba(255,247,236,0.25)' }]} />
          </View>
          <ThemeProvider value={entry.theme}>{entry.render(close)}</ThemeProvider>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(27,22,19,0.42)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: light.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 20, shadowColor: '#3B2A1A', shadowOpacity: 0.16, shadowRadius: 30, shadowOffset: { width: 0, height: -6 } },
  sheetDark: { backgroundColor: dark.surface },
  underfill: { position: 'absolute', left: 0, right: 0, bottom: -400, height: 400, backgroundColor: light.surface },
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(30,25,21,0.16)' },
});
