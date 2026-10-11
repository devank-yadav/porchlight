import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { accent, ease, font, radius, shadow } from './tokens';
import { useTheme } from './theme';
import { haptic } from './haptics';
import Icon from './Icon';

// ── Type ────────────────────────────────────────────────────────────────────
// Hierarchy from size + weight + leading together. Large text gets negative tracking, small text none.
const TYPE = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2 },
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.9 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: -0.1 },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: 0.1 },
  // Peggy's side: Atkinson Hyperlegible, never under 20pt.
  readTitle: { fontFamily: font.readBold, fontSize: 38, lineHeight: 44, letterSpacing: -0.6 },
  readHeadline: { fontFamily: font.readBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.2 },
  read: { fontFamily: font.read, fontSize: 22, lineHeight: 31 },
  readSmall: { fontFamily: font.read, fontSize: 20, lineHeight: 27 },
};

export function T({ v = 'body', color, muted, center, style, children, ...rest }) {
  const { c } = useTheme();
  const header = ['display', 'largeTitle', 'title', 'readTitle', 'readHeadline'].includes(v);
  return (
    <Text
      accessibilityRole={header ? 'header' : undefined}
      {...rest}
      style={[TYPE[v], { color: color ?? (muted ? c.muted : c.ink) }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

// ── Press: every pressable scales to 0.97 in 120ms, on press-in ─────────────
export function Press({ onPress, onLongPress, delayLongPress, disabled, style, children, scaleTo = 0.97, feedback = 'tap', hitSlop = 8, ...a11y }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  const [outer, inner] = splitLayout(style);
  return (
    <Pressable
      style={outer}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      {...a11y}
      disabled={disabled}
      hitSlop={hitSlop}
      pressRetentionOffset={16}
      onPressIn={() => { if (!reduced) s.set(withTiming(scaleTo, { duration: 120, easing: ease.out })); }}
      onPressOut={() => s.set(withTiming(1, { duration: 160, easing: ease.out }))}
      onPress={(e) => { feedback && haptic[feedback]?.(); onPress?.(e); }}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
    >
      <Animated.View style={[inner, anim, disabled && { opacity: 0.45 }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Layout keys belong on the Pressable (so flex and alignSelf work in rows); the rest on the scaled view.
const LAYOUT = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom', 'zIndex'];
function splitLayout(style) {
  const flat = StyleSheet.flatten(style) || {};
  const outer = {};
  const inner = {};
  for (const k in flat) (LAYOUT.includes(k) ? outer : inner)[k] = flat[k];
  if (outer.flex != null || outer.flexGrow != null) inner.flexGrow = 1;
  return [outer, inner];
}

// ── Buttons ─────────────────────────────────────────────────────────────────
// variant: primary | secondary | ghost | danger | lamp. Labels say what happens.
export function Button({ label, icon, onPress, variant = 'secondary', size = 'md', disabled, busy, style, accessibilityHint, accessibilityLabel }) {
  const { c, isDark } = useTheme();
  const V = {
    primary: { bg: isDark ? '#FAFAFA' : c.primary, fg: isDark ? '#0C0C0E' : '#fff', border: 'transparent' },
    secondary: { bg: c.surface, fg: c.ink, border: c.lineStrong },
    ghost: { bg: 'transparent', fg: c.ink, border: 'transparent' },
    danger: { bg: accent.red, fg: '#fff', border: 'transparent' },
    lamp: { bg: accent.lamp, fg: accent.lampInk, border: 'transparent' },
  }[variant];
  const h = size === 'sm' ? 40 : size === 'lg' ? 56 : 48;
  return (
    <Press
      onPress={busy ? undefined : onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={[st.btn, { minHeight: h, backgroundColor: V.bg, borderColor: V.border, paddingHorizontal: size === 'sm' ? 14 : 18 }, variant === 'secondary' && !isDark && shadow.card, style]}
    >
      {busy ? <ActivityIndicator color={V.fg} /> : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} color={V.fg} /> : null}
          <Text style={[st.btnText, { color: V.fg, fontSize: size === 'sm' ? 15 : 16 }]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Press>
  );
}

// Peggy's big buttons: ≥104pt tall, an icon, a title and what happens. tone: lamp | plain | help
export function BigButton({ title, sub, icon, hint, onPress, tone = 'plain', disabled, style }) {
  const { c } = useTheme();
  const T_ = {
    lamp: { bg: accent.lamp, fg: accent.lampInk, sub: '#5C3B00', chip: 'rgba(0,0,0,0.08)' },
    help: { bg: accent.red, fg: '#fff', sub: '#FFE3DE', chip: 'rgba(255,255,255,0.16)' },
    plain: { bg: c.surface, fg: c.ink, sub: c.muted, chip: c.raised ?? c.sunken },
  }[tone];
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      feedback="press"
      scaleTo={0.98}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      accessibilityHint={hint}
      style={[st.big, { backgroundColor: T_.bg, borderColor: tone === 'plain' ? c.line : 'transparent' }, style]}
    >
      {icon ? (
        <View style={[st.bigIcon, { backgroundColor: T_.chip }]}>
          <Icon name={icon} size={28} color={T_.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[TYPE.readHeadline, { color: T_.fg }]}>{title}</Text>
        {sub ? <Text style={[TYPE.readSmall, { color: T_.sub }]}>{sub}</Text> : null}
      </View>
    </Press>
  );
}

// ── Surfaces ────────────────────────────────────────────────────────────────
export function Card({ children, style, tone, ...rest }) {
  const { c, isDark } = useTheme();
  const tint = tone === 'lamp' ? { borderColor: '#F3D08A' } : tone === 'red' ? { borderColor: '#F2B8AF' } : null;
  return <View {...rest} style={[st.card, { backgroundColor: c.surface, borderColor: c.line }, !isDark && shadow.card, tint, style]}>{children}</View>;
}

export function Section({ title, action, children, style }) {
  return (
    <View style={[{ gap: 10 }, style]}>
      {title ? (
        <View style={st.sectionHead}>
          <T v="label" muted style={{ flex: 1 }} accessibilityRole="header">{title}</T>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }) {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.lineStrong, marginLeft: inset }} />;
}

// Small status badge. tone: red | lamp | green | neutral
export function Badge({ label, tone = 'neutral', icon, style }) {
  const { c } = useTheme();
  const [bg, fg] = {
    red: [accent.redSoft, accent.redText],
    lamp: [accent.lampSoft, accent.lampText],
    green: [accent.greenSoft, accent.greenText],
    neutral: [c.sunken ?? c.raised, c.ink2],
  }[tone];
  return (
    <View style={[st.badge, { backgroundColor: bg }, style]}>
      {icon ? <Icon name={icon} size={11} color={fg} weight="bold" /> : null}
      <Text style={[st.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// A status dot. Tone matches the lamp: red only for help and scams.
export function Dot({ tone = 'neutral', size = 8 }) {
  const bg = { red: accent.red, lamp: accent.lamp, green: accent.green, neutral: '#A1A1AA' }[tone];
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }} />;
}

// ── Segmented control with a sliding pill ───────────────────────────────────
// The pill moves (ease-in-out, on-screen movement); the content below swaps with no slide (tabs are peers).
export function Segmented({ options, value, onChange, style }) {
  const { c } = useTheme();
  const [layouts, setLayouts] = useState({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const ready = useSharedValue(0);

  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    if (!ready.get()) {
      x.set(l.x); w.set(l.width); ready.set(1);
    } else {
      x.set(withTiming(l.x, { duration: 250, easing: ease.inOut }));
      w.set(withTiming(l.width, { duration: 250, easing: ease.inOut }));
    }
  }, [value, layouts, x, w, ready]);

  const pill = useAnimatedStyle(() => ({ opacity: ready.get(), width: w.get(), transform: [{ translateX: x.get() }] }));

  return (
    <View style={[st.seg, { backgroundColor: c.sunken }, style]} accessibilityRole="tablist">
      <Animated.View style={[st.segPill, shadow.card, pill]} />
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.badge ? `${o.label}, ${o.badge} new` : o.label}
            onLayout={(e) => { const { x: lx, width } = e.nativeEvent.layout; setLayouts((p) => ({ ...p, [o.id]: { x: lx, width } })); }}
            onPress={() => { if (!on) { haptic.select(); onChange(o.id); } }}
            style={st.segBtn}
          >
            <Text style={[st.segText, { color: on ? c.ink : c.muted }]}>{o.label}</Text>
            {o.badge ? <View style={st.segBadge}><Text style={st.segBadgeText}>{o.badge}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// Mounts with a short fade-up only when it arrives after the screen is already showing
// (a new ride request, a new task), never when a tab is opened.
export function useSettled(ms = 700) {
  const [settled, setSettled] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSettled(true), ms); return () => clearTimeout(t); }, [ms]);
  return settled;
}
const APPEAR = FadeInDown.duration(300).easing(ease.out);
const REFLOW = LinearTransition.duration(220).easing(ease.out);
export function Appear({ on, children, style }) {
  const reduced = useReducedMotion();
  return <Animated.View entering={on ? (reduced ? FadeIn.duration(200) : APPEAR) : undefined} layout={reduced ? undefined : REFLOW} style={style}>{children}</Animated.View>;
}

// Label + value pair used in summary rows.
export function Fact({ label, value, icon }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 3, flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {icon ? <Icon name={icon} size={12} color={c.muted} /> : null}
        <Text style={[TYPE.footnote, { color: c.muted }]}>{label}</Text>
      </View>
      <Text style={[TYPE.headline, { color: c.ink, fontSize: 16 }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  btnText: { fontWeight: '600', letterSpacing: -0.2 },
  big: { minHeight: 108, borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1 },
  bigIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
  seg: { flexDirection: 'row', borderRadius: radius.sm, padding: 3 },
  segPill: { position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 10, backgroundColor: '#fff' },
  segBtn: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  segBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segBadgeText: { fontSize: 11, fontWeight: '700', color: accent.lampInk },
});
