import { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { SURAH_MAP, type QuranWord } from "@/data/juzamma";
import { speakArabic, stopSpeaking } from "@/lib/tts";
import { assessAudioSmart, type AssessResponse, type AssessMeta } from "@/lib/api";
import { useAutoRecorder } from "@/hooks/useAutoRecorder";
import { useBackend } from "@/store/useBackend";
import { useProgress } from "@/store/useProgress";
import { LetterFeedback } from "@/components/LetterFeedback";
import { LatencyChip } from "@/components/LatencyChip";
import { PulsingMic } from "@/components/PulsingMic";

type Phase = "idle" | "tts" | "listening" | "processing" | "result" | "error";

// Wort-Chip-Status.
type ChipStatus = "pending" | "active" | "good" | "meh" | "bad";

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicNumber = (n: number) =>
  String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("");

const chipColor = (s: ChipStatus) => {
  switch (s) {
    case "good": return { bg: "#dcfce7", border: "#22c55e", fg: "#166534" };
    case "meh":  return { bg: "#fef9c3", border: "#eab308", fg: "#854d0e" };
    case "bad":  return { bg: "#fee2e2", border: "#ef4444", fg: "#991b1b" };
    case "active": return { bg: "#dbeafe", border: "#3b82f6", fg: "#1e3a8a" };
    default: return { bg: "#ffffff", border: "#e2e8f0", fg: "#0f172a" };
  }
};

export default function QuranSurahScreen() {
  const { surahId } = useLocalSearchParams<{ surahId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backendUrl = useBackend((s) => s.url);
  const streaming  = useBackend((s) => s.streaming);
  const addResult = useProgress((s) => s.addResult);
  const wordsMastered = useProgress((s) => s.wordsMastered);

  const surah = useMemo(() => SURAH_MAP[Number(surahId)], [surahId]);

  // Ayah-Index (0 = Basmala, danach 1..N).
  const [ayahIdx, setAyahIdx] = useState(0);
  // Wort-Index innerhalb der aktuellen Ayah.
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [meta, setMeta] = useState<AssessMeta | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // Score pro Wort dieser Sitzung, um Chips einzufaerben.
  const [sessionScores, setSessionScores] = useState<Record<string, number>>({});

  const ayah = surah?.ayat[ayahIdx];
  const word: QuranWord | undefined = ayah?.words[wordIdx];

  const wordKey = (aN: number, w: string) => `quran:${surah?.n}:${aN}:${w}`;

  const rec = useAutoRecorder(async (uri) => {
    if (!uri || !word) {
      setErrMsg("Keine Aufnahme empfangen.");
      setPhase("error");
      return;
    }
    setPhase("processing");
    try {
      const r = await assessAudioSmart(backendUrl, uri, word.ar, streaming);
      const { _meta, ...clean } = r as any;
      setResult(clean);
      setMeta(_meta);
      setPhase("result");
      const key = wordKey(ayah!.n, word.ar);
      addResult(key, r.total);
      setSessionScores((s) => ({ ...s, [key]: r.total }));
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
    if (!backendUrl || !surah || !word) return;
    runWord();
    return () => {
      stopSpeaking();
      if (nextTimer.current) clearTimeout(nextTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahId, ayahIdx, wordIdx, backendUrl]);

  // Autoadvance nur bei gutem Score.
  useEffect(() => {
    if (phase !== "result" || !result) return;
    if (result.total >= 75) {
      nextTimer.current = setTimeout(goNext, 1600);
    }
    return () => { if (nextTimer.current) clearTimeout(nextTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  const goNext = () => {
    if (!surah || !ayah) return;
    if (wordIdx < ayah.words.length - 1) {
      setWordIdx((i) => i + 1);
      return;
    }
    // Naechste Ayah.
    if (ayahIdx < surah.ayat.length - 1) {
      setAyahIdx((i) => i + 1);
      setWordIdx(0);
      return;
    }
    // Sura fertig.
    router.back();
  };

  const goPrev = () => {
    if (!surah) return;
    if (wordIdx > 0) { setWordIdx((i) => i - 1); return; }
    if (ayahIdx > 0) {
      const prev = surah.ayat[ayahIdx - 1];
      setAyahIdx((i) => i - 1);
      setWordIdx(prev.words.length - 1);
    }
  };

  if (!surah) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text>Sura nicht gefunden.</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!backendUrl) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.title}>Erst Backend einrichten</Text>
        <Pressable onPress={() => router.push("/settings" as any)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Zu den Einstellungen</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const busy = phase === "tts" || phase === "listening" || phase === "processing";
  const totalWords = ayah?.words.length ?? 0;
  const isBasmala = ayah?.n === 0;
  const ayahLabel = isBasmala ? "Basmala" : `Vers ${ayah?.n}`;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color="#334155" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} allowFontScaling={false}>
            سُورَة {surah.name_ar}
          </Text>
          <Text style={styles.headerSub}>
            {surah.translit} · {ayahLabel} · Wort {wordIdx + 1}/{totalWords}
          </Text>
        </View>
        <Pressable
          onPress={() => speakArabic(ayah!.words.map((w) => w.ar).join(" "))}
          style={styles.iconBtn}
          hitSlop={10}
        >
          <Ionicons name="volume-high" size={20} color="#3b82f6" />
        </Pressable>
      </View>

      {/* Ayah-Fortschritt */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${((ayahIdx + 1) / surah.ayat.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Ayah-Zeile: alle Woerter als Chips, RTL, aktuelles Wort hervorgehoben. */}
        <View style={styles.ayahCard}>
          {!isBasmala && (
            <View style={styles.ayahNumRow}>
              <View style={styles.ayahNumBadge}>
                <Text style={styles.ayahNumText}>﴿ {toArabicNumber(ayah!.n)} ﴾</Text>
              </View>
            </View>
          )}
          <View style={styles.chipRow}>
            {ayah!.words.map((wd, i) => {
              let st: ChipStatus = "pending";
              if (i === wordIdx) st = "active";
              else {
                const k = wordKey(ayah!.n, wd.ar);
                const score = sessionScores[k] ?? wordsMastered[k];
                if (score !== undefined) {
                  st = score >= 75 ? "good" : score >= 50 ? "meh" : "bad";
                }
              }
              const c = chipColor(st);
              return (
                <Pressable
                  key={`${i}-${wd.ar}`}
                  onPress={() => { if (!busy) { setWordIdx(i); } }}
                  onLongPress={() => speakArabic(wd.ar)}
                  style={[styles.chip, { backgroundColor: c.bg, borderColor: c.border }]}
                >
                  <Text style={[styles.chipAr, { color: c.fg }]} allowFontScaling={false}>
                    {wd.ar}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Grosses aktuelles Wort */}
        <View style={styles.wordCard}>
          <Text style={styles.bigWord} allowFontScaling={false}>{word?.ar}</Text>
          {word?.translit ? <Text style={styles.translit}>{word.translit}</Text> : null}
        </View>

        {/* Phasen-Anzeige */}
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
              <Text style={[styles.phaseText, { color: "#ef4444", marginTop: 10 }]}>
                Sag es nach!
              </Text>
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

        {/* Ergebnis */}
        {phase === "result" && result && (
          <View style={styles.resultCard}>
            <LetterFeedback units={result.units} />
            <Text style={styles.subMuted}>
              Du hast gesagt: <Text style={styles.arSmall}>{result.transcription || "—"}</Text>
            </Text>
            <ScoreBar total={result.total} />
            <LatencyChip meta={meta ?? undefined} serverMs={result.duration_ms} />
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <Pressable
          onPress={goPrev}
          disabled={busy || (ayahIdx === 0 && wordIdx === 0)}
          style={({ pressed }) => [
            styles.footerBtn, styles.footerSecondary,
            (busy || (ayahIdx === 0 && wordIdx === 0)) && { opacity: 0.4 },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={18} color="#334155" />
          <Text style={styles.footerSecondaryText}>Zurück</Text>
        </Pressable>
        <Pressable
          onPress={() => { setResult(null); runWord(); }}
          disabled={busy}
          style={({ pressed }) => [
            styles.footerBtn, styles.footerRetry,
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
            styles.footerBtn, styles.footerPrimary,
            busy && { opacity: 0.5 },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.footerPrimaryText}>Weiter</Text>
          <Ionicons name="chevron-forward" size={18} color="white" />
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a", textAlign: "center" },
  subMuted: { color: "#64748b", textAlign: "center", marginTop: 6 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  arSmall: { fontSize: 20, color: "#0f172a", writingDirection: "rtl" },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
  },
  primaryBtnText: { color: "white", fontWeight: "700" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "white",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 20, color: "#0f172a", writingDirection: "rtl" },
  headerSub: { color: "#64748b", fontSize: 12, marginTop: 2 },

  progressBg: {
    height: 6, marginHorizontal: 20, backgroundColor: "#e2e8f0",
    borderRadius: 3, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#3b82f6" },

  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },

  ayahCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  ayahNumRow: { flexDirection: "row", justifyContent: "flex-end" },
  ayahNumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  ayahNumText: { color: "#334155", fontSize: 13, fontWeight: "700" },
  chipRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-start",
    marginTop: 8,
  },
  chip: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chipAr: { fontSize: 22, writingDirection: "rtl" },

  wordCard: {
    marginTop: 14,
    backgroundColor: "white",
    borderRadius: 20,
    paddingVertical: 24,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bigWord: { fontSize: 68, lineHeight: 92, color: "#0f172a", writingDirection: "rtl", textAlign: "center" },
  translit: { color: "#64748b", fontStyle: "italic", fontSize: 16, marginTop: 4 },

  phaseWrap: { marginTop: 20, alignItems: "center", minHeight: 100, justifyContent: "center" },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  phaseText: { color: "#2563eb", fontSize: 17 },

  resultCard: {
    marginTop: 16,
    width: "100%",
    alignItems: "center",
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
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
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
    minHeight: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerSecondary: { backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" },
  footerRetry: { backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a" },
  footerSecondaryText: { color: "#334155", fontWeight: "700", fontSize: 14 },
  footerPrimary: { backgroundColor: "#22c55e", flex: 1.2 },
  footerPrimaryText: { color: "white", fontWeight: "700", fontSize: 15 },
});
