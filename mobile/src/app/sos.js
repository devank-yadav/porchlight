import { Linking, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAppContext } from '../AppContext';
import { ThemeProvider } from '../design/theme';
import { Button, T } from '../design/ui';
import { seniorPalette as P } from '../design/tokens';

// porchlight://sos, from the SOS widget on the home or lock screen. On the older adult's phone it opens
// the SOS screen; anywhere else it opens the app as usual. If Porchlight can't be reached, 911 is still one tap.
export default function Sos() {
  const { account } = useAppContext();
  if (!account.booted) return null;
  const senior = account.session?.role === 'senior';
  if (senior && account.me?.setupDone) return <Redirect href="/senior/sos" />;
  if (!senior || account.me) return <Redirect href="/" />;
  return <ThemeProvider value="senior">
    <View style={{ flex: 1, justifyContent: 'center', gap: 18, padding: 24, backgroundColor: P.bg }}>
      <T v="readTitle" center>We can’t reach Porchlight</T>
      <T v="read" muted center>Your family can’t be alerted from here right now. If you need help, call 911.</T>
      <Button variant="danger" icon="phone.fill" label="Call 911" onPress={() => Linking.openURL('tel:911')} />
      <Button variant="secondary" icon="arrow.clockwise" label="Try again" onPress={() => account.loadMe()} />
    </View>
  </ThemeProvider>;
}
