import { DataGate } from '../../../../App';
import AppTabs from '../../../design/AppTabs';
export default function FamilyLayout() { return <DataGate>{() => <AppTabs />}</DataGate>; }
