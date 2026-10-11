// Porchlight component kit. Every screen is built only from these pieces, so the app looks the same everywhere.
import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color, font, motion, radius, space, type } from './theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

// True when Reduce Motion is on. Every animation here checks it.
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduce;
}

// Spring to 0.97 while pressed.
function usePress() {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => () => {
    if (!reduce) Animated.spring(scale, { toValue: v, speed: 40, bounciness: v === 1 ? 6 : 0, useNativeDriver: true }).start();
  };
  return { scale, onPressIn: to(motion.pressScale), onPressOut: to(1) };
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------- Text ----------
const TONE = { ink: color.ink, soft: color.soft, muted: color.muted, lamp: color.lamp, sage: color.sage, brick: color.brick, onLamp: color.lampInk };

// v: a key of `type` in theme.js. tone: ink | soft | muted | lamp | sage | brick | onLamp
export function T({ v = 'body', tone = 'ink', style, children, ...rest }) {
  return <Text {...rest} style={[type[v], { color: TONE[tone] ?? tone }, style]}>{children}</Text>;
}
export const Title = ({ senior, ...p }) => <T accessibilityRole="header" v={senior ? 'seniorDisplay' : 'display'} {...p} />;
export const Heading = (p) => <T accessibilityRole="header" v="heading" {...p} />;

// ---------- Layout ----------
export function Screen({ children, style, ...rest }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" {...rest} contentContainerStyle={[s.screen, style]}>
      {children}
    </ScrollView>
  );
}

// A grey label above a group of cards, and an optional footnote under it.
export function Section({ label, footnote, senior, children, style }) {
  return (
    <View style={[s.section, style]}>
      {label ? <T v={senior ? 'seniorLabel' : 'label'} tone={senior ? 'soft' : 'muted'} accessibilityRole="header" style={s.sectionLabel}>{label}</T> : null}
      {children}
      {footnote ? <T v="caption" tone="muted" style={s.sectionLabel}>{footnote}</T> : null}
    </View>
  );
}

// tone: default | hero (dusk blue) | urgent. flush: no padding (for List rows).
export function Card({ children, tone = 'default', flush, style, ...rest }) {
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return enter.setValue(1);
    Animated.timing(enter, { toValue: 1, duration: motion.enter, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, enter]);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [motion.enterOffset, 0] });
  return (
    <Animated.View
      {...rest}
      style={[s.card, tone === 'hero' && s.cardHero, tone === 'urgent' && s.cardUrgent, !flush && s.cardPad, style, { opacity: enter, transform: [{ translateY }] }]}
    >
      <View pointerEvents="none" style={s.highlight} />
      {children}
    </Animated.View>
  );
}

// Rows inside a flush Card, with hairline dividers between them. inset: divider's left indent.
export function List({ children, inset = space.card }) {
  const items = Children.toArray(children).filter(isValidElement);
  return items.map((child, i) => (
    <View key={child.key ?? i}>
      {i > 0 && <Divider inset={inset} />}
      {child}
    </View>
  ));
}
export function Divider({ inset = 0, style }) {
  return <View style={[s.divider, { marginLeft: inset }, style]} />;
}

// One list row: optional leading icon, a text column, optional trailing element. Extra children go under the text.
export function Row({ leading, title, sub, trailing, children, onPress, senior, style, ...rest }) {
  const body = (
    <>
      {leading}
      <View style={s.rowText}>
        {title ? <T v={senior ? 'seniorBody' : 'bodyBold'}>{title}</T> : null}
        {sub ? <T v={senior ? 'seniorSub' : 'caption'} tone="muted">{sub}</T> : null}
        {children}
      </View>
      {trailing}
    </>
  );
  if (!onPress) return <View {...rest} style={[s.row, style]}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" {...rest} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [s.row, pressed && { backgroundColor: color.raised }, style]}>
      {body}
    </Pressable>
  );
}

// ---------- Controls ----------
// variant: primary (the lamp amber) | secondary | ghost. size: md (48) | sm (40). senior: 20pt label, 56 tall.
export function Button({ label, onPress, variant = 'secondary', size = 'md', senior, disabled, style, accessibilityHint, accessibilityLabel }) {
  const press = usePress();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={(e) => { tap(); onPress?.(e); }}
      style={[s.btn, size === 'sm' && s.btnSm, senior && { minHeight: 56 }, variant === 'primary' && s.btnPrimary, variant === 'ghost' && s.btnGhost, disabled && { opacity: 0.5 }, style, { transform: [{ scale: press.scale }] }]}
    >
      <T v="label" tone={variant === 'primary' ? 'onLamp' : variant === 'ghost' ? 'soft' : 'ink'} style={[size === 'md' && { fontSize: 17 }, senior && { fontSize: 20, lineHeight: 26 }, variant === 'ghost' && { textDecorationLine: 'underline' }]}>
        {label}
      </T>
    </AnimatedPressable>
  );
}

// Peggy's big buttons: at least 104pt tall, icon in a circle, 27pt title, 20pt subtitle.
// tone: lamp | plain | help. hint: what happens, read by VoiceOver after the label.
const BIG = {
  lamp: { bg: color.lamp, border: color.lamp, title: 'onLamp', sub: 'onLamp', icon: 'onLamp' },
  plain: { bg: color.surface, border: color.hairline, title: 'ink', sub: 'soft', icon: 'raised' },
  help: { bg: color.brickSoft, border: 'rgba(242,139,116,0.45)', title: 'brick', sub: 'soft', icon: 'brick' },
};
export function BigButton({ title, sub, hint, icon, tone = 'plain', onPress, disabled, style }) {
  const t = BIG[tone] ?? BIG.plain;
  const press = usePress();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={(e) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress?.(e); }}
      style={[s.big, { backgroundColor: t.bg, borderColor: t.border }, disabled && { opacity: 0.6 }, style, { transform: [{ scale: press.scale }] }]}
    >
      {icon ? <IconCircle name={icon} tone={t.icon} size={52} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="seniorTitle" tone={t.title}>{title}</T>
        {sub ? <T v="seniorSub" tone={t.sub}>{sub}</T> : null}
      </View>
    </AnimatedPressable>
  );
}

export function Field({ senior, style, ...rest }) {
  return <TextInput placeholderTextColor={color.muted} {...rest} style={[s.field, senior && s.fieldSenior, style]} />;
}

// Tabs with a highlight that slides to the selected one; the content below cross-fades.
const TAB_PAD = 4;
export function Tabs({ options, value, onChange }) {
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const x = useRef(new Animated.Value(index)).current;
  const w = width ? (width - TAB_PAD * 2 - TAB_PAD * (options.length - 1)) / options.length : 0;

  useEffect(() => {
    if (reduce) return x.setValue(index);
    Animated.spring(x, { toValue: index, speed: 20, bounciness: 4, useNativeDriver: true }).start();
  }, [index, reduce, x]);

  const pick = (id) => {
    tap();
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(motion.enter, 'easeInEaseOut', 'opacity'));
    onChange(id);
  };

  return (
    <View style={s.tabs} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {w > 0 && <Animated.View pointerEvents="none" style={[s.tabThumb, { width: w, transform: [{ translateX: Animated.multiply(x, w + TAB_PAD) }] }]} />}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => pick(o.id)} style={s.tab}>
            <T v="label" tone={on ? 'ink' : 'muted'}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Status ----------
// tone: urgent (brick) | attention (amber) | ok (sage) | neutral
const CHIP = {
  urgent: [color.brickSoft, 'brick'],
  attention: [color.lampSoft, 'lamp'],
  ok: [color.sageSoft, 'sage'],
  neutral: [color.raised, 'soft'],
};
export function Chip({ label, tone = 'neutral', style }) {
  const [bg, fg] = CHIP[tone] ?? CHIP.neutral;
  return (
    <View style={[s.chip, { backgroundColor: bg }, style]}>
      <T v="small" tone={fg}>{label}</T>
    </View>
  );
}
const DOT = { urgent: color.brick, attention: color.lamp, ok: color.sage, neutral: color.muted };
export function Dot({ tone = 'neutral', size = 10 }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: DOT[tone] ?? DOT.neutral }} />;
}

// Numbers side by side, split by hairlines. items: [{ label, value, tone, big }]
// bare: a strip along the bottom of an existing card instead of its own card.
export function Stats({ items, bare }) {
  const cells = items.map((it, i) => (
    <View key={it.label} style={[s.stat, i > 0 && s.statDivider]} accessible accessibilityLabel={`${it.label}: ${it.value}`}>
      <T v="caption" tone="soft">{it.label}</T>
      <T v={it.big ? 'title' : 'bodyBold'} tone={it.tone ?? 'ink'}>{it.value}</T>
    </View>
  ));
  if (bare) return <View style={[s.stats, s.statsBare]}>{cells}</View>;
  return <Card flush style={s.stats}>{cells}</Card>;
}

// Label/value pairs on a raised panel. items: [[label, value]]
export function InfoList({ items }) {
  const rows = items.filter(([, v]) => v);
  return (
    <View style={s.info}>
      {rows.map(([k, v], i) => (
        <View key={k}>
          {i > 0 && <Divider inset={14} />}
          <View style={s.infoRow} accessible accessibilityLabel={`${k}: ${v}`}>
            <T v="caption" tone="muted" style={{ fontSize: 15 }}>{k}</T>
            <T v="label" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

// A thin step bar. steps: labels; index: current step; tone of the filled part.
export function Steps({ steps, index, tone = 'attention' }) {
  const fill = { attention: color.lamp, ok: color.sage, neutral: color.soft }[tone] ?? color.lamp;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`Step ${index + 1} of ${steps.length}: ${steps[index]}`}>
      <View style={s.steps}>
        {steps.map((st, i) => <View key={st} style={[s.step, i <= index && { backgroundColor: fill }]} />)}
      </View>
      <View style={s.stepLabels}>
        {steps.map((st, i) => (
          <T key={st} v="small" tone={i <= index ? 'ink' : 'muted'} style={[{ flex: 1 }, i > index && { fontFamily: font.body }]}>{st}</T>
        ))}
      </View>
    </View>
  );
}

// ---------- Icons ----------
// Simple line icons (24×24, round caps). Decorative: VoiceOver reads the button or row instead.
const ICON = {
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  shield: ['M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  alert: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4.5', 'M12 17.5v.01'],
  chevron: ['M9 6l6 6-6 6'],
  back: ['M15 6l-6 6 6 6'],
  car: ['M5 16V11l2-5h10l2 5v5', 'M3 16h18v3H3z', 'M7 19v1.5M17 19v1.5', 'M5 11h14'],
  bag: ['M5 8h14l-1 12H6z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  message: ['M4 5h16v11H8l-4 4z'],
  book: ['M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h11'],
};
export function Icon({ name, size = 24, tint = color.ink, strokeWidth = 2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'calendar' ? (
        <>
          <Rect x="3.5" y="5" width="17" height="15" rx="3" stroke={tint} strokeWidth={strokeWidth} />
          <Path d="M8 3v4M16 3v4M3.5 10h17" stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </>
      ) : name === 'clock' ? (
        <>
          <Circle cx="12" cy="12" r="8.5" stroke={tint} strokeWidth={strokeWidth} />
          <Path d="M12 7.5V12l3 2" stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        (ICON[name] ?? ICON.check).map((d) => <Path key={d} d={d} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)
      )}
    </Svg>
  );
}
// tone: raised | sage | lamp | brick | onLamp (on an amber button)
const CIRCLE = {
  raised: [color.raised, color.ink],
  sage: [color.sageSoft, color.sage],
  lamp: [color.lampSoft, color.lamp],
  brick: ['rgba(242,139,116,0.16)', color.brick],
  onLamp: ['rgba(42,26,0,0.12)', color.lampInk],
};
export function IconCircle({ name, tone = 'raised', size = 44 }) {
  const [bg, fg] = CIRCLE[tone] ?? CIRCLE.raised;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={Math.round(size / 2)} tint={fg} strokeWidth={tone === 'sage' ? 2.5 : 2} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { paddingHorizontal: space.screen, paddingTop: 16, paddingBottom: 40, gap: space.section },
  section: { gap: space.tight },
  sectionLabel: { marginHorizontal: 4 },
  card: { backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.hairline, overflow: 'hidden' },
  cardPad: { padding: space.card, gap: 12 },
  cardHero: { backgroundColor: color.dusk },
  cardUrgent: { backgroundColor: color.brickSoft, borderColor: 'rgba(242,139,116,0.45)' },
  highlight: { position: 'absolute', top: 0, left: radius.card, right: radius.card, height: 1, backgroundColor: color.highlight },
  divider: { height: 1, backgroundColor: color.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.card, paddingVertical: 14, minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
  btn: { minHeight: 48, paddingHorizontal: 18, borderRadius: radius.control, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  btnSm: { minHeight: 40, paddingHorizontal: 14 },
  btnPrimary: { backgroundColor: color.lamp },
  btnGhost: { backgroundColor: 'transparent', minHeight: 44 },
  big: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 16, borderRadius: radius.card, borderWidth: 1 },
  field: { minHeight: 48, borderRadius: radius.control, borderWidth: 1, borderColor: color.hairline, backgroundColor: color.raised, paddingHorizontal: 14, fontFamily: font.body, fontSize: 16, color: color.ink },
  fieldSenior: { minHeight: 56, fontSize: 21 },
  tabs: { flexDirection: 'row', gap: TAB_PAD, padding: TAB_PAD, borderRadius: radius.control, backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline },
  tabThumb: { position: 'absolute', top: TAB_PAD, bottom: TAB_PAD, left: TAB_PAD, borderRadius: radius.control - 3, backgroundColor: color.dusk2 },
  tab: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  chip: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 },
  stats: { flexDirection: 'row' },
  statsBare: { borderTopWidth: 1, borderTopColor: color.hairline },
  stat: { flex: 1, paddingHorizontal: space.card, paddingVertical: 12, gap: 2 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: color.hairline },
  info: { borderRadius: radius.control, backgroundColor: color.raised },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  steps: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.line },
  stepLabels: { flexDirection: 'row', gap: 4 },
});
