import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Lamp from './Lamp';
import { PEOPLE } from './AppContext';
import { Press, T } from './design/ui';
import Icon from './design/Icon';
import { accent, dark, ease, radius } from './design/tokens';

// "Who is this phone for?" Two doors: the older adult's phone, or a family member's.
// Family picks who they are next, because Anne (approves rides, sees meds) and Mark see different things.
export default function StartScreen({ onPick }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState('side'); // side | family
  const senior = PEOPLE.find((p) => p.id === 'senior');
  const desk = PEOPLE.find((p) => p.id === 'desk');
  const family = PEOPLE.filter((p) => p.id === 'family');

  return (
    <ScrollView contentContainerStyle={[st.pad, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32 }]}>
      {step === 'side' ? (
        <Animated.View key="side" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ gap: 14 }}>
          <Stagger i={0} style={st.hero}>
            <Lamp state="lit" size={132} label="Porchlight" />
            <Text style={st.word}>Porchlight</Text>
          </Stagger>
          <Stagger i={1} style={{ gap: 8, marginBottom: 10 }}>
            <T v="largeTitle" center>Who is this phone for?</T>
            <T v="body" muted center>A daily check-in for people living alone, with family close by.</T>
          </Stagger>
          <Stagger i={2}>
            <Door
              lamp
              kicker="Older adult"
              title={`I’m ${senior.title}`}
              sub="Big buttons, a daily chat, and help when I need it."
              icon="house.fill"
              onPress={() => onPick(senior)}
            />
          </Stagger>
          <Stagger i={3}>
            <Door
              kicker="Family and neighbors"
              title="I’m family"
              sub={`See how ${senior.title} is doing, approve rides, and take on tasks.`}
              icon="person.2.fill"
              onPress={() => setStep('family')}
            />
          </Stagger>
          <Stagger i={4}>
            <Press onPress={() => onPick(desk)} accessibilityLabel="Volunteer desk for the nonprofit" style={st.link}>
              <Icon name="headphones" size={15} color={dark.muted} />
              <Text style={st.linkText}>Volunteer desk for the nonprofit</Text>
            </Press>
          </Stagger>
        </Animated.View>
      ) : (
        <Animated.View key="family" entering={FadeInDown.duration(250).easing(ease.out)} exiting={FadeOut.duration(150)} style={{ gap: 12 }}>
          <Press onPress={() => setStep('side')} accessibilityLabel="Back" style={st.back}>
            <Icon name="chevron.left" size={15} color={dark.ink} weight="bold" />
            <Text style={st.backText}>Back</Text>
          </Press>
          <T v="largeTitle">Which family member are you?</T>
          <T v="body" muted style={{ marginBottom: 8 }}>Each person sees what they need. Only {family[0].title} can approve rides and see medicines.</T>
          {family.map((p, i) => (
            <Stagger key={p.who} i={i}>
              <Press onPress={() => onPick(p)} accessibilityLabel={`${p.title}, ${p.sub}`} scaleTo={0.98} style={st.person}>
                <View style={st.avatar}><Text style={st.avatarText}>{p.title[0]}</Text></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={st.personTitle}>{p.title}</Text>
                  <Text style={st.personSub}>{p.sub}</Text>
                </View>
                <Icon name="chevron.right" size={14} color={dark.muted} weight="bold" />
              </Press>
            </Stagger>
          ))}
        </Animated.View>
      )}
    </ScrollView>
  );
}

// First-run entrance, staggered 60ms. Plays once; nothing waits on it.
function Stagger({ i, children, style }) {
  const reduced = useReducedMotion();
  const entering = useMemo(() => (reduced ? FadeIn.duration(200) : FadeInDown.duration(400).delay(i * 60).easing(ease.out)), [i, reduced]);
  return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}

function Door({ kicker, title, sub, icon, onPress, lamp }) {
  return (
    <Press onPress={onPress} feedback="press" scaleTo={0.98} accessibilityLabel={`${title}. ${sub}`} style={[st.door, lamp && st.doorLamp]}>
      <View style={st.doorTop}>
        <Text style={[st.kicker, lamp && { color: '#6B4300' }]}>{kicker}</Text>
        <View style={[st.doorIcon, lamp && { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
          <Icon name={icon} size={18} color={lamp ? accent.lampInk : dark.ink} />
        </View>
      </View>
      <Text style={[st.doorTitle, lamp && { color: accent.lampInk }]}>{title}</Text>
      <Text style={[st.doorSub, lamp && { color: '#5C3B00' }]}>{sub}</Text>
    </Press>
  );
}

const st = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  hero: { alignItems: 'center', gap: 2, marginBottom: 4 },
  word: { fontSize: 15, fontWeight: '600', color: dark.muted, letterSpacing: 2, textTransform: 'uppercase' },
  door: { backgroundColor: dark.surface, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: dark.lineStrong, padding: 22, gap: 4 },
  doorLamp: { backgroundColor: accent.lamp, borderColor: 'transparent' },
  doorTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  doorIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: dark.raised, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 13, fontWeight: '600', color: dark.muted, letterSpacing: 0.2 },
  doorTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.8, color: dark.ink },
  doorSub: { fontSize: 17, lineHeight: 23, color: dark.muted },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, marginTop: 4 },
  linkText: { fontSize: 15, fontWeight: '600', color: dark.muted },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' },
  backText: { fontSize: 17, fontWeight: '600', color: dark.ink },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: dark.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: dark.lineStrong, padding: 16, minHeight: 76 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: dark.raised, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: dark.ink },
  personTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, color: dark.ink },
  personSub: { fontSize: 15, color: dark.muted },
});
