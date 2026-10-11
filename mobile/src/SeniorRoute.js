import SeniorScreen from './SeniorScreen';
import { useAppContext } from './AppContext';
export default function SeniorRoute({ page = 'today' }) {
  const { state } = useAppContext();
  if (!state) return null;
  return <SeniorScreen senior={state.seniors.find((s) => s._id === 'peggy')} page={page} />;
}
