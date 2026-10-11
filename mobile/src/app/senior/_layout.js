import { Stack } from 'expo-router';
import { DataGate } from '../../../App';
export default function SeniorLayout() { return <DataGate>{() => <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />}</DataGate>; }
