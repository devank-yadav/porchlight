// Where the phone is, for "I need help" only. Asked once on the older adult's side; never asked in the
// middle of an emergency, and the alert goes out without it when location is off.
import { Platform } from 'react-native';
import * as Location from 'expo-location';

const timeout = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

export async function askForLocation() {
  if (Platform.OS === 'web') return;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'undetermined') await Location.requestForegroundPermissionsAsync();
  } catch { /* the help alert still works without it */ }
}

// { lat, lng, accuracy, address } or null. Waits at most a few seconds.
export async function hereNow() {
  if (Platform.OS === 'web') return null;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const fix = (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout(4000, null)]))
      || (await Location.getLastKnownPositionAsync());
    if (!fix) return null;
    const { latitude: lat, longitude: lng, accuracy } = fix.coords;
    let address = '';
    try {
      const [p] = (await Promise.race([Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }), timeout(1500, [])])) || [];
      if (p) address = [p.streetNumber && p.street ? `${p.streetNumber} ${p.street}` : p.name, p.city].filter(Boolean).join(', ');
    } catch { /* the map link is enough */ }
    return { lat, lng, accuracy: accuracy ?? null, address };
  } catch {
    return null;
  }
}
