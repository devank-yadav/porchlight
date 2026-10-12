import FamilyScreen from './FamilyScreen';
import { useAppContext } from './AppContext';
export default function FamilyRoute({ page }) {
  const { state, role } = useAppContext();
  if (!state?.seniors?.[0] || role?.id !== 'family') return null;
  return <FamilyScreen senior={state.seniors[0]} me={role.who} page={page} />;
}
