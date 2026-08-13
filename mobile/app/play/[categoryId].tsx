import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { CATEGORIES, type CategoryId } from "@/data/categories";
import { WORDS } from "@/data/words";
import { speakArabic, stopSpeaking } from "@/lib/tts";
import { assessAudio, type AssessResponse } from "@/lib/api";
import { useAutoRecorder } from "@/hooks/useAutoRecorder";
import { useBackend } from "@/store/useBackend";
import { useProgress } from "@/store/useProgress";
import { LetterFeedback } from "@/components/LetterFeedback";
import { StarBurst } from "@/components/StarBurst";
import { PulsingMic } from "@/components/PulsingMic";

type Phase = "idle" | "tts" | "listening" | "processing" | "result" | "error";

export default function PlayScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: CategoryId }>();
  const router = useRouter();
  const backendUrl = useBackend((s) => s.url);
  const addResult = useProgress((s) => s.addResult);

  const category = useMemo(() => CATEGORIES.find((c) => c.id === categoryId), [categoryId]);
  const items = useMemo(() => WORDS[categoryId as CategoryId] ?? [], [categoryId]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const word = items[idx];

  const rec = useAutoRecorder(async (uri) => {
    if (!uri) {
      setErrMsg("Keine Aufnahme empfangen.");
      setPhase("error");
      return;
    }
    setPhase("processing");
    try {
      const r = await assessAudio(backendUrl, uri, word.ar);
      setResult(r);
      setPhase("result");
      const key = `${categoryId}:${word.ar}`;
      addResult(key, r.total);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          r.total >= 75
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? "Netzwerkfehler");
      setPhase("error");
    }
  });

  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runWord = () => {
    if (!word) return;
    setResult(null);
    setErrMsg(null);
    setPhase("tts");
    speakArabic(word.ar, () => {
      setTimeout(() => {
        setPhase("listening");
        rec.start();
      }, 150);
    });
  };

  useEffect(() => {
    if (!backendUrl || !word) return;
    runWord();
    return () => {
      stopSpeaking();
      if (nextTimer.current) clearTimeout(nextTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, backendUrl]);

  useEffect(() => {
    if (phase !== "result" || !result) return;
    if (result.total >= 75) {
      nextTimer.current = setTimeout(goNext, 1800);
    }
    return () => { if (nextTimer.current) clearTimeout(nextTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  const goNext = () => {
    if (idx >= items.length - 1) { router.back(); return; }
    setIdx(idx + 1);
  };

  const insets = useSafeAreaInsets();
  const busy = phase === "tts" || phase === "listening" || phase === "processing";

  if (!category) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text>Kategorie unbekannt.</Text>
      </SafeAreaView>
    );
  }

  if (!backendUrl) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.title}>Erst Backend einrichten</Text>
        <Text style={styles.subMuted}>
          Öffne die Einstellungen und trage die Colab-URL ein.
        </Text>
        <Pressable onPress={() => router.push("/settings" as any)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Zu den Einstellungen</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color="#334155" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{category.emoji}</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{category.title}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${((idx + 1) / items.length) * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>Wort {idx + 1} / {items.length}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.wordCard}>
          <Text style={styles.arabic} allowFontScaling={false}>{word?.ar}</Text>
          <Text style={styles.de}>{word?.de}</Text>
          {word?.translit ? <Text style={styles.translit}>{word.translit}</Text> : null}
        </View>

        <View style={styles.phaseWrap}>
          {phase === "tts" && (
            <View style={styles.phaseRow}>
              <Ionicons name="volume-high" size={26} color="#2563eb" />
              <Text style={styles.phaseText}>Hör gut zu…</Text>
            </View>
          )}
          {phase === "listening" && (
            <>
              <PulsingMic active level={rec.level} />
              <Text style={[styles.phaseText, { color: "#ef4444", marginTop: 10 }]}>Sprich das Wort!</Text>
            </>
          )}
          {phase === "processing" && (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.subMuted}>Bewertung…</Text>
            </View>
          )}
          {phase === "error" && (
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: "#ef4444", textAlign: "center" }}>{errMsg}</Text>
              <Pressable onPress={runWord} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Nochmal versuchen</Text>
              </Pressable>
            </View>
          )}
        </View>

        {phase === "result" && result && (
          <View style={styles.resultCard}>
            <StarBurst show={result.total >= 75} />
            <LetterFeedback units={result.units} />
            <Text style={styles.subMuted}>
              Du hast gesagt: <Text style={styles.arabicSmall}>{result.transcription || "—"}</Text>
            </Text>
            <ScoreBar total={result.total} />
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
      >
        <Pressable
          onPress={() => { setResult(null); runWord(); }}
          disabled={busy}
          style={({ pressed }) => [
            styles.footerBtn,
            styles.footerSecondary,
            busy && { opacity: 0.5 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="reload" size={18} color="#334155" />
          <Text style={styles.footerSecondaryText}>Nochmal</Text>
        </Pressable>
        <Pressable
          onPress={goNext}
          disabled={busy}
          style={({ pressed }) => [
            styles.footerBtn,
            styles.footerPrimary,
            busy && { opacity: 0.5 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="play" size={18} color="white" />
          <Text style={styles.footerPrimaryText}>Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ScoreBar({ total }: { total: number }) {
  const t = Math.round(total);
  const color = t >= 75 ? "#22c55e" : t >= 50 ? "#f59e0b" : "#ef4444";
  const label = t >= 75 ? "🌟 Sehr gut!" : t >= 50 ? "🙂 Fast!" : "💪 Nochmal!";
  return (
    <View style={{ width: "100%", marginTop: 12 }}>
      <View style={{ height: 10, backgroundColor: "#e2e8f0", borderRadius: 5, overflow: "hidden" }}>
        <View style={{ width: `${t}%`, height: "100%", backgroundColor: color }} />
      </View>
      <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "700", marginTop: 6 }}>
        {label} {t} / 100
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a", textAlign: "center" },
  subMuted: { color: "#64748b", textAlign: "center", marginTop: 6 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
  },
  primaryBtnText: { color: "white", fontWeight: "700" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "white",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  headerEmoji: { fontSize: 22 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", flexShrink: 1 },
  progressBg: {
    height: 8, marginHorizontal: 20, backgroundColor: "#e2e8f0",
    borderRadius: 4, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#3b82f6" },
  progressText: { textAlign: "center", color: "#64748b", fontSize: 12, marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  wordCard: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  arabic: { fontSize: 72, lineHeight: 96, color: "#0f172a", writingDirection: "rtl", textAlign: "center" },
  arabicSmall: { fontSize: 20, color: "#0f172a", writingDirection: "rtl" },
  de: { color: "#334155", fontSize: 18, marginTop: 6, fontWeight: "600" },
  translit: { color: "#94a3b8", fontStyle: "italic", fontSize: 14, marginTop: 2 },
  phaseWrap: { marginTop: 24, alignItems: "center", minHeight: 120, justifyContent: "center" },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  phaseText: { color: "#2563eb", fontSize: 17 },
  resultCard: {
    marginTop: 20,
    width: "100%",
    alignItems: "center",
    position: "relative",
    backgroundColor: "white",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  footer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  footerBtn: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  footerSecondary: {
    backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0",
  },
  footerSecondaryText: { color: "#334155", fontWeight: "700", fontSize: 16 },
  footerPrimary: { backgroundColor: "#22c55e" },
  footerPrimaryText: { color: "white", fontWeight: "700", fontSize: 16 },
});
