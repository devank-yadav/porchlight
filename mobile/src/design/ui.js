import { Children, Fragment, createContext, useContext, useEffect, useId, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { accent, ease, font, night, radius, shadow } from './tokens';
import { ThemeProvider, useTheme } from './theme';
import { haptic } from './haptics';
import Icon from './Icon';

// Where a component sits: on the page, inside a card, or inside an inset-grouped list.
// Rows (ListRow, PlanRow) use it to draw their own card on the page, or sit flush inside one.
export const SurfaceContext = createContext('page');
export const useSurface = () => useContext(SurfaceContext);

// Set by AppTabs so Screen knows to clear the floating tab bar.
export const TabBarContext = createContext(null);

// Bottom padding that clears the floating tab bar (bar + its offset + breathing room).
export const TAB_CLEARANCE = 112;
export const TAB_CLEARANCE_SENIOR = 132;

// SVG ids must be unique per instance (the web preview shares one DOM).
export function useSvgId(prefix) {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

// ── Type ────────────────────────────────────────────────────────────────────
// Hierarchy from size + weight + leading together. Large text gets negative tracking, small text none.
const TYPE = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2 },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.8 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5 },
  section: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: -0.1 },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400', letterSpacing: -0.1 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600', letterSpacing: 0.1 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  // Peggy's side: Atkinson Hyperlegible, never under 20pt.
  readDisplay: { fontFamily: font.readBold, fontSize: 42, lineHeight: 48, letterSpacing: -0.8 },
  readTitle: { fontFamily: font.readBold, fontSize: 38, lineHeight: 44, letterSpacing: -0.6 },
  readHeadline: { fontFamily: font.readBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.2 },
  read: { fontFamily: font.read, fontSize: 22, lineHeight: 31 },
  readSmall: { fontFamily: font.read, fontSize: 20, lineHeight: 27 },
};
export { TYPE };
const HEADERS = ['display', 'largeTitle', 'title', 'section', 'readDisplay', 'readTitle', 'readHeadline'];

// On Peggy's side every non-"read" variant still renders in Atkinson at 20pt or more.
function seniorize(t) {
  const bold = Number(t.fontWeight) >= 600;
  return { fontFamily: bold ? font.readBold : font.read, fontWeight: 'normal', fontSize: Math.max(20, t.fontSize), lineHeight: Math.max(27, t.lineHeight), letterSpacing: Math.min(0, t.letterSpacing ?? 0), textTransform: 'none' };
}

const SENIOR_SECTION = { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 24, lineHeight: 30, letterSpacing: -0.2 };

export function T({ v = 'body', color, muted, center, style, children, ...rest }) {
  const { c, isSenior } = useTheme();
  const t = TYPE[v] ?? TYPE.body;
  return (
    <Text
      accessibilityRole={HEADERS.includes(v) ? 'header' : undefined}
      {...rest}
      style={[t, isSenior && !v.startsWith('read') && (v === 'section' ? SENIOR_SECTION : seniorize(t)), { color: color ?? (muted ? c.muted : c.ink) }, center && { textAlign: 'center' }, style]}
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
// variant: primary | secondary | ghost | danger | lamp | soft. Labels say what happens.
export function Button({ label, icon, onPress, variant = 'secondary', size = 'md', disabled, busy, style, accessibilityHint, accessibilityLabel }) {
  const { c, isDark, isSenior } = useTheme();
  const V = {
    primary: { bg: c.primary, fg: c.onPrimary, border: 'transparent' },
    secondary: { bg: c.surface, fg: c.ink, border: isDark ? c.lineStrong : c.line },
    ghost: { bg: 'transparent', fg: c.ink, border: 'transparent' },
    danger: { bg: accent.red, fg: '#fff', border: 'transparent' },
    lamp: { bg: accent.lamp, fg: accent.lampInk, border: 'transparent' },
    soft: { bg: c.sunken, fg: c.ink, border: 'transparent' },
  }[variant] ?? { bg: c.surface, fg: c.ink, border: c.line };
  const h = isSenior ? 104 : size === 'sm' ? 44 : size === 'lg' ? 56 : 50;
  const r = isSenior ? radius.lg : size === 'sm' ? radius.pill : radius.md;
  return (
    <Press
      onPress={busy ? undefined : onPress}
      disabled={disabled || busy}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={[st.btn, { minHeight: h, borderRadius: r, backgroundColor: V.bg, borderColor: V.border, paddingHorizontal: isSenior ? 18 : size === 'sm' ? 16 : 16 }, variant === 'secondary' && !isDark && shadow.card, variant === 'ghost' && size === 'sm' && { paddingHorizontal: 10 }, style]}
    >
      {busy ? <ActivityIndicator color={V.fg} /> : (
        <>
          {icon ? <Icon name={icon} size={isSenior ? 24 : size === 'sm' ? 15 : 17} color={V.fg} /> : null}
          <Text style={[st.btnText, { color: V.fg, fontSize: isSenior ? 22 : size === 'sm' ? 15 : 16, flexShrink: 1, textAlign: 'center' }, isSenior && { fontFamily: font.readBold, fontWeight: 'normal', lineHeight: 28 }]}>{label}</Text>
        </>
      )}
    </Press>
  );
}

// A small rounded-square icon tile. tone: plain | lamp | amber | green | red | ink | night
export function IconTile({ icon, tone = 'plain', size = 40, iconSize, style }) {
  const { c, isNight } = useTheme();
  const [bg, fg] = TILE[tone]?.(c, isNight) ?? TILE.plain(c, isNight);
  return (
    <View style={[{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.5)} color={fg} />
    </View>
  );
}
const TILE = {
  plain: (c, n) => [n ? 'rgba(255,247,236,0.10)' : c.sunken, c.ink],
  lamp: (c, n) => [n ? 'rgba(245,165,36,0.18)' : accent.lampSoft, n ? '#FFC566' : accent.lampText],
  amber: () => [accent.lamp, accent.lampInk],
  green: (c, n) => [n ? 'rgba(80,190,120,0.16)' : accent.greenSoft, n ? '#8FE0AA' : accent.greenText],
  red: (c, n) => [n ? 'rgba(240,100,80,0.18)' : accent.redSoft, n ? '#FFAB9C' : accent.red],
  redSolid: () => [accent.red, '#FFFFFF'],
  ink: (c) => [c.primary, c.onPrimary],
  night: () => ['rgba(255,247,236,0.10)', night.ink],
  glass: () => ['rgba(255,255,255,0.42)', accent.lampInk],
};

// Peggy's big buttons: ≥112pt tall, an icon tile, a title and what happens. tone: lamp | plain | help
export function BigButton({ title, sub, icon, hint, onPress, tone = 'plain', disabled, style, chevron = false }) {
  const { c, isNight } = useTheme();
  const gid = useSvgId('bb');
  const plainNight = tone === 'plain' && isNight;
  const T_ = {
    lamp: { bg: accent.lamp, fg: accent.lampInk, sub: '#4F3200', tile: 'glass', border: 'transparent' },
    help: { bg: accent.redSoft, fg: accent.redText, sub: accent.redText, tile: 'redSolid', border: 'rgba(217,63,43,0.16)' },
    plain: plainNight
      ? { bg: 'rgba(255,247,236,0.07)', fg: night.ink, sub: night.muted, tile: 'night', border: night.line }
      : { bg: c.surface, fg: c.ink, sub: c.muted, tile: 'plain', border: c.line },
  }[tone] ?? { bg: c.surface, fg: c.ink, sub: c.muted, tile: 'plain', border: c.line };
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      feedback="press"
      scaleTo={0.97}
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      accessibilityHint={hint}
      style={[st.big, { backgroundColor: T_.bg, borderColor: T_.border }, tone === 'plain' && !isNight && shadow.card, tone === 'lamp' && st.lampLift, style]}
    >
      {tone === 'lamp' ? (
        // A padding-free layer for the gradient: on iPhone, '100%' on an absolute child of a padded view is
        // measured inside the padding, so the gradient covered only the upper left of the button.
        <View style={st.bigFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFBD4A" />
                <Stop offset="1" stopColor="#F29A15" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx={radius.lg} ry={radius.lg} fill={`url(#${gid})`} />
          </Svg>
        </View>
      ) : null}
      {icon ? <IconTile icon={icon} tone={T_.tile} size={60} iconSize={30} style={{ borderRadius: 18 }} /> : null}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[TYPE.readHeadline, { color: T_.fg }]}>{title}</Text>
        {sub ? <Text style={[TYPE.readSmall, { color: T_.sub }]}>{sub}</Text> : null}
      </View>
      {chevron ? <View><Icon name="chevron.right" size={20} color={T_.sub} weight="bold" /></View> : null}
    </Press>
  );
}

// ── Surfaces ────────────────────────────────────────────────────────────────
export function Card({ children, style, tone, ...rest }) {
  const { c, isNight } = useTheme();
  const tint = tone === 'lamp' ? { backgroundColor: isNight ? c.surface : '#FFFBF4', borderColor: 'rgba(224,138,18,0.30)' } : tone === 'red' ? { backgroundColor: isNight ? c.surface : '#FFF9F7', borderColor: 'rgba(217,63,43,0.28)' } : null;
  return (
    <View {...rest} style={[st.card, { backgroundColor: c.surface, borderColor: c.line }, !isNight && shadow.card, tint, style]}>
      <SurfaceContext.Provider value="card">{children}</SurfaceContext.Provider>
    </View>
  );
}

// The night porch-light card: the one dark, bold surface on a screen, with an amber glow.
// Children render in the night palette (T, Button, Chip, Lamp adapt). glowAt: left | center | right
// tone: 'lamp' (amber glow, default) or 'red' (help): the glow follows the porch light's colour.
export function HeroCard({ children, style, glow = true, glowAt = 'left', tone = 'lamp', ...rest }) {
  const { isSenior } = useTheme();
  const id = useSvgId('hero');
  // In the card's own units (no measuring pass): the glow sits behind the lamp.
  const gx = glowAt === 'center' ? '50%' : glowAt === 'right' ? '80%' : '20%';
  const gy = glowAt === 'center' ? '30%' : '24%';
  const gr = glowAt === 'center' ? '75%' : '90%';
  const red = tone === 'red';
  return (
    <View {...rest} style={[st.hero, style]}>
      {glow ? (
        <View style={st.heroClip} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id={id} cx={gx} cy={gy} r={gr} fx={gx} fy={gy}>
                <Stop offset="0" stopColor={red ? '#FF6A52' : '#FFB547'} stopOpacity={red ? 0.42 : 0.5} />
                <Stop offset="0.28" stopColor={red ? '#D93F2B' : '#F5A524'} stopOpacity="0.18" />
                <Stop offset="0.62" stopColor={red ? '#A8291A' : '#E08A12'} stopOpacity="0.06" />
                <Stop offset="1" stopColor={red ? '#A8291A' : '#E08A12'} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id={id + 'e'} cx="96%" cy="108%" r="60%">
                <Stop offset="0" stopColor="#B4560F" stopOpacity="0.16" />
                <Stop offset="1" stopColor="#B4560F" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx={radius.xl} ry={radius.xl} fill={`url(#${id}e)`} />
            <Rect x="0" y="0" width="100%" height="100%" rx={radius.xl} ry={radius.xl} fill={`url(#${id})`} />
          </Svg>
        </View>
      ) : null}
      <ThemeProvider value={isSenior ? 'senior-night' : 'night'}>
        <SurfaceContext.Provider value="card">{children}</SurfaceContext.Provider>
      </ThemeProvider>
    </View>
  );
}

// A square-ish grid tile for 2-column grids: icon tile on top, title below. tone: plain | lamp | help
export function Tile({ icon, title, sub, onPress, tone = 'plain', hint, style, senior, disabled, accessibilityLabel }) {
  const { c, isSenior, isNight } = useTheme();
  const S = senior ?? isSenior;
  const T_ = {
    lamp: { bg: accent.lamp, fg: accent.lampInk, sub: '#4F3200', tile: 'glass', border: 'transparent' },
    help: { bg: accent.redSoft, fg: accent.redText, sub: accent.redText, tile: 'redSolid', border: 'rgba(217,63,43,0.16)' },
    plain: isNight ? { bg: 'rgba(255,247,236,0.07)', fg: night.ink, sub: night.muted, tile: 'night', border: night.line } : { bg: c.surface, fg: c.ink, sub: c.muted, tile: 'plain', border: c.line },
  }[tone] ?? { bg: c.surface, fg: c.ink, sub: c.muted, tile: 'plain', border: c.line };
  // The outer view takes the grid slot (two per row, with or without flexWrap); the card fills it.
  return (
    <View style={[st.tileSlot, style]}>
    <Press
      onPress={onPress}
      disabled={disabled}
      feedback="press"
      accessibilityLabel={accessibilityLabel ?? (sub ? `${title}. ${sub}` : title)}
      accessibilityHint={hint}
      style={[st.tile, { flex: 1, minHeight: S ? 132 : 112, padding: S ? 18 : 16, backgroundColor: T_.bg, borderColor: T_.border }, tone === 'plain' && !isNight && shadow.card, tone === 'lamp' && st.lampLift]}
    >
      {icon ? <IconTile icon={icon} tone={T_.tile} size={S ? 52 : 40} style={S ? { borderRadius: 16 } : { borderRadius: 12 }} /> : null}
      <View style={{ gap: 2, marginTop: 'auto' }}>
        <Text style={S ? [TYPE.readHeadline, { fontSize: 22, lineHeight: 27, color: T_.fg }] : [st.tileTitle, { color: T_.fg }]}>{title}</Text>
        {sub ? <Text style={S ? [TYPE.readSmall, { lineHeight: 25, color: T_.sub }] : [TYPE.footnote, { color: T_.sub }]}>{sub}</Text> : null}
      </View>
    </Press>
    </View>
  );
}

// iOS inset-grouped list: a white card whose rows are separated by inset hairlines.
export function ListGroup({ children, style }) {
  const { c, isSenior, isNight } = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  const insetFor = (child) => {
    const p = child?.props ?? {};
    if (p.dividerInset != null) return p.dividerInset;
    if (p.icon || p.avatar) return 16 + (isSenior ? 48 : 36) + (isSenior ? 14 : 12);
    if (p.plan) return 16 + (isSenior ? 72 + 16 : 52 + 14);
    return 16;
  };
  return (
    <View style={[st.group, { backgroundColor: c.surface, borderColor: c.line }, !isNight && shadow.card, style]}>
      <View style={st.groupClip}>
        <SurfaceContext.Provider value="group">
          {items.map((child, i) => (
            <Fragment key={child.key ?? i}>
              {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.lineStrong, marginLeft: insetFor(child) }} /> : null}
              {child}
            </Fragment>
          ))}
        </SurfaceContext.Provider>
      </View>
    </View>
  );
}

// A row for ListGroup: icon tile (or avatar name), title, detail, and a right-hand value or chevron.
// On its own on a page it draws its own rounded card. iconTone: plain | lamp | amber | green | red | ink
export function ListRow({ icon, iconTone = 'plain', avatar, title, sub, right, onPress, accessibilityLabel, accessibilityHint, chevron }) {
  const { c, isSenior, isNight } = useTheme();
  const surface = useSurface();
  if (surface === 'page') return <ListGroup><ListRow {...{ icon, iconTone, avatar, title, sub, right, onPress, accessibilityLabel, accessibilityHint, chevron }} /></ListGroup>;
  const S = isSenior;
  const label = accessibilityLabel ?? [title, sub, typeof right === 'string' ? right : null].filter(Boolean).join('. ');
  const showChevron = chevron ?? (!!onPress && right == null);
  const body = (
    <>
      {avatar ? <Avatar name={avatar} size={S ? 48 : 36} /> : icon ? <IconTile icon={icon} tone={iconTone} size={S ? 48 : 36} iconSize={S ? 24 : 18} style={{ borderRadius: S ? 14 : 10 }} /> : null}
      <View style={{ flex: 1, gap: S ? 2 : 1 }}>
        <Text style={S ? [TYPE.readHeadline, { fontSize: 22, lineHeight: 28, color: c.ink }] : [st.rowTitle, { color: c.ink }]}>{title}</Text>
        {sub ? <Text style={S ? [TYPE.readSmall, { color: c.muted }] : [st.rowSub, { color: c.muted }]}>{sub}</Text> : null}
      </View>
      {typeof right === 'string' ? <Text style={S ? [TYPE.readSmall, { color: c.muted }] : [st.rowRight, { color: c.muted }]}>{right}</Text> : right != null ? <View style={{ alignSelf: 'center' }}>{right}</View> : null}
      {showChevron ? <Icon name="chevron.right" size={S ? 18 : 14} color={c.faint} weight="bold" /> : null}
    </>
  );
  const rowStyle = [st.row, { minHeight: S ? 80 : 60, gap: S ? 14 : 12, paddingVertical: S ? 16 : 12, paddingHorizontal: surface === 'card' ? 0 : 16 }];
  if (!onPress) return <View style={rowStyle} accessible accessibilityLabel={label}>{body}</View>;
  return (
    <Pressable
      onPress={(e) => { haptic.tap(); onPress(e); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: isNight ? 'rgba(255,247,236,0.06)' : c.sunken }]}
    >
      {body}
    </Pressable>
  );
}

// A warm-tinted initial circle. tone: auto (from the name) | lamp | ink | night
const TINTS = [['#F6E2C6', '#7A4A0E'], ['#EADFD3', '#5A4636'], ['#F3DDD3', '#7C3B26'], ['#E3E7D6', '#46553A'], ['#E6E0EC', '#4F4566'], ['#F1E6D8', '#6E4F33']];
export function Avatar({ name = '?', size = 40, tone, style }) {
  const { isSenior, isNight } = useTheme();
  const n = String(name || '?').trim();
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 997;
  const t = tone ?? (isNight ? 'night' : null);
  const [bg, fg] = t === 'lamp' ? [accent.lamp, accent.lampInk] : t === 'ink' ? ['#1E1915', '#FFF7EC'] : t === 'night' ? ['rgba(255,247,236,0.14)', night.ink] : TINTS[h % TINTS.length];
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]} accessible={false} importantForAccessibility="no">
      <Text style={{ color: fg, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.52), fontWeight: isSenior ? 'normal' : '700', fontFamily: isSenior ? font.readBold : undefined, letterSpacing: -0.3 }}>{n.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

// A section title (20pt semibold) with an optional link-style action on the right.
export function SectionHeader({ title, action, onAction, style }) {
  const { isSenior } = useTheme();
  return (
    <View style={[st.sectionHead, style]}>
      <T v="section" style={{ flex: 1 }}>{title}</T>
      {action && onAction ? (
        <Press onPress={onAction} accessibilityLabel={action} hitSlop={12} scaleTo={0.96}>
          <Text style={[st.link, isSenior && { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 20, lineHeight: 26 }]}>{action}</Text>
        </Press>
      ) : null}
    </View>
  );
}

// The iOS large title block for the top of family screens. (Peggy's side: T v="readTitle".)
export function LargeTitle({ title, subtitle, right, style }) {
  return (
    <View style={[{ gap: 4, paddingTop: 4 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T v="largeTitle" style={{ flex: 1 }}>{title}</T>
        {right}
      </View>
      {subtitle ? <T v="callout" muted>{subtitle}</T> : null}
    </View>
  );
}

// A small rounded status chip. tone: neutral | lamp | green | red | night (adapts on a HeroCard)
export function Chip({ label, icon, tone = 'neutral', style }) {
  const { c, isSenior, isNight } = useTheme();
  const t = isNight && tone === 'neutral' ? 'night' : tone;
  const [bg, fg, border] = isNight ? {
    night: ['rgba(255,247,236,0.10)', night.ink2, 'rgba(255,247,236,0.12)'],
    lamp: ['rgba(245,165,36,0.18)', '#FFC566', 'rgba(245,165,36,0.28)'],
    green: ['rgba(80,190,120,0.16)', '#9BE3B4', 'rgba(80,190,120,0.26)'],
    red: ['rgba(240,100,80,0.20)', '#FFB3A6', 'rgba(240,100,80,0.30)'],
  }[t] ?? ['rgba(255,247,236,0.10)', night.ink2, 'rgba(255,247,236,0.12)'] : {
    neutral: [c.sunken, c.ink2, 'transparent'],
    lamp: [accent.lampSoft, accent.lampText, 'rgba(224,138,18,0.18)'],
    green: [accent.greenSoft, accent.greenText, 'rgba(47,138,78,0.16)'],
    red: [accent.redSoft, accent.redText, 'rgba(217,63,43,0.16)'],
    night: ['rgba(255,247,236,0.10)', night.ink2, 'rgba(255,247,236,0.12)'],
  }[t] ?? [c.sunken, c.ink2, 'transparent'];
  return (
    <View style={[st.chip, { backgroundColor: bg, borderColor: border }, isSenior && { paddingHorizontal: 14, paddingVertical: 7, gap: 8 }, style]}>
      {icon ? <Icon name={icon} size={isSenior ? 18 : 12} color={fg} weight="bold" /> : null}
      <Text style={[st.chipText, { color: fg }, isSenior && { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 20, lineHeight: 25, letterSpacing: 0 }]}>{label}</Text>
    </View>
  );
}

// The page scroller: 20pt gutters, 28pt between sections, and bottom room for the floating tab bar.
export function Screen({ children, senior, contentStyle, style, ref, ...rest }) {
  const { isSenior } = useTheme();
  const tabs = useContext(TabBarContext);
  const insets = useSafeAreaInsets();
  const S = senior ?? isSenior;
  const bottom = tabs ? (tabs === 'senior' ? TAB_CLEARANCE_SENIOR : TAB_CLEARANCE) + Math.max(0, insets.bottom - 34) : insets.bottom + 32;
  return (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={[{ flex: 1 }, style]}
      contentContainerStyle={[st.screen, { paddingBottom: bottom, gap: S ? 24 : 28 }, contentStyle]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

// ── Lists and labels ────────────────────────────────────────────────────────
export function Section({ title, action, children, style }) {
  return (
    <View style={[{ gap: 12 }, style]}>
      {title ? (
        <View style={st.sectionHead}>
          <T v="section" style={{ flex: 1 }}>{title}</T>
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
  const { c, isSenior, isNight } = useTheme();
  const [bg, fg] = {
    red: [isNight ? 'rgba(240,100,80,0.20)' : accent.redSoft, isNight ? '#FFB3A6' : accent.redText],
    lamp: [isNight ? 'rgba(245,165,36,0.18)' : accent.lampSoft, isNight ? '#FFC566' : accent.lampText],
    green: [isNight ? 'rgba(80,190,120,0.16)' : accent.greenSoft, isNight ? '#9BE3B4' : accent.greenText],
    neutral: [isNight ? 'rgba(255,247,236,0.10)' : c.sunken, c.ink2],
  }[tone] ?? [c.sunken, c.ink2];
  return (
    <View style={[st.badge, { backgroundColor: bg }, isSenior && { paddingHorizontal: 12, paddingVertical: 6 }, style]}>
      {icon ? <Icon name={icon} size={isSenior ? 16 : 11} color={fg} weight="bold" /> : null}
      <Text style={[st.badgeText, { color: fg }, isSenior && { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 20, lineHeight: 25 }]}>{label}</Text>
    </View>
  );
}

// A status dot. Tone matches the lamp: red only for help and scams.
export function Dot({ tone = 'neutral', size = 8 }) {
  const { c } = useTheme();
  const bg = { red: accent.red, lamp: accent.lamp, green: accent.green, neutral: c.faint }[tone] ?? c.faint;
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
      <Animated.View style={[st.segPill, { backgroundColor: c.surface }, shadow.card, { shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, pill]} />
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
// Kept for the screens that pass it to Appear. Always settled now: the old 0.7 s timer re-rendered the
// whole screen just as Peggy reached for her first tap.
export function useSettled() {
  return true;
}
// A section wrapper. Entrance animations are off: on some iPhones in Expo Go they never ran and
// left whole screens invisible. on/index are kept so screens don't change.
export function Appear({ on, index = 0, children, style }) {
  return <View style={style}>{children}</View>;
}

// Label + value pair used in summary rows.
export function Fact({ label, value, icon }) {
  const { c, isSenior } = useTheme();
  return (
    <View style={{ gap: 4, flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 120 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={isSenior ? 18 : 13} color={c.muted} /> : null}
        <Text style={[TYPE.footnote, { color: c.muted, flexShrink: 1 }, isSenior && TYPE.readSmall, isSenior && { color: c.muted }]}>{label}</Text>
      </View>
      <Text style={[TYPE.headline, { color: c.ink }, isSenior && TYPE.readHeadline, isSenior && { fontSize: 22, lineHeight: 28 }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  btnText: { fontWeight: '600', letterSpacing: -0.2 },
  big: { minHeight: 112, borderRadius: radius.lg, paddingLeft: 18, paddingRight: 22, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: StyleSheet.hairlineWidth },
  lampLift: { shadowColor: '#C46E00', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 12 },
  hero: { backgroundColor: night.bg, borderRadius: radius.xl, padding: 22, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,247,236,0.08)', shadowColor: '#2A1A0C', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  // Spelled out: React Native 0.86 dropped StyleSheet.absoluteFillObject (the web preview still has it),
  // and without it the glow sat in the layout and pushed the card's content out of sight on iPhone.
  bigFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  heroClip: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  tileSlot: { flexGrow: 1, flexBasis: '40%', minWidth: 0 },
  tile: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, gap: 14, alignItems: 'flex-start' },
  tileTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: -0.2 },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  groupClip: { borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: -0.2 },
  rowSub: { fontSize: 14, lineHeight: 19 },
  rowRight: { fontSize: 15, lineHeight: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 },
  link: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: accent.lampText },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', letterSpacing: -0.1 }, // iOS doesn't shrink text in a row by itself
  screen: { paddingHorizontal: 20, paddingTop: 8, width: '100%', maxWidth: 680, alignSelf: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { flexShrink: 1, fontSize: 12, lineHeight: 15, fontWeight: '600' },
  seg: { flexDirection: 'row', borderRadius: radius.sm, padding: 3 },
  segPill: { position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 10 },
  segBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  segText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  segBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segBadgeText: { fontSize: 11, fontWeight: '700', color: accent.lampInk },
});
