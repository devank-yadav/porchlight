import { Platform, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

// SF Symbols on iOS (the app's target). Elsewhere a quiet placeholder keeps the layout.
export default function Icon({ name, size = 20, color = '#111', weight = 'semibold', style }) {
  const fallback = <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.25 }, style]} />;
  if (Platform.OS !== 'ios') return fallback;
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      fallback={fallback}
      style={[{ width: size, height: size }, style]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
