import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// This phone's sign-in: { token, role }. One account per phone, and its role ('senior' or 'family')
// never changes; signing out clears it and the phone starts setup again.
// Kept in the iOS Keychain (expo-secure-store); the web preview uses localStorage.
const KEY = 'porchlight.session';

const web = Platform.OS === 'web';
async function read() {
  try {
    const raw = web ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let current = null;
export const sessionToken = () => current?.token || null;

export async function loadSession() {
  current = await read();
  return current;
}

export async function saveSession(session) {
  current = session;
  const raw = JSON.stringify(session);
  if (web) globalThis.localStorage?.setItem(KEY, raw);
  else await SecureStore.setItemAsync(KEY, raw, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
}

export async function clearSession() {
  current = null;
  if (web) globalThis.localStorage?.removeItem(KEY);
  else await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

// The app shell sets this: a 401 from the server signs this phone out.
let onExpired = () => {};
export const setOnExpired = (fn) => { onExpired = fn; };
export const sessionExpired = () => onExpired();
