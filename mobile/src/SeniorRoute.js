import SeniorScreen from './SeniorScreen';
import { useAppContext } from './AppContext';
export default function SeniorRoute({ page = 'today' }) {
  const { state } = useAppContext();
  if (!state?.seniors?.[0]) return null;
  return <SeniorScreen senior={state.seniors[0]} page={page} />;
}
