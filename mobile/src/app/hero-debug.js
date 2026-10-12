// TEMPORARY: iPhone simulator probe for the empty hero card. Remove before merging.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { HeroCard, T } from '../design/ui';
import Lamp from '../Lamp';
import { night } from '../design/tokens';

const log = (name) => (e) => console.log('[hero-debug]', name, JSON.stringify(e.nativeEvent.layout));

function Probe({ name, children }) {
  return <View style={st.cell}>
    <Text style={st.label}>{name}</Text>
    <View style={st.box} onLayout={log(name + ' box')}>{children}</View>
  </View>;
}

export default function HeroDebug() {
  return <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={st.grid}>
    <Probe name="A hero+glow"><HeroCard onLayout={log('A card')}><T onLayout={log('A text')}>A text</T></HeroCard></Probe>
    <Probe name="B hero no glow"><HeroCard glow={false} onLayout={log('B card')}><T onLayout={log('B text')}>B text</T></HeroCard></Probe>
    <Probe name="C plain dark"><View style={st.dark} onLayout={log('C card')}><Text style={{ color: '#fff' }}>C text</Text></View></Probe>
    <Probe name="D dark+abs svg"><View style={st.dark} onLayout={log('D card')}><View style={StyleSheet.absoluteFill}><Svg width="100%" height="100%"><Rect x="0" y="0" width="100%" height="100%" fill="rgba(255,180,0,0.3)" /></Svg></View><Text style={{ color: '#fff' }} onLayout={log('D text')}>D text</Text></View></Probe>
    <Probe name="E hero+lamp"><HeroCard onLayout={log('E card')}><Lamp state="lit" size={40} /><T onLayout={log('E text')}>E text</T></HeroCard></Probe>
    <Probe name="F no glow+lamp"><HeroCard glow={false} onLayout={log('F card')}><Lamp state="lit" size={40} /><T onLayout={log('F text')}>F text</T></HeroCard></Probe>
    <Probe name="G plain text in T"><T onLayout={log('G text')}>G text, light theme</T></Probe>
    <Probe name="H lamp on white"><Lamp state="lit" size={60} /></Probe>
  </ScrollView>;
}

const st = StyleSheet.create({
  grid: { paddingTop: 70, paddingHorizontal: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '47%', gap: 2 },
  label: { fontSize: 12, color: '#000' },
  box: { height: 150, overflow: 'hidden', borderWidth: 1, borderColor: '#f0f' },
  dark: { backgroundColor: night.bg, padding: 22, borderRadius: 28 },
});
