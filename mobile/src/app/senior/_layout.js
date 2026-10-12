import { Stack } from 'expo-router';
import { DataGate } from '../../../App';
import { SeniorEffects } from '../../SeniorScreen';
export default function SeniorLayout() {
  return <DataGate role="senior">{() => <>
    <SeniorEffects />
    <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
  </>}</DataGate>;
}
