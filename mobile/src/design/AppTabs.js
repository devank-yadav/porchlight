import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import Icon from './Icon';
import { font, light, seniorPalette } from './tokens';

export default function AppTabs({ senior = false }) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const palette = senior ? seniorPalette : light;
  const items = senior ? [['today', 'Today', 'house'], ['plans', 'My plans', 'calendar'], ['family', 'Family', 'person.2']] : [['today', 'Today', 'house'], ['plans', 'Plans', 'calendar'], ['family', 'Family', 'person.2'], ['settings', 'Settings', 'slider.horizontal.3']];
  return <Tabs screenOptions={{
    headerShown: false, animation: 'none', tabBarHideOnKeyboard: true,
    sceneStyle: { backgroundColor: palette.bg },
    tabBarActiveTintColor: palette.ink, tabBarInactiveTintColor: palette.muted,
    tabBarActiveBackgroundColor: palette.sunken, tabBarLabelPosition: 'below-icon',
    tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.line, elevation: 0, height: (senior ? 104 : 76) + insets.bottom + Math.max(0, fontScale - 1) * 32, paddingTop: 4, paddingBottom: Math.max(4, insets.bottom) },
    tabBarItemStyle: { paddingVertical: 0 },
    tabBarLabelStyle: { fontFamily: senior ? font.readBold : undefined, fontSize: senior ? 20 : 12, lineHeight: senior ? 26 : 16, flexShrink: 0, fontWeight: '600', marginTop: 4 },
  }}>
    {items.map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarAccessibilityLabel: title, tabBarIcon: ({ color, focused }) => <Icon name={focused && icon !== 'calendar' && icon !== 'slider.horizontal.3' ? icon + '.fill' : icon} size={senior ? 25 : 22} color={color} /> }} />)}
  </Tabs>;
}
