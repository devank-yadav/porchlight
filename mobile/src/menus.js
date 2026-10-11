import { StyleSheet, Text, View } from 'react-native';
import { api, API_BASE } from './api';
import { syncCalendarNow } from './calendar';
import { PEOPLE } from './AppContext';
import { sheet } from './design/Sheet';
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

// Switch who is using this phone, without going back through the start screen.
export function openRoleSheet({ role, setRole }) {
  sheet.open((close) => (
    <View style={{ gap: 4 }}>
      <SheetTitle title="Who’s using this phone?" sub="Each person sees what they need." />
      {PEOPLE.map((p) => (
        <MenuRow
          key={p.who}
          icon={p.icon}
          avatar={p.id === 'desk' ? undefined : p.title}
          title={p.id === 'desk' ? `${p.title}, volunteer desk` : p.title}
          sub={p.sub}
          checked={role?.who === p.who}
          tone={p.id === 'senior' ? 'lamp' : undefined}
          onPress={() => { close(); if (role?.who !== p.who) setTimeout(() => setRole(p), 120); }}
        />
      ))}
      <MenuRow icon="arrow.uturn.backward" title="Back to the start screen" onPress={() => { close(); setTimeout(() => setRole(null), 120); }} />
    </View>
  ), { theme: role?.id === 'senior' ? 'senior' : 'light' });
}

// Demo controls for presenting. Reached from the ••• button, or a long press on the Porchlight name.
export function openDemoMenu({ state, run, role }) {
  const cfg = state?.config;
  const status = cfg
    ? `AI: ${cfg.llm ? 'live model' : 'demo mode'} · Texts: ${cfg.twilio ? 'Twilio' : 'logged only'} · Data: ${cfg.mongo ? 'MongoDB' : 'in memory'}`
    : `Server: ${API_BASE}`;
  const go = (fn, msg) => () => { sheet.close(); run(fn, msg)(); };
  sheet.open(() => (
    <View style={{ gap: 4 }}>
      <SheetTitle title="Demo controls" sub={status} />
      <MenuRow icon="play.fill" tone="lamp" title="Play the demo call" sub="A scam call, no ride to the doctor, out of milk" onPress={go(() => api.demoCall('peggy'), ['Demo call finished', 'Peggy’s family can see what came up.'])} />
      <MenuRow icon="hand.raised.fill" title="Peggy presses Help" sub="Texts family, then the neighbor" onPress={go(() => api.help('peggy'), 'Help alert sent')} />
      <MenuRow icon="clock.badge.exclamationmark" title="Simulate a missed check-in" sub="Starts the follow-up ladder" onPress={go(() => api.missed('peggy'), 'Missed check-in started')} />
      {cfg?.twilio ? (
        <MenuRow icon="phone.fill" title="Call Peggy’s phone now" sub="A real call through Twilio" onPress={go(() => api.phoneCall('peggy'), ['Calling Peggy', 'Her phone is ringing now.'])} />
      ) : null}
      {role?.id === 'senior' ? (
        <MenuRow icon="calendar" title="Sync this phone’s calendar" sub="Her events in, Porchlight’s rides and reminders out" onPress={go(() => syncCalendarNow(state?.seniors?.find((s) => s._id === 'peggy'), state), 'Calendar synced')} />
      ) : null}
      <MenuRow icon="arrow.counterclockwise" tone="red" title="Reset demo data" sub="Back to the start of the story" onPress={go(() => api.reset(), 'Demo data reset')} />
    </View>
  ), { theme: role?.id === 'senior' ? 'dark' : 'light' });
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
