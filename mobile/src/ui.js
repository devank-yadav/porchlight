import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { color, font, motion, radius } from './theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

// True when the user has turned on Reduce Motion. All animation here checks it.
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

// Spring to 0.97 while pressed (skipped with Reduce Motion).
function usePressScale() {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => () => {
    if (reduce) return;
    Animated.spring(scale, { toValue: v, speed: 40, bounciness: v === 1 ? 6 : 0, useNativeDriver: true }).start();
  };
  return { scale, onPressIn: to(motion.pressScale), onPressOut: to(1) };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The faint 1px light along the top inside edge of cards and buttons.
function Highlight({ inset }) {
  return <View pointerEvents="none" style={[s.highlight, { left: inset, right: inset }]} />;
}

export function H1({ children, style, onDusk }) {
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

// Fades and slides up 8px when it first appears.
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
      <Highlight inset={radius.lg} />
      {children}
    </Animated.View>
  );
}

// A nested panel for content inside a card.
export function Inset({ children, style, ...rest }) {
  return <View {...rest} style={[s.inset, style]}>{children}</View>;
}

// Regular button. variant: 'outline' | 'solid' | 'quiet' | 'light'
export function Button({ label, onPress, variant = 'outline', disabled, style, small, onDusk, accessibilityHint }) {
  const press = usePressScale();
  const quiet = variant === 'quiet';
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={(e) => { tap(); onPress?.(e); }}
      style={[
        s.btn,
        small && s.btnSmall,
        variant === 'solid' && s.btnSolid,
        quiet && s.btnQuiet,
        disabled && { opacity: 0.5 },
        style,
        { transform: [{ scale: press.scale }] },
      ]}
    >
      {!quiet && <Highlight inset={radius.sm} />}
      <Text style={[s.btnText, small && { fontSize: 15 }, variant === 'solid' && { color: color.lampInk }, quiet && s.btnQuietText, onDusk && quiet && { fontSize: 19 }]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

// The senior's giant buttons. tone: 'lamp' | 'plain' | 'help'
// hint: what happens when tapped, read by VoiceOver after the label.
const BIG_TONE = {
  lamp: { bg: color.lamp, fg: color.lampInk, sub: color.lampInk, border: color.lamp },
  plain: { bg: color.surface, fg: color.ink, sub: color.mutedOnDusk, border: color.hairline },
  help: { bg: color.brickSoft, fg: color.brick, sub: color.mutedOnDusk, border: color.brick },
};
export function BigButton({ title, sub, hint, onPress, tone = 'plain', disabled, style }) {
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
      style={[s.big, { backgroundColor: t.bg, borderColor: t.border }, tone === 'help' && { borderWidth: 2 }, disabled && { opacity: 0.6 }, style, { transform: [{ scale: press.scale }] }]}
    >
      {tone === 'plain' && <Highlight inset={radius.sm} />}
      <Text style={[s.bigTitle, { color: t.fg }]}>{title}</Text>
      {sub ? <Text style={[s.bigSub, { color: t.sub }]}>{sub}</Text> : null}
    </AnimatedPressable>
  );
}

// Small status pill: tinted dark background, colored text. tone: 'urgent' | 'attention' | 'ok' | 'neutral'
const CHIP_TONE = {
  urgent: [color.brickSoft, color.brick],
  attention: [color.lampSoft, color.lamp],
  ok: [color.sageSoft, color.sage],
  neutral: [color.surface2, color.mutedOnDusk],
};
export function Chip({ label, tone = 'neutral', style }) {
  const [bg, fg] = CHIP_TONE[tone] ?? CHIP_TONE.neutral;
  return (
    <View style={[s.chip, { backgroundColor: bg }, style]}>
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// Tabs with a highlight that slides to the selected one. Content changes animate with LayoutAnimation.
const SEG_PAD = 4;
const SEG_GAP = 4;
export function Segmented({ options, value, onChange }) {
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const x = useRef(new Animated.Value(index)).current;
  const segW = width ? (width - SEG_PAD * 2 - SEG_GAP * (options.length - 1)) / options.length : 0;

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
    <View style={s.seg} accessibilityRole="tablist" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {segW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[s.segThumb, { width: segW, transform: [{ translateX: Animated.multiply(x, segW + SEG_GAP) }] }]}
        />
      )}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => pick(o.id)}
            style={s.segBtn}
          >
            <Text style={[s.segText, { color: on ? color.ink : color.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  h1: { fontFamily: font.display, fontSize: 32, lineHeight: 36, color: color.ink, letterSpacing: -0.3 },
  h2: { fontFamily: font.displaySemi, fontSize: 20, lineHeight: 24, color: color.ink },
  p: { fontFamily: font.body, fontSize: 17, lineHeight: 25, color: color.ink },
  meta: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.muted },
  highlight: { position: 'absolute', top: 0, height: 1, backgroundColor: color.highlight },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.hairline, padding: 18, gap: 12 },
  inset: { backgroundColor: color.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: color.hairline, padding: 14, gap: 8 },
  btn: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: color.hairline, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 6 },
  btnSolid: { backgroundColor: color.lamp, borderColor: color.lamp },
  btnQuiet: { borderColor: 'transparent', backgroundColor: 'transparent' },
  btnText: { fontFamily: font.bodyBold, fontSize: 17, color: color.ink },
  btnQuietText: { textDecorationLine: 'underline', color: color.mutedOnDusk },
  big: { minHeight: 104, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 22, paddingVertical: 18, justifyContent: 'center', gap: 4 },
  bigTitle: { fontFamily: font.display, fontSize: 27, lineHeight: 31 },
  bigSub: { fontFamily: font.body, fontSize: 20, lineHeight: 26 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: color.hairline, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: font.bodyBold, fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: color.surface, borderRadius: 999, borderWidth: 1, borderColor: color.hairline, padding: SEG_PAD, gap: SEG_GAP },
  segThumb: { position: 'absolute', top: SEG_PAD, bottom: SEG_PAD, left: SEG_PAD, borderRadius: 999, backgroundColor: color.dusk2, borderWidth: 1, borderColor: color.hairline },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segText: { fontFamily: font.bodyBold, fontSize: 15 },
});
