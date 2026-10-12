import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { haptic } from './haptics';
import { TabBarContext } from './ui';
import { font, light, seniorPalette, shadow } from './tokens';

const SENIOR_ITEMS = [['today', 'Today', 'house'], ['plans', 'My plans', 'calendar'], ['family', 'Family', 'person.2']];
const FAMILY_ITEMS = [['today', 'Today', 'house'], ['plans', 'Plans', 'calendar'], ['family', 'Family', 'person.2'], ['settings', 'Settings', 'slider.horizontal.3']];
const FILLS = new Set(['house', 'person.2']);

// A floating, blurred pill tab bar. Screens scroll underneath it; Screen (design/ui) adds the clearance.
export default function AppTabs({ senior = false }) {
  const palette = senior ? seniorPalette : light;
  const items = senior ? SENIOR_ITEMS : FAMILY_ITEMS;
  return (
    <TabBarContext.Provider value={senior ? 'senior' : 'family'}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} senior={senior} items={items} />}
        // freezeOnBlur: tabs out of sight don't re-render on every update (native only).
        screenOptions={{ headerShown: false, animation: 'none', freezeOnBlur: true, sceneStyle: { backgroundColor: palette.bg } }}
      >
        {items.map(([name, title]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarAccessibilityLabel: title }} />)}
      </Tabs>
    </TabBarContext.Provider>
  );
}

function FloatingTabBar({ state, navigation, descriptors, senior, items }) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
  if (keyboard) return null;
  const palette = senior ? seniorPalette : light;
  const height = senior ? 80 : 64;
  return (
    <View pointerEvents="box-none" style={[st.wrap, { bottom: Math.max(insets.bottom - 10, 14) }]}>
      {/* Opaque on purpose: a see-through bar with a shadow (and a live blur inside) makes iPhone redraw it
          offscreen on every frame of scrolling. A solid bar gets a cheap, precomputed shadow. */}
      <View style={[st.bar, { height, borderRadius: senior ? 30 : 28, backgroundColor: palette.surface2 }, shadow.float]}>
        <View style={st.row} accessibilityRole="tablist">
          {items.map(([name, title, icon]) => {
            const route = state.routes.find((r) => r.name === name);
            if (!route) return null;
            const focused = state.routes[state.index]?.key === route.key;
            const label = descriptors[route.key]?.options?.tabBarAccessibilityLabel ?? title;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) { haptic.select(); navigation.navigate(route.name, route.params); }
            };
            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
            return (
              <Pressable
                key={name}
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                style={st.item}
              >
                <View style={[st.pill, focused && { backgroundColor: 'rgba(30,25,21,0.07)' }, { borderRadius: senior ? 24 : 22 }]}>
                  <Icon name={focused && FILLS.has(icon) ? icon + '.fill' : icon} size={senior ? 26 : 22} color={focused ? palette.ink : palette.muted} weight={focused ? 'semibold' : 'medium'} />
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={[st.label, { color: focused ? palette.ink : palette.muted }, senior && st.seniorLabel]}
                  >
                    {title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// The bar steps aside while the keyboard is up (iOS dictation and typing).
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return shown;
}

const st = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  bar: { width: '100%', maxWidth: 560, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(30,25,21,0.10)' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'stretch', padding: 6, gap: 2 },
  item: { flex: 1 },
  pill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 4 },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0 },
  seniorLabel: { fontFamily: font.readBold, fontWeight: 'normal', fontSize: 18, lineHeight: 22, letterSpacing: -0.1 },
});
