import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { ease } from './design/tokens';
import { useTheme } from './design/theme';
import { useSvgId } from './design/ui';

// The porch light: the one bold element in the design.
// lit = checked in today, dim = waiting, amber = check-in unresolved (calm), alert = help pressed (urgent).
export function lampState(senior) {
  if (!senior) return 'dim';
  if (senior.status === 'help') return 'alert';
  if (senior.status === 'missed') return 'amber';
  if (['ok', 'talking', 'scam', 'needs-human'].includes(senior.status)) return 'lit';
  return 'dim';
}

// glow: the halo color. hot/flame/core: the bulb from its white-hot center out. glassTop/glassBottom: the lit glass.
const PALETTE = {
  lit: { glow: '#F5A524', hot: '#FFFBEA', flame: '#FFD27A', core: '#F5A524', glassTop: '#FFF4D6', glassBottom: '#FFD98C', halo: 1 },
  dim: { glow: '#C9BBAA', hot: '#F7F1EA', flame: '#E6DCD0', core: '#CDBFAF', glassTop: '#FBF8F4', glassBottom: '#EDE5DB', halo: 0.18 },
  amber: { glow: '#E58A12', hot: '#FFF1D2', flame: '#FFC25C', core: '#E58A12', glassTop: '#FFEBC4', glassBottom: '#F8C266', halo: 0.85 },
  alert: { glow: '#E5482F', hot: '#FFF0EA', flame: '#FFA08A', core: '#E5482F', glassTop: '#FFE6DF', glassBottom: '#F7A595', halo: 1 },
};
// The lamp's metalwork: dark bronze on paper, warm brass on the night card.
const METAL = {
  day: { top: '#4A3B30', bottom: '#2A2019', edge: '#1E1915', pane: 'rgba(42,32,25,0.28)' },
  night: { top: '#E9D7BC', bottom: '#B89C77', edge: '#8F7656', pane: 'rgba(120,96,66,0.40)' },
};

// Lit glows steadily (no slow loop to stare at). Amber breathes slowly: "follow up".
// Help pulses quickly: "urgent". Reduced motion: steady glow for all.
export default function Lamp({ state = 'dim', size = 120, label, night }) {
  const { isNight } = useTheme();
  const onNight = night ?? isNight;
  const p = PALETTE[state] ?? PALETTE.dim;
  const m = onNight ? METAL.night : METAL.day;
  const reduced = useReducedMotion();
  const glow = useSharedValue(0);
  const pop = useSharedValue(1);
  const id = useSvgId('lamp');

  useEffect(() => {
    cancelAnimation(glow);
    if (reduced || state === 'lit' || state === 'dim') {
      glow.set(withTiming(p.halo, { duration: 400, easing: ease.out }));
    } else {
      const low = state === 'alert' ? 0.35 : 0.5;
      const ms = state === 'alert' ? 600 : 1500;
      glow.set(withRepeat(withSequence(
        withTiming(p.halo, { duration: ms, easing: Easing.inOut(Easing.sin) }),
        withTiming(low, { duration: ms, easing: Easing.inOut(Easing.sin) }),
      ), -1, false));
    }
    // A small "switching on" moment when the light changes state.
    if (!reduced) pop.set(withSequence(withTiming(0.96, { duration: 90, easing: ease.out }), withTiming(1, { duration: 260, easing: ease.out })));
    return () => cancelAnimation(glow);
  }, [state, reduced, p.halo, glow, pop]);

  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const lit = state !== 'dim';

  return (
    <View style={{ width: size, height: size }} accessible={!!label} accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, haloStyle]} pointerEvents="none">
        <Svg viewBox="0 0 120 120" width={size} height={size}>
          <Defs>
            <RadialGradient id={id + 'h'} cx="50%" cy="54%" r="50%">
              <Stop offset="0%" stopColor={p.glow} stopOpacity={onNight ? '0.85' : '0.7'} />
              <Stop offset="35%" stopColor={p.glow} stopOpacity={onNight ? '0.34' : '0.24'} />
              <Stop offset="70%" stopColor={p.glow} stopOpacity="0.07" />
              <Stop offset="100%" stopColor={p.glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="60" cy="64" r="58" fill={`url(#${id}h)`} />
        </Svg>
      </Animated.View>
      <Animated.View style={bodyStyle} pointerEvents="none">
        <Svg viewBox="0 0 120 120" width={size} height={size}>
          <Defs>
            <LinearGradient id={id + 'm'} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={m.top} />
              <Stop offset="1" stopColor={m.bottom} />
            </LinearGradient>
            <LinearGradient id={id + 'g'} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.glassTop} />
              <Stop offset="1" stopColor={p.glassBottom} />
            </LinearGradient>
            <RadialGradient id={id + 'f'} cx="50%" cy="58%" r="55%">
              <Stop offset="0%" stopColor={p.hot} />
              <Stop offset="45%" stopColor={p.flame} />
              <Stop offset="100%" stopColor={p.core} stopOpacity={lit ? '0.9' : '0.6'} />
            </RadialGradient>
          </Defs>
          {/* Hanger and finial */}
          <Path d="M60 13 V27" stroke={m.top} strokeWidth="4" strokeLinecap="round" />
          <Circle cx="60" cy="12" r="3.4" fill={m.top} />
          {/* Roof */}
          <Path d="M60 26 L82 35.5 Q84 36.6 82.4 38.2 L79 41 H41 L37.6 38.2 Q36 36.6 38 35.5 Z" fill={`url(#${id}m)`} />
          {/* Glass */}
          <Path d="M43.5 41 H76.5 L72.8 83 Q60 89 47.2 83 Z" fill={`url(#${id}g)`} stroke={m.edge} strokeOpacity={onNight ? 0.55 : 0.85} strokeWidth="2.4" strokeLinejoin="round" />
          {/* Panes */}
          <Path d="M54 41.5 L52.6 85.4 M66 41.5 L67.4 85.4" stroke={m.pane} strokeWidth="1.4" />
          {/* Bulb */}
          <G>
            {lit ? <Ellipse cx="60" cy="63" rx="13" ry="17" fill={p.flame} opacity="0.45" /> : null}
            <Path d="M60 49.5 C65.8 55.5 68 60.5 68 66 C68 71.6 64.4 75.5 60 75.5 C55.6 75.5 52 71.6 52 66 C52 60.5 54.2 55.5 60 49.5 Z" fill={`url(#${id}f)`} />
          </G>
          {/* Sheen on the glass */}
          <Path d="M47.6 45.5 L46.3 76" stroke="#FFFFFF" strokeOpacity={lit ? 0.55 : 0.8} strokeWidth="2" strokeLinecap="round" />
          {/* Base */}
          <Path d="M45.5 87.5 H74.5" stroke={m.top} strokeWidth="4.6" strokeLinecap="round" />
          <Path d="M53 92.5 H67" stroke={m.bottom} strokeWidth="3" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}
