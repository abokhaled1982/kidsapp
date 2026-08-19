import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PROFILE_THEMES, type LearningGoal, type LearningLevel, type ProfileMode, type ProfileStyle, useProfile } from "@/store/useProfile";
import { buildProfile, themeForStyle } from "@/store/profileFlow";

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

export default function OnboardingScreen({ onComplete }: { onComplete?: () => void }) {
  const router = useRouter();
  const saveProfile = useProfile((state) => state.saveProfile);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ProfileMode>("child");
  const [style, setStyle] = useState<ProfileStyle>("girl");
  const [level, setLevel] = useState<LearningLevel>(5);
  const [goal, setGoal] = useState<LearningGoal>("all");
  const theme = themeForStyle(style);
  const colors = PROFILE_THEMES[theme];

  const finish = () => {
    saveProfile(buildProfile({ name, mode, style, level, goal }));
    if (onComplete) onComplete();
    else router.replace("/(tabs)" as any);
  };

  const select = (action: () => void) => {
    action();
    if (step < 4) setStep((current) => current + 1);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.root}
      >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.shell}>
        <View style={styles.topbar}>
          {step > 0 ? (
            <Pressable onPress={() => setStep((current) => current - 1)} style={styles.iconButton} accessibilityLabel="Zurück">
              <Ionicons name="arrow-back" size={22} color="#334155" />
            </Pressable>
          ) : <View style={styles.iconButton} />}
          <View style={styles.dots}>
            {[0, 1, 2, 3, 4].map((item) => <View key={item} style={[styles.dot, { backgroundColor: item <= step ? colors.primary : "#dbe4ef" }]} />)}
          </View>
          <View style={styles.iconButton} />
        </View>

        <View style={[styles.visual, { backgroundColor: colors.primary }]}>
          <Text style={styles.visualEmoji}>{step === 0 ? "🌟" : step === 1 ? "👋" : step === 2 ? "🎨" : step === 3 ? "🧩" : "🗺️"}</Text>
          <Text style={styles.visualCaption}>{step === 0 ? "Quran Kids" : step === 1 ? "Hallo!" : step === 2 ? "Dein Stil" : step === 3 ? "Dein Weg" : "Dein Ziel"}</Text>
        </View>

        {step === 0 && (
          <Question title="Wer richtet die App ein?">
            <View style={styles.cardGrid}>
              {MODES.map((item) => <ChoiceCard key={item.value} emoji={item.emoji} label={item.label} selected={mode === item.value} color={colors.primary} onPress={() => select(() => setMode(item.value))} />)}
            </View>
          </Question>
        )}
        {step === 1 && (
          <Question title="Wie heißt du?">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor="#94a3b8"
              style={styles.nameInput}
              maxLength={24}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => setStep(2)}
            />
            <Pressable onPress={() => setStep(2)} style={[styles.nextButton, { backgroundColor: colors.primary }]}><Text style={styles.nextText}>Weiter</Text><Ionicons name="arrow-forward" size={20} color="#fff" /></Pressable>
          </Question>
        )}
        {step === 2 && (
          <Question title="Was passt zu dir?">
            <View style={styles.cardGrid}>
              {STYLES.map((item) => <ChoiceCard key={item.value} emoji={item.emoji} label={item.label} selected={style === item.value} color={colors.primary} onPress={() => select(() => setStyle(item.value))} />)}
            </View>
          </Question>
        )}
        {step === 3 && (
          <Question title="Wähle dein Level">
            <View style={styles.levelGrid}>
              {LEVELS.map((item) => <ChoiceCard key={item} emoji={String(item)} label={item === 5 ? "Start" : item === 9 ? "Profi" : "Weiter"} selected={level === item} color={colors.primary} onPress={() => select(() => setLevel(item))} />)}
            </View>
          </Question>
        )}
        {step === 4 && (
          <Question title="Was möchtest du?">
            <View style={styles.cardGrid}>
              {GOALS.map((item) => <ChoiceCard key={item.value} emoji={item.emoji} label={item.label} selected={goal === item.value} color={colors.primary} onPress={() => setGoal(item.value)} />)}
            </View>
            <Pressable onPress={finish} style={[styles.nextButton, { backgroundColor: colors.primary }]}><Text style={styles.nextText}>Los geht&apos;s</Text><Ionicons name="sparkles" size={20} color="#fff" /></Pressable>
          </Question>
        )}
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.question}><Text style={styles.questionTitle}>{title}</Text>{children}</View>;
}

function ChoiceCard({ emoji, label, selected, color, onPress }: { emoji: string; label: string; selected: boolean; color: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choiceCard, selected && { borderColor: color, backgroundColor: "#fff" }]} accessibilityRole="radio" accessibilityState={{ selected }}><Text style={styles.choiceEmoji}>{emoji}</Text><Text style={[styles.choiceLabel, selected && { color }]}>{label}</Text>{selected ? <Ionicons name="checkmark-circle" size={20} color={color} style={styles.check} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  shell: { flex: 1, padding: 18, gap: 16 },
  topbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  iconButton: { alignItems: "center", height: 42, justifyContent: "center", width: 42 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { borderRadius: 4, height: 7, width: 26 },
  visual: { alignItems: "center", borderRadius: 30, flex: 1, justifyContent: "center", minHeight: 250 },
  visualEmoji: { fontSize: 100 },
  visualCaption: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 8 },
  question: { gap: 14, paddingBottom: 10 },
  questionTitle: { color: "#0f172a", fontSize: 25, fontWeight: "800", textAlign: "center" },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  choiceCard: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.68)", borderColor: "#dbe4ef", borderRadius: 20, borderWidth: 2, justifyContent: "center", minHeight: 104, padding: 12, position: "relative", width: "47%" },
  choiceEmoji: { fontSize: 42 },
  choiceLabel: { color: "#334155", fontSize: 14, fontWeight: "800", marginTop: 5 },
  check: { position: "absolute", right: 8, top: 8 },
  levelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  nameInput: { backgroundColor: "#fff", borderColor: "#dbe4ef", borderRadius: 18, borderWidth: 1, color: "#0f172a", fontSize: 22, paddingHorizontal: 18, paddingVertical: 16, textAlign: "center" },
  nextButton: { alignItems: "center", borderRadius: 18, flexDirection: "row", gap: 8, justifyContent: "center", paddingVertical: 15 },
  nextText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
