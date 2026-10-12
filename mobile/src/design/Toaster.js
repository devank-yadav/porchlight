import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accent, ease, font, light, project, rubberband, shadow, spring } from './tokens';
import { haptic } from './haptics';
import Icon from './Icon';

// Sonner-style toasts for React Native.
// No hooks or context for callers: render <Toaster /> once, call toast() from anywhere.
// Stacked (newest in front), tap the stack to expand, flick up to dismiss, timers pause while
// expanded, dragging, or when the app is in the background.

let toasts = [];
let nextId = 1;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => toasts;

function add(type, title, opts = {}) {
  const id = nextId++;
  toasts = [{ id, type, title, description: opts.description, duration: opts.duration ?? (type === 'error' ? 6000 : 4000) }, ...toasts].slice(0, 8);
  emit();
  if (type === 'success') haptic.success();
  if (type === 'error') haptic.error();
  return id;
}
function dismiss(id) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
}
function remove(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = Object.assign((title, opts) => add('info', title, opts), {
  success: (title, opts) => add('success', title, opts),
  error: (title, opts) => add('error', title, opts),
  info: (title, opts) => add('info', title, opts),
  dismiss,
});

const ICON = {
  success: ['checkmark.circle.fill', accent.green],
  error: ['exclamationmark.triangle.fill', accent.red],
  info: ['info.circle.fill', accent.lampDeep],
};
const GAP = 8;
const VISIBLE = 3;

export function Toaster({ top = 0, senior = false }) {
  const list = useSyncExternalStore(subscribe, snapshot);
  const insets = useSafeAreaInsets();
  const [wantsExpanded, setExpanded] = useState(false);
  const [heights, setHeights] = useState({});
  const [appActive, setAppActive] = useState(true);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const live = list.filter((t) => !t.leaving);
  const expanded = wantsExpanded && live.length > 1;

  const paused = expanded || dragging || !appActive;


  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { top: insets.top + top }]}>
      {expanded && <Pressable style={StyleSheet.absoluteFill} onPress={() => setExpanded(false)} accessibilityLabel="Collapse notifications" />}
      {list.map((t) => {
        const index = t.leaving ? -1 : live.findIndex((item) => item.id === t.id);
        const myOffset = live.slice(0, Math.max(0, index)).reduce((sum, item) => sum + (heights[item.id] ?? 64) + GAP, 0);
        return (
          <ToastItem
            key={t.id}
            t={t}
            senior={senior}
            index={index}
            expanded={expanded}
            offset={myOffset}
            paused={paused}
            onHeight={(h) => setHeights((p) => (p[t.id] === h ? p : { ...p, [t.id]: h }))}
            onPress={() => { if (live.length > 1) { haptic.select(); setExpanded((e) => !e); } }}
            onDrag={setDragging}
          />
        );
      })}
    </View>
  );
}

function ToastItem({ t, senior, index, expanded, offset, paused, onHeight, onPress, onDrag }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(reduced ? 0 : -24);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const drag = useSharedValue(0);
  const start = useSharedValue(0);
  const left = useRef(t.duration);

  // Position in the stack. Front toast sits at 0; older ones peek out underneath it.
  useEffect(() => {
    if (t.leaving) {
      opacity.set(withTiming(0, { duration: 200, easing: ease.out }));
      y.set(withTiming(y.get() - (reduced ? 0 : 16), { duration: 200, easing: ease.out }, (done) => { if (done) scheduleOnRN(remove, t.id); }));
      return;
    }
    const targetY = expanded ? offset : index * 10;
    const targetScale = expanded ? 1 : 1 - index * 0.05;
    y.set(withTiming(reduced ? (expanded ? offset : 0) : targetY, { duration: 300, easing: ease.out }));
    scale.set(withTiming(reduced ? 1 : targetScale, { duration: 300, easing: ease.out }));
    opacity.set(withTiming(index < VISIBLE || expanded ? 1 : 0, { duration: 300, easing: ease.out }));
  }, [index, expanded, offset, t.leaving, reduced, opacity, scale, y, t.id]);

  // Auto-dismiss, pausing while expanded, dragged or backgrounded. Only the front toast counts down
  // when collapsed, so a burst of toasts doesn't vanish all at once.
  useEffect(() => {
    if (t.leaving || paused || (!expanded && index > 0)) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => dismiss(t.id), left.current);
    return () => { clearTimeout(timer); left.current -= Date.now() - startedAt; };
  }, [paused, index, expanded, t.leaving, t.id]);

  const pan = useMemo(() => Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => { start.set(drag.get()); scheduleOnRN(onDrag, true); })
    .onUpdate((e) => {
      const next = start.get() + e.translationY;
      drag.set(next <= 0 ? next : rubberband(next, 120));
    })
    .onEnd((e) => {
      scheduleOnRN(onDrag, false);
      if (drag.get() + project(e.velocityY) < -40) {
        drag.set(withTiming(-160, { duration: 200, easing: ease.out }));
        scheduleOnRN(dismiss, t.id);
      } else {
        drag.set(withSpring(0, { ...spring.snap, velocity: e.velocityY }));
      }
    }), [drag, start, onDrag, t.id]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: y.get() + drag.get() }, { scale: scale.get() }],
  }));

  const [icon, tint] = ICON[t.type];
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
        style={[st.toast, shadow.float, { zIndex: 100 - Math.max(index, 0) }, style]}
        pointerEvents={index >= VISIBLE && !expanded ? 'none' : 'auto'}
      >
        <Pressable onPress={onPress} style={st.inner} accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel={[t.title, t.description].filter(Boolean).join('. ')}>
          <Icon name={icon} size={20} color={tint} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.title, senior && { fontFamily: font.readBold, fontSize: 22, lineHeight: 28 }]} numberOfLines={expanded || index === 0 ? 3 : 1}>{t.title}</Text>
            {t.description ? <Text style={[st.desc, senior && { fontFamily: font.read, fontSize: 20, lineHeight: 27 }]} numberOfLines={expanded || index === 0 ? 4 : 1}>{t.description}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, maxWidth: 560, alignSelf: 'center', borderRadius: 20, backgroundColor: light.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: light.lineStrong },
  inner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: light.ink, letterSpacing: -0.2 },
  desc: { fontSize: 14, lineHeight: 19, color: light.ink2 },
});
