import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Press, T } from './design/ui';
import { useTheme } from './design/theme';
import Icon from './design/Icon';
import { accent, font } from './design/tokens';

// A row in a sheet menu: icon tile, title, optional detail, optional check.
export function MenuRow({ icon, avatar, title, sub, onPress, tone, checked, hint }) {
  const { c, isDark, isSenior } = useTheme();
  const fg = tone === 'red' ? (isDark ? '#FFAB9C' : accent.redText) : c.ink;
  return (
    <Press onPress={onPress} accessibilityLabel={sub ? `${title}. ${sub}` : title} accessibilityHint={hint} accessibilityState={{ selected: !!checked }} scaleTo={0.98} style={st.row}>
      {avatar ? <Avatar name={avatar} size={40} tone={tone === 'lamp' ? 'lamp' : undefined} /> : <View style={[st.tile, { backgroundColor: tone === 'red' ? (isDark ? 'rgba(240,100,80,0.18)' : accent.redSoft) : tone === 'lamp' ? (isDark ? 'rgba(245,165,36,0.18)' : accent.lampSoft) : isDark ? c.raised : c.sunken }]}>
        <Icon name={icon} size={18} color={tone === 'red' ? (isDark ? '#FFAB9C' : accent.red) : tone === 'lamp' ? (isDark ? '#FFC566' : accent.lampText) : c.ink} />
      </View>}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[st.title, { color: fg }, isSenior && st.titleSenior]}>{title}</Text>
        {sub ? <Text style={[st.sub, { color: c.muted }, isSenior && st.subSenior]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {checked ? <View style={st.check}><Icon name="checkmark" size={13} color={accent.lampInk} weight="bold" /></View> : null}
    </Press>
  );
}

export function SheetTitle({ title, sub }) {
  return (
    <View style={{ gap: 4, marginBottom: 10 }}>
      <T v="title">{title}</T>
      {sub ? <T v="callout" muted>{sub}</T> : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, minHeight: 60 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  sub: { fontSize: 14, lineHeight: 19 },
  titleSenior: { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 21, lineHeight: 26, letterSpacing: 0 },
  subSenior: { fontFamily: font.read, fontSize: 20, lineHeight: 25 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: accent.lamp, alignItems: 'center', justifyContent: 'center' },
});
