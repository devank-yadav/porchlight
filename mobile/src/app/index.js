import StartScreen from '../StartScreen';
import { useAppContext } from '../AppContext';
export default function Start() { const { setRole } = useAppContext(); return <StartScreen onPick={setRole} />; }
