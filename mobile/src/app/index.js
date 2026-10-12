import { Redirect } from 'expo-router';
import Onboarding from '../Onboarding';
import { useAppContext } from '../AppContext';

// Signed in and set up → straight into the app for this phone's role. Otherwise, setup.
export default function Start() {
  const { account } = useAppContext();
  if (account.session && account.me?.setupDone) return <Redirect href={account.session.role === 'senior' ? '/senior/today' : '/family/today'} />;
  return <Onboarding />;
}
