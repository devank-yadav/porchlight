import { useEffect, useRef } from 'react';
import { Animated, Easing, View, AccessibilityInfo } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

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
  lit: { core: '#F5A524', flame: '#FFD27A', glass: '#FFF6E0', metal: '#8C98B4', halo: 0.9 },
  dim: { core: '#6B7792', flame: '#AAB4C8', glass: '#D9DFEA', metal: '#6B7792', halo: 0.18 },
  amber: { core: '#D98A1E', flame: '#F2C46B', glass: '#FBEFD9', metal: '#B07A2A', halo: 0.6 },
  alert: { core: '#E0573A', flame: '#F08A6E', glass: '#FDE9E4', metal: '#C2614B', halo: 1 },
};

export default function Lamp({ state = 'dim', size = 120, label }) {
  const p = PALETTE[state];
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || state === 'dim') return pulse.setValue(1);
      // Help pulses fast; an unresolved check-in breathes slowly so it reads as "follow up", not "emergency".
      const low = state === 'alert' ? 0.3 : state === 'amber' ? 0.55 : 0.8;
      const ms = state === 'alert' ? 700 : state === 'amber' ? 1600 : 2000;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: low, duration: ms, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [state, pulse]);

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, opacity: Animated.multiply(pulse, p.halo) }}>
        <Svg viewBox="0 0 120 120" width={size} height={size}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={p.core} stopOpacity="1" />
              <Stop offset="40%" stopColor={p.core} stopOpacity="0.28" />
              <Stop offset="100%" stopColor={p.core} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="60" cy="60" r="60" fill="url(#glow)" />
        </Svg>
      </Animated.View>
      <Svg viewBox="0 0 120 120" width={size} height={size}>
        <Path d="M60 10 V28" stroke={p.metal} strokeWidth="5" strokeLinecap="round" />
        <Path d="M40 30 H80 L74 40 H46 Z" fill={p.metal} />
        <Path d="M46 40 H74 L70 84 Q60 90 50 84 Z" fill={p.glass} stroke={p.metal} strokeWidth="3" />
        <Path d="M52 52 Q60 47 68 52 L66 78 Q60 82 54 78 Z" fill={p.flame} />
        <Path d="M48 86 H72" stroke={p.metal} strokeWidth="5" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
