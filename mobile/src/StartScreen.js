import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PEOPLE } from './AppContext';
import Lamp from './Lamp';
import { Appear, BigButton, Chip, HeroCard, ListGroup, ListRow, Press, T } from './design/ui';
import { ThemeProvider } from './design/theme';
import Icon from './design/Icon';
import { accent, font, seniorPalette } from './design/tokens';

// "Who is this phone for?" The porch light at dusk, then two doors.
export default function StartScreen({ onPick }) {
  const [family, setFamily] = useState(false);
  const insets = useSafeAreaInsets();
  return <ThemeProvider value="senior"><ScrollView style={{ flex: 1, backgroundColor: seniorPalette.bg }} contentContainerStyle={[st.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
    {family ? <>
      <Press onPress={() => setFamily(false)} accessibilityLabel="Back" style={st.back} scaleTo={0.96}>
        <Icon name="chevron.left" size={20} color={seniorPalette.ink} weight="bold" />
        <Text style={st.backText}>Back</Text>
      </Press>
      <View style={{ gap: 10 }}>
        <T v="readTitle">Who’s checking in?</T>
        <T v="read" muted>Choose your sample profile. Each person sees what’s shared with them.</T>
      </View>
      <ListGroup>
        {PEOPLE.filter((p) => p.id === 'family').map((p) => <ListRow key={p.who} avatar={p.title} title={p.title} sub={p.sub} onPress={() => onPick(p)} />)}
      </ListGroup>
    </> : <>
      <Appear on>
        <HeroCard glowAt="center" style={st.hero}>
          <Chip label="Sample" tone="night" style={st.sample} />
          <View style={st.lamp}><Lamp state="lit" size={112} /></View>
          <View style={st.heroText}>
            <Text style={st.wordmark} accessibilityRole="header">Porchlight</Text>
            <T v="readTitle" center>A little closer,{'\n'}every day.</T>
            <T v="readSmall" muted center style={{ maxWidth: 280 }}>A daily AI check-in, with family close at hand.</T>
          </View>
        </HeroCard>
      </Appear>
      <Appear on index={2} style={st.doors}>
        <T v="readHeadline" style={{ paddingHorizontal: 2 }}>Who is this phone for?</T>
        <BigButton tone="lamp" title="I’m Peggy" sub="My day, my family" icon="house.fill" chevron onPress={() => onPick(PEOPLE[0])} />
        <BigButton title="I’m family" sub="Stay in the loop" icon="person.2.fill" chevron onPress={() => setFamily(true)} />
      </Appear>
      <Appear on index={4} style={{ gap: 12, alignItems: 'center' }}>
        <T v="readSmall" muted center style={{ paddingHorizontal: 12 }}>Sample experience. All people and organizations shown are fictional.</T>
      </Appear>
    </>}
  </ScrollView></ThemeProvider>;
}

const st = StyleSheet.create({
  page: { paddingHorizontal: 20, gap: 24, width: '100%', maxWidth: 620, alignSelf: 'center', flexGrow: 1 },
  hero: { paddingTop: 24, paddingBottom: 28, alignItems: 'center', gap: 4 },
  sample: { position: 'absolute', top: 16, right: 16 },
  lamp: { marginTop: 4, marginBottom: 0 },
  heroText: { alignItems: 'center', gap: 10 },
  wordmark: { fontFamily: font.readBold, fontSize: 20, lineHeight: 24, letterSpacing: 1.6, textTransform: 'uppercase', color: accent.lamp },
  doors: { gap: 14 },
  back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingRight: 12 },
  backText: { fontFamily: font.readBold, fontSize: 20, color: seniorPalette.ink },
});
