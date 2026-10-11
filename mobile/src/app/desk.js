import { DataGate } from '../../App';
import DeskScreen from '../DeskScreen';
export default function Desk() { return <DataGate>{() => <DeskScreen />}</DataGate>; }
