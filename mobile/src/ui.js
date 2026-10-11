import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { color, font, radius } from './theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

export function H1({ children, style, onDusk }) {
  return <Text accessibilityRole="header" style={[s.h1, onDusk && { color: '#fff' }, style]}>{children}</Text>;
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

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

// Regular button. variant: 'outline' | 'solid' | 'quiet' | 'light'
export function Button({ label, onPress, variant = 'outline', disabled, style, small, onDusk }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={(e) => { tap(); onPress?.(e); }}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        variant === 'solid' && s.btnSolid,
        variant === 'quiet' && s.btnQuiet,
        variant === 'light' && s.btnLight,
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      <Text style={[s.btnText, small && { fontSize: 15 }, variant === 'solid' && { color: '#fff' }, variant === 'quiet' && s.btnQuietText, variant === 'light' && { color: color.dusk }, onDusk && variant === 'quiet' && { color: '#DFE5F3', fontSize: 19 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// The senior's giant buttons. tone: 'lamp' | 'plain' | 'help'
export function BigButton({ title, sub, onPress, tone = 'plain', disabled, style }) {
  const bg = tone === 'lamp' ? color.lamp : tone === 'help' ? color.brick : '#fff';
  const fg = tone === 'lamp' ? color.lampInk : tone === 'help' ? '#fff' : color.dusk;
  const subFg = tone === 'lamp' ? '#4A3300' : tone === 'help' ? '#FFE4DD' : color.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${title}. ${sub}` : title}
      disabled={disabled}
      onPress={(e) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onPress?.(e); }}
      style={({ pressed }) => [s.big, { backgroundColor: bg }, disabled && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }, style]}
    >
      <Text style={[s.bigTitle, { color: fg }]}>{title}</Text>
      {sub ? <Text style={[s.bigSub, { color: subFg }]}>{sub}</Text> : null}
    </Pressable>
  );
}

// Small status pill. tone: 'urgent' | 'attention' | 'ok' | 'neutral'
const CHIP_TONE = {
  urgent: [color.brickSoft, color.brick],
  attention: [color.lampSoft, '#6A4300'],
  ok: [color.sageSoft, color.sage],
  neutral: [color.sky, color.dusk],
};
export function Chip({ label, tone = 'neutral', style }) {
  const [bg, fg] = CHIP_TONE[tone] ?? CHIP_TONE.neutral;
  return (
    <View style={[s.chip, { backgroundColor: bg }, style]}>
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Segmented({ options, value, onChange, dark }) {
  return (
    <View style={[s.seg, dark && { backgroundColor: color.dusk2 }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => { tap(); onChange(o.id); }}
            style={[s.segBtn, on && { backgroundColor: dark ? '#fff' : color.dusk }]}
          >
            <Text style={[s.segText, { color: on ? (dark ? color.dusk : '#fff') : dark ? '#D9E0F0' : color.dusk }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  h1: { fontFamily: font.display, fontSize: 32, lineHeight: 36, color: color.dusk, letterSpacing: -0.3 },
  h2: { fontFamily: font.displaySemi, fontSize: 20, lineHeight: 24, color: color.dusk },
  p: { fontFamily: font.body, fontSize: 17, lineHeight: 25, color: color.ink },
  meta: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: color.muted },
  card: { backgroundColor: color.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: color.line, padding: 18, gap: 12 },
  btn: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1.5, borderColor: color.dusk, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 6 },
  btnSolid: { backgroundColor: color.dusk },
  btnQuiet: { borderColor: 'transparent', backgroundColor: 'transparent' },
  btnLight: { borderColor: '#fff', backgroundColor: '#fff' },
  btnText: { fontFamily: font.bodyBold, fontSize: 17, color: color.dusk },
  btnQuietText: { textDecorationLine: 'underline' },
  big: { minHeight: 104, borderRadius: radius.lg, paddingHorizontal: 22, paddingVertical: 18, justifyContent: 'center', gap: 4 },
  bigTitle: { fontFamily: font.display, fontSize: 27, lineHeight: 31 },
  bigSub: { fontFamily: font.body, fontSize: 18, lineHeight: 24 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: font.bodyBold, fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: '#DDE4F1', borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segText: { fontFamily: font.bodyBold, fontSize: 15 },
});
