import { Children, Fragment, isValidElement, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Icon from './Icon';
import { color, font, motion, radius, space } from './theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

// True when the user has turned on Reduce Motion. All animation here checks it.
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

// Gentle scale while pressed (skipped with Reduce Motion).
function usePressScale() {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => () => {
    if (reduce) return;
    Animated.spring(scale, { toValue: v, speed: 40, bounciness: v === 1 ? 5 : 0, useNativeDriver: true }).start();
  };
  return { scale, onPressIn: to(motion.pressScale), onPressOut: to(1) };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------- Text ----------
export function PageTitle({ title, sub, style, center }) {
  const align = center ? { textAlign: 'center' } : null;
  return (
    <View style={[{ gap: 4 }, style]}>
      <Text accessibilityRole="header" style={[s.pageTitle, align]}>{title}</Text>
      {sub ? <Text style={[s.pageSub, align]}>{sub}</Text> : null}
    </View>
  );
}
export function H1({ children, style }) {
  return <Text accessibilityRole="header" style={[s.h1, style]}>{children}</Text>;
}
export function H2({ children, style }) {
  return <Text accessibilityRole="header" style={[s.h2, style]}>{children}</Text>;
}
export function P({ children, style, muted, bold, ...rest }) {
  return <Text {...rest} style={[s.p, muted && { color: color.muted }, bold && { fontFamily: font.bodyBold }, style]}>{children}</Text>;
}
export function Meta({ children, style }) {
  return <Text style={[s.meta, style]}>{children}</Text>;
}

// ---------- Containers ----------
// Borderless card that fades up gently when it first appears.
export function Card({ children, style, ...rest }) {
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return enter.setValue(1);
    Animated.timing(enter, { toValue: 1, duration: motion.enter, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [reduce, enter]);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [motion.enterOffset, 0] });
  return (
    <Animated.View {...rest} style={[s.card, style, { opacity: enter, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// A quieter panel inside a card.
export function Inset({ children, style, ...rest }) {
  return <View {...rest} style={[s.inset, style]}>{children}</View>;
}

// iOS-style grouped list: a small label above a card whose rows are split by thin dividers.
export function Section({ title, action, children, style, footer }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[{ gap: space.sm }, style]}>
      {(title || action) && (
        <View style={s.sectionHead}>
          {title ? <Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      <Card style={s.group}>
        {rows.map((r, i) => (
          <Fragment key={r.key ?? i}>
            {i > 0 && <View style={s.divider} />}
            {r}
          </Fragment>
        ))}
      </Card>
      {footer ? <Text style={[s.meta, { paddingHorizontal: 4 }]}>{footer}</Text> : null}
    </View>
  );
}

// One row in a Section: optional icon, title, subtitle, and something on the right.
export function Row({ icon, iconTone = 'neutral', title, sub, right, children, onPress, accessibilityLabel }) {
  const body = (
    <>
      <View style={s.rowTop}>
        {icon ? <IconBadge name={icon} tone={iconTone} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          {typeof title === 'string' ? <Text style={s.rowTitle}>{title}</Text> : title}
          {sub ? (typeof sub === 'string' ? <Text style={s.meta}>{sub}</Text> : sub) : null}
        </View>
        {right}
        {onPress && !right ? <Icon name="chevron" size={18} color={color.muted} /> : null}
      </View>
      {children}
    </>
  );
  if (!onPress) return <View style={s.row} accessibilityLabel={accessibilityLabel}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [s.row, pressed && { backgroundColor: color.surface2 }]}>
      {body}
    </Pressable>
  );
}

// ---------- Small pieces ----------
const TONE = {
  urgent: { fg: color.brick, bg: color.brickSoft },
  attention: { fg: color.lamp, bg: color.lampSoft },
  ok: { fg: color.sage, bg: color.sageSoft },
  neutral: { fg: color.mutedOnDusk, bg: color.surface2 },
};

export function IconBadge({ name, tone = 'neutral', size = 36 }) {
  const t = TONE[tone] ?? TONE.neutral;
  return (
    <View style={[s.badge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: t.bg }]}>
      <Icon name={name} size={size * 0.52} color={t.fg} />
    </View>
  );
}

export function Dot({ tone = 'neutral', size = 8 }) {
  const t = TONE[tone] ?? TONE.neutral;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.fg }} />;
}

// Status as a colored dot plus plain text. Calmer than a colored border.
export function Status({ label, tone = 'neutral', style }) {
  const t = TONE[tone] ?? TONE.neutral;
  return (
    <View style={[s.status, style]}>
      <Dot tone={tone} />
      <Text style={[s.statusText, { color: tone === 'neutral' ? color.muted : t.fg }]}>{label}</Text>
    </View>
  );
}

// Small pill. tone: 'urgent' | 'attention' | 'ok' | 'neutral'
export function Chip({ label, tone = 'neutral', style }) {
  const t = TONE[tone] ?? TONE.neutral;
  return (
    <View style={[s.chip, { backgroundColor: t.bg }, style]}>
      <Text style={[s.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

// ---------- Buttons ----------
// variant: 'solid' (the one amber action on a screen) | 'outline' / 'light' (filled, quiet) | 'quiet' (text only)
export function Button({ label, icon, onPress, variant = 'outline', disabled, style, small, accessibilityHint, accessibilityLabel }) {
  const press = usePressScale();
  const solid = variant === 'solid';
  const quiet = variant === 'quiet';
  const fg = solid ? color.lampInk : quiet ? color.mutedOnDusk : color.ink;
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
      style={[s.btn, small && s.btnSmall, solid && s.btnSolid, quiet && s.btnQuiet, disabled && { opacity: 0.45 }, style, { transform: [{ scale: press.scale }] }]}
    >
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={[s.btnText, small && { fontSize: 15 }, { color: fg }]}>{label}</Text>
    </AnimatedPressable>
  );
}

// The senior's giant buttons: icon on the left, big title, plain-words subtitle.
// tone: 'lamp' | 'plain' | 'help'. hint: what happens when tapped, read by VoiceOver.
const BIG_TONE = {
  lamp: { bg: color.lamp, fg: color.lampInk, sub: color.lampInk, iconBg: 'rgba(36,22,0,0.12)', icon: color.lampInk },
  plain: { bg: color.surface, fg: color.ink, sub: color.mutedOnDusk, iconBg: color.surface2, icon: color.ink },
  help: { bg: color.brickSoft, fg: color.brick, sub: color.mutedOnDusk, iconBg: 'rgba(255,139,115,0.16)', icon: color.brick },
};
export function BigButton({ title, sub, hint, icon, onPress, tone = 'plain', disabled, style }) {
  const t = BIG_TONE[tone] ?? BIG_TONE.plain;
  const press = usePressScale();
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
      style={[s.big, { backgroundColor: t.bg }, disabled && { opacity: 0.6 }, style, { transform: [{ scale: press.scale }] }]}
    >
      {icon ? (
        <View style={[s.bigIcon, { backgroundColor: t.iconBg }]}>
          <Icon name={icon} size={26} color={t.icon} strokeWidth={2.2} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.bigTitle, { color: t.fg }]}>{title}</Text>
        {sub ? <Text style={[s.bigSub, { color: t.sub }]}>{sub}</Text> : null}
      </View>
    </AnimatedPressable>
  );
}

// ---------- Tabs ----------
// Tabs with a thumb that slides to the selected one.
const SEG_PAD = 3;
export function Segmented({ options, value, onChange }) {
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const x = useRef(new Animated.Value(index)).current;
  const segW = width ? (width - SEG_PAD * 2) / options.length : 0;

  useEffect(() => {
    if (reduce) return x.setValue(index);
    Animated.spring(x, { toValue: index, speed: 22, bounciness: 3, useNativeDriver: true }).start();
  }, [index, reduce, x]);

  const pick = (id) => {
    tap();
    if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(motion.enter, 'easeInEaseOut', 'opacity'));
    onChange(id);
  };

  return (
    <View style={s.seg} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segW > 0 && (
        <Animated.View pointerEvents="none" style={[s.segThumb, { width: segW, transform: [{ translateX: Animated.multiply(x, segW) }] }]} />
      )}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="tab" accessibilityLabel={o.label} accessibilityState={{ selected: on }} onPress={() => pick(o.id)} style={s.segBtn}>
            <Text style={[s.segText, { color: on ? color.ink : color.muted }]}>{o.label}</Text>
            {o.badge ? <View style={s.segBadge}><Text style={s.segBadgeText}>{o.badge}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  pageTitle: { fontFamily: font.display, fontSize: 30, lineHeight: 34, color: color.ink, letterSpacing: -0.4 },
  pageSub: { fontFamily: font.body, fontSize: 16, lineHeight: 22, color: color.muted },
  h1: { fontFamily: font.display, fontSize: 30, lineHeight: 34, color: color.ink, letterSpacing: -0.4 },
  h2: { fontFamily: font.displaySemi, fontSize: 19, lineHeight: 24, color: color.ink },
  p: { fontFamily: font.body, fontSize: 17, lineHeight: 24, color: color.ink },
  meta: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.muted },

  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: 18, gap: 12 },
  inset: { backgroundColor: color.surface2, borderRadius: radius.md, padding: 14, gap: 8 },
  group: { padding: 0, gap: 0, overflow: 'hidden' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontFamily: font.bodyBold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase', color: color.muted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: 16 },
  row: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 22, color: color.ink },

  badge: { alignItems: 'center', justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontFamily: font.bodyBold, fontSize: 13 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: font.bodyBold, fontSize: 13 },

  btn: { minHeight: 46, flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 38, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
  btnSolid: { backgroundColor: color.lamp },
  btnQuiet: { backgroundColor: 'transparent', paddingHorizontal: 8 },
  btnText: { fontFamily: font.bodyBold, fontSize: 16, color: color.ink },

  big: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 18 },
  bigIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bigTitle: { fontFamily: font.display, fontSize: 25, lineHeight: 30 },
  bigSub: { fontFamily: font.body, fontSize: 20, lineHeight: 26 },

  seg: { flexDirection: 'row', backgroundColor: color.surface, borderRadius: 12, padding: SEG_PAD },
  segThumb: { position: 'absolute', top: SEG_PAD, bottom: SEG_PAD, left: SEG_PAD, borderRadius: 9, backgroundColor: color.surface3 },
  segBtn: { flex: 1, minHeight: 36, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segText: { fontFamily: font.bodyBold, fontSize: 14 },
  segBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: color.lamp, alignItems: 'center', justifyContent: 'center' },
  segBadgeText: { fontFamily: font.bodyBold, fontSize: 11, color: color.lampInk },
});
