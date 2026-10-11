import { StyleSheet, Text, View } from 'react-native';
import { api, API_BASE } from './api';
import { PEOPLE } from './AppContext';
import { sheet } from './design/Sheet';
import { Press, T } from './design/ui';
import { useTheme } from './design/theme';
import Icon from './design/Icon';
import { accent } from './design/tokens';

// A row in a sheet menu: icon tile, title, optional detail, optional check.
export function MenuRow({ icon, title, sub, onPress, tone, checked, hint }) {
  const { c, isDark } = useTheme();
  const fg = tone === 'red' ? accent.red : c.ink;
  return (
    <Press onPress={onPress} accessibilityLabel={sub ? `${title}. ${sub}` : title} accessibilityHint={hint} accessibilityState={{ selected: !!checked }} scaleTo={0.98} style={st.row}>
      <View style={[st.tile, { backgroundColor: tone === 'red' ? accent.redSoft : tone === 'lamp' ? accent.lampSoft : isDark ? c.raised : c.sunken }]}>
        <Icon name={icon} size={17} color={tone === 'red' ? accent.red : tone === 'lamp' ? accent.lampText : c.ink} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[st.title, { color: fg }]}>{title}</Text>
        {sub ? <Text style={[st.sub, { color: c.muted }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {checked ? <Icon name="checkmark" size={16} color={c.ink} weight="bold" /> : null}
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
          title={p.id === 'desk' ? `${p.title}, volunteer desk` : p.title}
          sub={p.sub}
          checked={role?.who === p.who}
          tone={p.id === 'senior' ? 'lamp' : undefined}
          onPress={() => { close(); if (role?.who !== p.who) setTimeout(() => setRole(p), 120); }}
        />
      ))}
      <MenuRow icon="arrow.uturn.backward" title="Back to the start screen" onPress={() => { close(); setTimeout(() => setRole(null), 120); }} />
    </View>
  ), { theme: role?.id === 'senior' ? 'dark' : 'light' });
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
      <MenuRow icon="arrow.counterclockwise" tone="red" title="Reset demo data" sub="Back to the start of the story" onPress={go(() => api.reset(), 'Demo data reset')} />
    </View>
  ), { theme: role?.id === 'senior' ? 'dark' : 'light' });
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, minHeight: 56 },
  tile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  sub: { fontSize: 14, lineHeight: 19 },
});
