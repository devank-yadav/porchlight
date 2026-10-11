import FamilyScreen from './FamilyScreen';
import { useAppContext } from './AppContext';
export default function FamilyRoute({ page }) {
  const { state, role } = useAppContext();
  if (!state || role?.id !== 'family') return null;
  return <FamilyScreen senior={state.seniors.find((s) => s._id === 'peggy')} me={role.who} page={page} />;
}
