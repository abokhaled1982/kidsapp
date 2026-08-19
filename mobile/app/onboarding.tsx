import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PROFILE_THEMES, type LearningGoal, type LearningLevel, type ProfileMode, type ProfileStyle, useProfile } from "@/store/useProfile";
import { buildProfile, themeForStyle } from "@/store/profileFlow";

// Reihenfolge der Fragen. Der Stil kommt bewusst vor allen farbigen Flaechen,
// damit das Kind ab Schritt "Name" seine eigene Farbe sieht und nicht erst
// einen Standardton, der danach wechselt.
const STEP_MODE = 0;
const STEP_STYLE = 1;
const STEP_NAME = 2;
const STEP_LEVEL = 3;
const STEP_GOAL = 4;
const LAST_STEP = STEP_GOAL;
const STEPS = [STEP_MODE, STEP_STYLE, STEP_NAME, STEP_LEVEL, STEP_GOAL];

const LEVELS: LearningLevel[] = [5, 6, 7, 8, 9];
const STYLES: { value: ProfileStyle; label: string; emoji: string }[] = [
  { value: "girl", label: "Mädchen", emoji: "🌸" },
  { value: "boy", label: "Junge", emoji: "🚀" },
  { value: "neutral", label: "Neutral", emoji: "🌿" },
];
const MODES: { value: ProfileMode; label: string; emoji: string }[] = [
  { value: "child", label: "Kind", emoji: "🧒" },
  { value: "parent", label: "Elternteil", emoji: "👨‍👩‍👧" },
];
const GOALS: { value: LearningGoal; label: string; emoji: string }[] = [
  { value: "arabic", label: "Lesen", emoji: "🔤" },
  { value: "pronunciation", label: "Sprechen", emoji: "🎙️" },
  { value: "quran", label: "Quran", emoji: "📖" },
  { value: "all", label: "Alles", emoji: "✨" },
];

const HERO: Record<number, { emoji: string; caption: string }> = {
  [STEP_MODE]: { emoji: "🌟", caption: "Quran Kids" },
  [STEP_STYLE]: { emoji: "🎨", caption: "Dein Stil" },
  [STEP_NAME]: { emoji: "👋", caption: "Hallo!" },
  [STEP_LEVEL]: { emoji: "🧩", caption: "Dein Weg" },
  [STEP_GOAL]: { emoji: "🗺️", caption: "Dein Ziel" },
};

type OnboardingColors = {
  primary: string;
  onPrimary: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
};

// Solange der Stil nicht gewaehlt ist, wird absichtlich kein Theme-Ton
// gezeigt - sonst leuchtet ein Standardton durch, den niemand gewaehlt hat.
const PRE_STYLE_COLORS: OnboardingColors = {
  primary: "#64748b",
  onPrimary: "#ffffff",
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceMuted: "#f1f5f9",
  border: "#dbe4ef",
  text: "#0f172a",
  textMuted: "#64748b",
};

export default function OnboardingScreen({ onComplete }: { onComplete?: () => void }) {
  const router = useRouter();
  const saveProfile = useProfile((state) => state.saveProfile);
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(STEP_MODE);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ProfileMode>("child");
  const [style, setStyle] = useState<ProfileStyle>("girl");
  const [level, setLevel] = useState<LearningLevel>(5);
  const [goal, setGoal] = useState<LearningGoal>("all");
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const colors: OnboardingColors = step >= STEP_NAME ? PROFILE_THEMES[themeForStyle(style)] : PRE_STYLE_COLORS;
  const hero = HERO[step];
  // Bei offener Tastatur schrumpft das Hero-Bild zu einem Streifen, damit
  // Frage, Eingabefeld und "Weiter" im sichtbaren Bereich bleiben.
  const compactHero = keyboardOpen;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => {
      setKeyboardOpen(true);
      if (step === STEP_NAME) {
        requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      }
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [step]);

  const finish = () => {
    saveProfile(buildProfile({ name, mode, style, level, goal }));
    if (onComplete) onComplete();
    else router.replace("/(tabs)" as any);
  };

  const select = (action: () => void) => {
    action();
    if (step < LAST_STEP) setStep((current) => current + 1);
  };

  const goBack = () => {
    Keyboard.dismiss();
    setStep((current) => current - 1);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.shell}>
            <View style={styles.topbar}>
              {step > STEP_MODE ? (
                <Pressable onPress={goBack} style={styles.iconButton} accessibilityLabel="Zurück">
                  <Ionicons name="arrow-back" size={22} color={colors.text} />
                </Pressable>
              ) : <View style={styles.iconButton} />}
              <View style={styles.dots}>
                {STEPS.map((item) => (
                  <View
                    key={item}
                    style={[styles.dot, { backgroundColor: item <= step ? colors.primary : colors.border }]}
                  />
                ))}
              </View>
              <View style={styles.iconButton} />
            </View>

            <View
              style={[
                styles.visual,
                compactHero && styles.visualCompact,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text style={compactHero ? styles.visualEmojiCompact : styles.visualEmoji}>{hero.emoji}</Text>
              <Text
                style={[
                  styles.visualCaption,
                  compactHero && styles.visualCaptionCompact,
                  { color: colors.onPrimary },
                ]}
              >
                {hero.caption}
              </Text>
            </View>

            {step === STEP_MODE && (
              <Question title="Wer richtet die App ein?" colors={colors}>
                <View style={styles.cardGrid}>
                  {MODES.map((item) => (
                    <ChoiceCard
                      key={item.value}
                      emoji={item.emoji}
                      label={item.label}
                      selected={mode === item.value}
                      color={colors.primary}
                      colors={colors}
                      onPress={() => select(() => setMode(item.value))}
                    />
                  ))}
                </View>
              </Question>
            )}
            {step === STEP_STYLE && (
              <Question title="Was passt zu dir?" colors={colors}>
                <View style={styles.cardGrid}>
                  {STYLES.map((item) => {
                    // Jede Karte zeigt ihre eigene Farbe - man sieht vorher,
                    // wie die App danach aussieht.
                    const preview = PROFILE_THEMES[themeForStyle(item.value)].primary;
                    return (
                      <ChoiceCard
                        key={item.value}
                        emoji={item.emoji}
                        label={item.label}
                        selected={style === item.value}
                        color={preview}
                        colors={colors}
                        swatch={preview}
                        onPress={() => select(() => setStyle(item.value))}
                      />
                    );
                  })}
                </View>
              </Question>
            )}
            {step === STEP_NAME && (
              <Question title="Wie heißt du?" colors={colors}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Name"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.nameInput,
                    { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
                  ]}
                  maxLength={24}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => setStep(STEP_LEVEL)}
                />
                <Pressable
                  onPress={() => setStep(STEP_LEVEL)}
                  style={[styles.nextButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.nextText, { color: colors.onPrimary }]}>Weiter</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.onPrimary} />
                </Pressable>
              </Question>
            )}
            {step === STEP_LEVEL && (
              <Question title="Wähle dein Level" colors={colors}>
                <View style={styles.levelGrid}>
                  {LEVELS.map((item) => (
                    <ChoiceCard
                      key={item}
                      emoji={String(item)}
                      label={item === 5 ? "Start" : item === 9 ? "Profi" : "Weiter"}
                      selected={level === item}
                      color={colors.primary}
                      colors={colors}
                      onPress={() => select(() => setLevel(item))}
                    />
                  ))}
                </View>
              </Question>
            )}
            {step === STEP_GOAL && (
              <Question title="Was möchtest du?" colors={colors}>
                <View style={styles.cardGrid}>
                  {GOALS.map((item) => (
                    <ChoiceCard
                      key={item.value}
                      emoji={item.emoji}
                      label={item.label}
                      selected={goal === item.value}
                      color={colors.primary}
                      colors={colors}
                      onPress={() => setGoal(item.value)}
                    />
                  ))}
                </View>
                <Pressable onPress={finish} style={[styles.nextButton, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.nextText, { color: colors.onPrimary }]}>Los geht&apos;s</Text>
                  <Ionicons name="sparkles" size={20} color={colors.onPrimary} />
                </Pressable>
              </Question>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Question({ title, colors, children }: { title: string; colors: OnboardingColors; children: ReactNode }) {
  return (
    <View style={styles.question}>
      <Text style={[styles.questionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function ChoiceCard({ emoji, label, selected, color, colors, swatch, onPress }: {
  emoji: string;
  label: string;
  selected: boolean;
  color: string;
  colors: OnboardingColors;
  swatch?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choiceCard,
        { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
        selected && { borderColor: color, backgroundColor: colors.surface },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={styles.choiceEmoji}>{emoji}</Text>
      <Text style={[styles.choiceLabel, { color: colors.textMuted }, selected && { color }]}>{label}</Text>
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      {selected ? <Ionicons name="checkmark-circle" size={20} color={color} style={styles.check} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  shell: { flex: 1, padding: 18, gap: 16 },
  topbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  iconButton: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { borderRadius: 4, height: 7, width: 26 },
  // flexShrink + minHeight 0: das Bild darf schrumpfen, wenn der Platz knapp
  // wird. Vorher blockierte minHeight 250 das und schob die Frage aus dem Bild.
  visual: {
    alignItems: "center",
    borderRadius: 30,
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "center",
    maxHeight: 340,
    minHeight: 0,
  },
  visualCompact: { flexDirection: "row", flexGrow: 0, gap: 12, maxHeight: 78, paddingVertical: 14 },
  visualEmoji: { fontSize: 100 },
  visualEmojiCompact: { fontSize: 34 },
  visualCaption: { fontSize: 18, fontWeight: "800", marginTop: 8 },
  visualCaptionCompact: { marginTop: 0 },
  question: { gap: 14, paddingBottom: 10 },
  questionTitle: { fontSize: 25, fontWeight: "800", textAlign: "center" },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  choiceCard: { alignItems: "center", borderRadius: 20, borderWidth: 2, justifyContent: "center", minHeight: 104, padding: 12, position: "relative", width: "47%" },
  choiceEmoji: { fontSize: 42 },
  choiceLabel: { fontSize: 14, fontWeight: "800", marginTop: 5 },
  swatch: { borderRadius: 5, bottom: 8, height: 10, position: "absolute", width: 26 },
  check: { position: "absolute", right: 8, top: 8 },
  levelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  nameInput: { borderRadius: 18, borderWidth: 1, fontSize: 22, paddingHorizontal: 18, paddingVertical: 16, textAlign: "center" },
  nextButton: { alignItems: "center", borderRadius: 18, flexDirection: "row", gap: 8, justifyContent: "center", paddingVertical: 15 },
  nextText: { fontSize: 16, fontWeight: "800" },
});
