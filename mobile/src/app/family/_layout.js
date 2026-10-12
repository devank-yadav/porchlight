import { DataGate } from '../../../App';
import { FamilyEffects } from '../../FamilyScreen';
import AppTabs from '../../design/AppTabs';
export default function FamilyLayout() { return <DataGate role="family">{() => <><FamilyEffects /><AppTabs /></>}</DataGate>; }
