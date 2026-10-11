import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { ease } from './design/tokens';

// The porch light: the one bold element in the design.
// lit = checked in today, dim = waiting, amber = check-in unresolved (calm), alert = help pressed (urgent).
export function lampState(senior) {
  if (!senior) return 'dim';
  if (senior.status === 'help') return 'alert';
  if (senior.status === 'missed') return 'amber';
  if (['ok', 'talking', 'scam', 'needs-human'].includes(senior.status)) return 'lit';
  return 'dim';
}

const PALETTE = {
  lit: { core: '#F5A524', flame: '#FFD27A', glass: '#FFF7E6', metal: '#3F3F46', halo: 1 },
  dim: { core: '#A1A1AA', flame: '#D4D4D8', glass: '#F4F4F5', metal: '#71717A', halo: 0.25 },
  amber: { core: '#E08E1B', flame: '#F5C66B', glass: '#FDF0D8', metal: '#6B4A12', halo: 0.75 },
  alert: { core: '#E5482F', flame: '#F59A85', glass: '#FDE9E4', metal: '#6B2A1D', halo: 1 },
};

// Lit glows steadily (no slow loop to stare at). Amber breathes slowly: "follow up".
// Help pulses quickly: "urgent". Reduced motion: steady glow for all.
export default function Lamp({ state = 'dim', size = 120, label }) {
  const p = PALETTE[state] ?? PALETTE.dim;
  const reduced = useReducedMotion();
  const glow = useSharedValue(0);
  const pop = useSharedValue(1);

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

  return (
    <View style={{ width: size, height: size }} accessible={!!label} accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size }, haloStyle]}>
        <Svg viewBox="0 0 120 120" width={size} height={size}>
          <Defs>
            <RadialGradient id={`glow-${state}`} cx="50%" cy="58%" r="50%">
              <Stop offset="0%" stopColor={p.core} stopOpacity="0.95" />
              <Stop offset="40%" stopColor={p.core} stopOpacity="0.32" />
              <Stop offset="100%" stopColor={p.core} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="60" cy="61" r="58" fill={`url(#glow-${state})`} />
        </Svg>
      </Animated.View>
      <Animated.View style={bodyStyle}>
        <Svg viewBox="0 0 120 120" width={size} height={size}>
          <Path d="M60 12 V28" stroke={p.metal} strokeWidth="4.5" strokeLinecap="round" />
          <Path d="M42 30 H78 Q80 30 79 32 L74 40 H46 L41 32 Q40 30 42 30 Z" fill={p.metal} />
          <Path d="M46 40 H74 L70.5 82 Q60 88 49.5 82 Z" fill={p.glass} stroke={p.metal} strokeWidth="3" strokeLinejoin="round" />
          <Path d="M53 54 Q60 46 67 54 L65.5 76 Q60 80 54.5 76 Z" fill={p.flame} />
          <Path d="M49 87 H71" stroke={p.metal} strokeWidth="4.5" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}
