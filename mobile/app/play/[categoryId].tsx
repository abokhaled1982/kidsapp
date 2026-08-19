import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { CATEGORIES, type CategoryId } from "@/data/categories";
import { WORDS } from "@/data/words";
import { speakArabic, stopSpeaking } from "@/lib/tts";
import { assessAudioSmart, type AssessResponse, type AssessMeta } from "@/lib/api";
import { getStreamSession } from "@/lib/stream";
import { useAutoRecorder } from "@/hooks/useAutoRecorder";
import { useBackend } from "@/store/useBackend";
import { useProgress } from "@/store/useProgress";
import { useTheme } from "@/store/useTheme";
import type { ThemePalette } from "@/store/profileModel";
import { LetterFeedback } from "@/components/LetterFeedback";
import { LatencyChip } from "@/components/LatencyChip";
import { StarBurst } from "@/components/StarBurst";
import { PulsingMic } from "@/components/PulsingMic";

type Phase = "idle" | "tts" | "listening" | "processing" | "result" | "error";

export default function PlayScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: CategoryId }>();
  const router = useRouter();
  const c = useTheme();
  const backendUrl = useBackend((s) => s.url);
  const backendToken = useBackend((s) => s.token);
  const addResult = useProgress((s) => s.addResult);

  const category = useMemo(() => CATEGORIES.find((x) => x.id === categoryId), [categoryId]);
  const items = useMemo(() => WORDS[categoryId as CategoryId] ?? [], [categoryId]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [meta, setMeta] = useState<AssessMeta | null>(null);
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
      const r = await assessAudioSmart(backendUrl, uri, word.ar, backendToken);
      const { _meta, ...clean } = r as any;
      setResult(clean);
      setMeta(_meta);
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
  const recordStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runWord = () => {
    if (!word) return;
    if (recordStartTimer.current) clearTimeout(recordStartTimer.current);
    setResult(null);
    setErrMsg(null);
    setPhase("tts");
    speakArabic(word.ar, () => {
      recordStartTimer.current = setTimeout(() => {
        recordStartTimer.current = null;
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
      if (recordStartTimer.current) clearTimeout(recordStartTimer.current);
      recordStartTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, backendUrl]);

  // WS beim Screen-Mount vorwaermen -> erstes Wort zahlt keinen Connect-Preis.
  useEffect(() => {
    if (backendUrl) getStreamSession(backendUrl, backendToken).warmUp();
  }, [backendUrl, backendToken]);

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
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.text }}>Kategorie unbekannt.</Text>
      </SafeAreaView>
    );
  }

  if (!backendUrl) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Erst Backend einrichten</Text>
        <Text style={[styles.subMuted, { color: c.textMuted }]}>
          Öffne die Einstellungen und trage die Colab-URL ein.
        </Text>
        <Pressable
          onPress={() => router.push("/settings" as any)}
          style={[styles.primaryBtn, { backgroundColor: c.primary }]}
        >
          <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Zu den Einstellungen</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: c.surface, borderColor: c.border },
            pressed && styles.pressed,
          ]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{category.emoji}</Text>
          <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>{category.title}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.progressBg, { backgroundColor: c.surfaceMuted }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: c.primary, width: `${((idx + 1) / items.length) * 100}%` },
          ]}
        />
      </View>
      <Text style={[styles.progressText, { color: c.textMuted }]}>Wort {idx + 1} / {items.length}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.wordCard, { backgroundColor: c.surface, shadowColor: c.text }]}>
          <Text style={[styles.arabic, { color: c.text }]} allowFontScaling={false}>{word?.ar}</Text>
          <Text style={[styles.de, { color: c.text }]}>{word?.de}</Text>
          {word?.translit ? (
            <Text style={[styles.translit, { color: c.textMuted }]}>{word.translit}</Text>
          ) : null}
        </View>

        <View style={styles.phaseWrap}>
          {phase === "tts" && (
            <View style={styles.phaseRow}>
              <Ionicons name="volume-high" size={26} color={c.info} />
              <Text style={[styles.phaseText, { color: c.info }]}>Hör gut zu…</Text>
            </View>
          )}
          {phase === "listening" && (
            <>
              <PulsingMic active level={rec.level} />
              <Text style={[styles.phaseText, { color: c.recording, marginTop: 10 }]}>Sprich das Wort!</Text>
            </>
          )}
          {phase === "processing" && (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator size="large" color={c.primary} />
              <Text style={[styles.subMuted, { color: c.textMuted }]}>Bewertung…</Text>
            </View>
          )}
          {phase === "error" && (
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: c.bad.base, textAlign: "center" }}>{errMsg}</Text>
              <Pressable onPress={runWord} style={[styles.primaryBtn, { backgroundColor: c.primary }]}>
                <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Nochmal versuchen</Text>
              </Pressable>
            </View>
          )}
        </View>

        {phase === "result" && result && (
          <View style={[styles.resultCard, { backgroundColor: c.surface, shadowColor: c.text }]}>
            <StarBurst show={result.total >= 75} />
            <LetterFeedback units={result.units} />
            <Text style={[styles.subMuted, { color: c.textMuted }]}>
              Du hast gesagt:{" "}
              <Text style={[styles.arabicSmall, { color: c.text }]}>{result.transcription || "—"}</Text>
            </Text>
            <ScoreBar total={result.total} colors={c} />
            <LatencyChip meta={meta ?? undefined} serverMs={result.duration_ms} />

            {(meta?.client || result.timings) && (
              <View style={[styles.diagBox, { backgroundColor: c.background, borderColor: c.border }]}>
                <Text style={[styles.diagTitle, { color: c.text }]}>Latenz-Analyse</Text>
                <DiagLine label="Modus" value="ws" bold colors={c} />
                {meta?.client && (
                  <>
                    <DiagLine
                      label="Audio (Handy → Bytes)"
                      value={`${meta.client.bytes_read_ms} ms`}
                      extra={`${Math.round((meta.client.bytes ?? 0) / 1024)} KB`}
                      colors={c}
                    />
                    <DiagLine label="WS send-Aufruf" value={`${meta.client.ws_send_ms} ms`} colors={c} />
                    <DiagLine label="WS warm?" value={meta.client.warm ? "ja" : "nein (Connect)"} colors={c} />
                    <DiagLine label="→ Roundtrip (rtt)" value={`${meta.client.rtt_ms} ms`} bold colors={c} />
                  </>
                )}
                {result.timings && (
                  <>
                    <DiagLine label="Audio-Länge (Kind spricht)" value={`${result.timings.audio_ms ?? "?"} ms`} colors={c} />
                    <DiagLine label="Preprocess (CPU)" value={`${result.timings.preprocess_ms ?? "?"} ms`} colors={c} />
                    <DiagLine label="ASR (GPU)" value={`${result.timings.asr_ms ?? "?"} ms`} bold colors={c} />
                    <DiagLine label="Wort-Scoring" value={`${result.timings.score_ms ?? "?"} ms`} colors={c} />
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.surface,
            borderTopColor: c.border,
            shadowColor: c.text,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
          },
        ]}
      >
        <Pressable
          onPress={() => { setResult(null); runWord(); }}
          disabled={busy}
          style={({ pressed }) => [
            styles.footerBtn,
            { backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border },
            busy && { opacity: 0.5 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="reload" size={18} color={c.text} />
          <Text style={[styles.footerBtnText, { color: c.text }]}>Nochmal</Text>
        </Pressable>
        <Pressable
          onPress={goNext}
          disabled={busy}
          style={({ pressed }) => [
            styles.footerBtn,
            { backgroundColor: c.primary },
            busy && { opacity: 0.5 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="play" size={18} color={c.onPrimary} />
          <Text style={[styles.footerBtnText, { color: c.onPrimary }]}>Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ScoreBar({ total, colors }: { total: number; colors: ThemePalette }) {
  const t = Math.round(total);
  const tone = t >= 75 ? colors.good : t >= 50 ? colors.medium : colors.bad;
  const label = t >= 75 ? "🌟 Sehr gut!" : t >= 50 ? "🙂 Fast!" : "💪 Nochmal!";
  return (
    <View style={{ width: "100%", marginTop: 12 }}>
      <View style={{ height: 10, backgroundColor: colors.surfaceMuted, borderRadius: 5, overflow: "hidden" }}>
        <View style={{ width: `${t}%`, height: "100%", backgroundColor: tone.base }} />
      </View>
      <Text
        style={{
          textAlign: "center",
          fontSize: 16,
          fontWeight: "700",
          marginTop: 6,
          color: tone.text,
        }}
      >
        {label} {t} / 100
      </Text>
    </View>
  );
}

function DiagLine({
  label, value, extra, bold, colors,
}: {
  label: string;
  value: string | number;
  extra?: string;
  bold?: boolean;
  colors: ThemePalette;
}) {
  return (
    <View style={styles.diagRow}>
      <Text style={[styles.diagLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.diagValue, { color: colors.text }, bold && styles.diagBold]}>
        {value}{extra ? `  ·  ${extra}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  subMuted: { textAlign: "center", marginTop: 6 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  primaryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
  },
  primaryBtnText: { fontWeight: "700" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  headerEmoji: { fontSize: 22 },
  headerTitle: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
  progressBg: {
    height: 8, marginHorizontal: 20,
    borderRadius: 4, overflow: "hidden",
  },
  progressFill: { height: "100%" },
  progressText: { textAlign: "center", fontSize: 12, marginTop: 4 },
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
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  arabic: { fontSize: 72, lineHeight: 96, writingDirection: "rtl", textAlign: "center" },
  arabicSmall: { fontSize: 20, writingDirection: "rtl" },
  de: { fontSize: 18, marginTop: 6, fontWeight: "600" },
  translit: { fontStyle: "italic", fontSize: 14, marginTop: 2 },
  phaseWrap: { marginTop: 24, alignItems: "center", minHeight: 120, justifyContent: "center" },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  phaseText: { fontSize: 17 },
  resultCard: {
    marginTop: 20,
    width: "100%",
    alignItems: "center",
    position: "relative",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
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
    borderTopWidth: 1,
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
  footerBtnText: { fontWeight: "700", fontSize: 16 },

  diagBox: {
    marginTop: 16,
    width: "100%",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  diagTitle: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  diagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diagLabel: { fontSize: 12, flexShrink: 1 },
  diagValue: { fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "600" },
  diagBold: { fontWeight: "800" },
});
