import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PEOPLE } from './AppContext';
import Lamp from './Lamp';
import { BigButton, Button, T } from './design/ui';
import { ThemeProvider } from './design/theme';
import { seniorPalette } from './design/tokens';

export default function StartScreen({ onPick }) {
  const [family, setFamily] = useState(false);
  const insets = useSafeAreaInsets();
  return <ThemeProvider value="senior"><ScrollView style={{ backgroundColor: seniorPalette.bg }} contentContainerStyle={[st.page, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}>
    <View style={st.brand}><Lamp state="lit" size={72} /><T v="readHeadline">Porchlight</T></View>
    {family ? <>
      <T v="readTitle">Who’s checking in?</T>
      <T v="read" muted>Choose your sample profile. Each person sees the details shared with them.</T>
      {PEOPLE.filter((p) => p.id === 'family').map((p) => <BigButton key={p.who} title={p.title} sub={p.sub} icon="person.fill" onPress={() => onPick(p)} />)}
      <Button label="Back" onPress={() => setFamily(false)} />
    </> : <>
      <T v="readTitle">A little closer,{ '\n' }every day.</T>
      <T v="read" muted>A daily AI check-in, with the people who care about you close at hand.</T>
      <View style={st.choices}>
        <BigButton tone="lamp" title="I’m Peggy" sub="My day, my plans, my family" icon="house" onPress={() => onPick(PEOPLE[0])} />
        <BigButton title="I’m family" sub="Stay in the loop. Lend a hand." icon="person.2" onPress={() => setFamily(true)} />
      </View>
      <T v="readSmall" muted>Sample experience. All people and organizations shown are fictional.</T>
      <Button label="Volunteer desk" variant="ghost" onPress={() => onPick(PEOPLE.find((p) => p.id === 'desk'))} />
    </>}
  </ScrollView></ThemeProvider>;
}
const st = StyleSheet.create({ page: { paddingHorizontal: 24, gap: 24, width: '100%', maxWidth: 620, alignSelf: 'center', flexGrow: 1 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: -14, marginBottom: 20 }, choices: { gap: 16, marginVertical: 8 } });
