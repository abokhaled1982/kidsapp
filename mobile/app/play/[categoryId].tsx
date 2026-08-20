// Aussprache-Uebung fuer jeden Inhalt (Anforderungen 7: "Was sollte gesagt
// werden - was hat das Modell erkannt - was soll das Kind wiederholen").
//
// Der Bildschirm kennt keine Inhaltsart, sondern nur eine Uebungsquelle aus
// wordSources.ts: Buchstaben, Harakat, Silben, lange Laute, kurze Woerter,
// Quran-Grundwortschatz oder eine Wortkategorie. Damit prueft das Sprachmodell
// jeden Inhalt der App mit derselben Mechanik.
//
// Die Dichte kommt aus dem Levelplan (Anforderung 8): Level 5 und 6 bekommen
// grosse Bilder, wenig Text und riesige Tasten, ab Level 7 wird es kompakter.

import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { wordSource } from "@/data/wordSources";
import { speakArabic, stopSpeaking } from "@/lib/tts";
import { assessAudioSmart, type AssessResponse, type AssessMeta } from "@/lib/api";
import { getStreamSession } from "@/lib/stream";
import { useAutoRecorder } from "@/hooks/useAutoRecorder";
import { useBackend } from "@/store/useBackend";
import { useProfile } from "@/store/useProfile";
import { useProgress } from "@/store/useProgress";
import { useTheme } from "@/store/useTheme";
import { MASTERY_SCORE, levelPlan } from "@/store/levelFlow";
import type { ThemePalette } from "@/store/profileModel";
import { LetterFeedback } from "@/components/LetterFeedback";
import { LatencyChip } from "@/components/LatencyChip";
import { StarBurst } from "@/components/StarBurst";
import { PulsingMic } from "@/components/PulsingMic";
import { PictureTile } from "@/components/PictureTile";

// "ready" = das Kind liest selbst vor, das Mikrofon startet gleich. Diese Phase
// gibt es nur ab Level 7 (audioFirst = false).
type Phase = "idle" | "ready" | "tts" | "listening" | "processing" | "result" | "error";

export default function PlayScreen() {
  const { categoryId, start } = useLocalSearchParams<{ categoryId: string; start?: string }>();
  const router = useRouter();
  const c = useTheme();
  const backendUrl = useBackend((s) => s.url);
  const backendToken = useBackend((s) => s.token);
  const addResult = useProgress((s) => s.addResult);
  const profile = useProfile((s) => s.profile);
  const plan = levelPlan(profile?.level ?? 5);
  const ui = plan.ui;
  const big = ui.density === "large";
  // Latenzwerte sind Diagnose fuer Eltern und haben im Kinder-UI nichts zu suchen.
  const showDiagnostics = profile?.mode === "parent";

  // Die Route nimmt eine Uebungsquelle: eine Kategorie-Id, "buchstaben",
  // "harakat", "silben", "madd", "kurz" oder "quran-core".
  const source = useMemo(() => wordSource(categoryId), [categoryId]);
  const items = useMemo(() => source?.words ?? [], [source]);

  // Einstieg: "Nächster Lernschritt" springt ueber ?start= direkt auf den
  // offenen Inhalt. Eine Runde ist so lang, wie das Level vorgibt.
  const startIndex = useMemo(() => {
    const parsed = Number(start);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(Math.floor(parsed), Math.max(items.length - 1, 0));
  }, [start, items.length]);

  const [windowStart, setWindowStart] = useState(startIndex);
  const [idx, setIdx] = useState(startIndex);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [meta, setMeta] = useState<AssessMeta | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [roundDone, setRoundDone] = useState(false);
  const [wins, setWins] = useState(0);

  const sessionEnd = Math.min(windowStart + ui.maxItemsPerSession, items.length);
  const sessionSize = Math.max(sessionEnd - windowStart, 1);
  const hasMore = sessionEnd < items.length;
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
      const key = source ? source.keyFor(word.ar) : `${categoryId}:${word.ar}`;
      addResult(key, r.total);
      if (r.total >= MASTERY_SCORE) setWins((count) => count + 1);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          r.total >= MASTERY_SCORE
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

  const beginRecording = () => {
    recordStartTimer.current = null;
    setPhase("listening");
    rec.start();
  };

  const runWord = () => {
    if (!word) return;
    if (recordStartTimer.current) clearTimeout(recordStartTimer.current);
    setResult(null);
    setErrMsg(null);
    if (ui.audioFirst) {
      // Level 5 und 6: erst hoeren, dann nachsprechen.
      setPhase("tts");
      speakArabic(word.ar, () => {
        recordStartTimer.current = setTimeout(beginRecording, 150);
      });
      return;
    }
    // Ab Level 7 liest das Kind selbst vor - kurze Lesezeit, dann Mikrofon.
    setPhase("ready");
    recordStartTimer.current = setTimeout(beginRecording, 900);
  };

  const listenAgain = () => {
    if (!word) return;
    stopSpeaking();
    speakArabic(word.ar);
  };

  useEffect(() => {
    if (!backendUrl || !word || roundDone) return;
    runWord();
    return () => {
      stopSpeaking();
      if (nextTimer.current) clearTimeout(nextTimer.current);
      if (recordStartTimer.current) clearTimeout(recordStartTimer.current);
      recordStartTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, backendUrl, roundDone]);

  // WS beim Screen-Mount vorwaermen -> erstes Wort zahlt keinen Connect-Preis.
  useEffect(() => {
    if (backendUrl) getStreamSession(backendUrl, backendToken).warmUp();
  }, [backendUrl, backendToken]);

  useEffect(() => {
    if (phase !== "result" || !result) return;
    if (result.total >= MASTERY_SCORE) {
      nextTimer.current = setTimeout(goNext, 1800);
    }
    return () => { if (nextTimer.current) clearTimeout(nextTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  const goNext = () => {
    stopSpeaking();
    if (idx + 1 >= sessionEnd) {
      setRoundDone(true);
      return;
    }
    setIdx(idx + 1);
  };

  const continueRound = () => {
    setWindowStart(sessionEnd);
    setIdx(sessionEnd);
    setWins(0);
    setResult(null);
    setRoundDone(false);
  };

  const insets = useSafeAreaInsets();
  const busy = phase === "tts" || phase === "ready" || phase === "listening" || phase === "processing";
  const footerPad = Math.max(insets.bottom, 12) + 8;

  if (!source) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.text }}>Übung unbekannt.</Text>
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

  // Rundenende: eine kurze Belohnung statt einer endlosen Liste (Anforderung 8,
  // "20-60 Sekunden pro Aufgabe" - eine Runde bleibt ueberschaubar).
  if (roundDone) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top", "left", "right"]}>
        <View style={[styles.center, styles.doneWrap]}>
          <StarBurst show />
          <PictureTile pic={wins >= sessionSize ? "🏆" : "🌟"} size={big ? 140 : 110} tone="primary" />
          <Text style={[styles.title, { color: c.text }]}>Runde fertig!</Text>
          <Text style={[styles.subMuted, { color: c.textMuted }]}>
            {wins} von {sessionSize} gut gesprochen
          </Text>
          <View style={styles.doneButtons}>
            {hasMore ? (
              <Pressable
                onPress={continueRound}
                style={({ pressed }) => [
                  styles.bigBtn,
                  { backgroundColor: c.primary },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="play" size={26} color={c.onPrimary} />
                <Text style={[styles.bigBtnText, { color: c.onPrimary }]}>Weiter üben</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.bigBtn,
                { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="home" size={26} color={c.text} />
              <Text style={[styles.bigBtnText, { color: c.text }]}>Fertig</Text>
            </Pressable>
          </View>
        </View>
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
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{source.emoji}</Text>
          <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>{source.title}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={[styles.progressBg, { backgroundColor: c.surfaceMuted }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: c.primary, width: `${((idx - windowStart + 1) / sessionSize) * 100}%` },
          ]}
        />
      </View>
      {/* Fuer die Jungsten zaehlen Sterne, keine Listenposition. */}
      <Text style={[styles.progressText, { color: c.textMuted }]}>
        {big ? "⭐".repeat(idx - windowStart + 1) : `${idx - windowStart + 1} / ${sessionSize}`}
      </Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.wordCard, { backgroundColor: c.surface, shadowColor: c.text }]}>
          {big ? (
            <PictureTile pic={word?.pic} fallback={source.emoji} size={120} tone="muted" />
          ) : null}
          <Text
            style={[big ? styles.arabicBig : styles.arabic, { color: c.text }]}
            allowFontScaling={false}
          >
            {word?.ar}
          </Text>
          <Text style={[styles.de, { color: c.text }]}>{word?.de}</Text>
          {ui.showTranslit && word?.translit ? (
            <Text style={[styles.translit, { color: c.textMuted }]}>{word.translit}</Text>
          ) : null}
        </View>

        <View style={styles.phaseWrap}>
          {phase === "tts" && (
            <View style={styles.phaseRow}>
              <Ionicons name="volume-high" size={30} color={c.info} />
              <Text style={[styles.phaseText, { color: c.info }]}>Hör gut zu…</Text>
            </View>
          )}
          {phase === "ready" && (
            <View style={styles.phaseRow}>
              <Ionicons name="book" size={30} color={c.info} />
              <Text style={[styles.phaseText, { color: c.info }]}>Lies vor…</Text>
            </View>
          )}
          {phase === "listening" && (
            <>
              <PulsingMic active level={rec.level} />
              <Text style={[styles.phaseText, { color: c.recording, marginTop: 10 }]}>Sprich jetzt!</Text>
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
            <StarBurst show={result.total >= MASTERY_SCORE} />
            <LetterFeedback
              units={result.units}
              transcription={result.transcription}
              density={ui.density}
            />
            <ScoreBar total={result.total} colors={c} />
            {showDiagnostics ? (
              <>
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
              </>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Anhoeren, Nochmal und Weiter sind jederzeit erreichbar (Anforderung 7:
          "Wiederholen-Button ist immer sofort erreichbar"). */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.surface,
            borderTopColor: c.border,
            shadowColor: c.text,
            paddingBottom: footerPad,
          },
        ]}
      >
        <FooterButton
          icon="volume-high"
          label="Hören"
          onPress={listenAgain}
          background={c.surfaceMuted}
          border={c.border}
          color={c.text}
          big={big}
        />
        <FooterButton
          icon="mic"
          label="Nochmal"
          onPress={() => { setResult(null); runWord(); }}
          disabled={busy}
          background={c.surfaceMuted}
          border={c.border}
          color={c.text}
          big={big}
        />
        <FooterButton
          icon="arrow-forward"
          label="Weiter"
          onPress={goNext}
          disabled={busy}
          background={c.primary}
          color={c.onPrimary}
          big={big}
        />
      </View>
    </SafeAreaView>
  );
}

function FooterButton({
  icon, label, onPress, disabled, background, border, color, big,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  background: string;
  border?: string;
  color: string;
  big: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.footerBtn,
        big && styles.footerBtnBig,
        { backgroundColor: background },
        border ? { borderWidth: 1, borderColor: border } : null,
        disabled && { opacity: 0.5 },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={big ? 30 : 22} color={color} />
      <Text style={[styles.footerBtnText, big && styles.footerBtnTextBig, { color }]}>{label}</Text>
    </Pressable>
  );
}

function ScoreBar({ total, colors }: { total: number; colors: ThemePalette }) {
  const t = Math.round(total);
  const tone = t >= MASTERY_SCORE ? colors.good : t >= 50 ? colors.medium : colors.bad;
  const label = t >= MASTERY_SCORE ? "🌟 Sehr gut!" : t >= 50 ? "🙂 Fast!" : "💪 Nochmal!";
  return (
    <View style={{ width: "100%", marginTop: 12 }}>
      <View style={{ height: 12, backgroundColor: colors.surfaceMuted, borderRadius: 6, overflow: "hidden" }}>
        <View style={{ width: `${t}%`, height: "100%", backgroundColor: tone.base }} />
      </View>
      <Text
        style={{
          textAlign: "center",
          fontSize: 18,
          fontWeight: "700",
          marginTop: 6,
          color: tone.text,
        }}
      >
        {label}
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
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  subMuted: { textAlign: "center", marginTop: 6 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  primaryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 24,
  },
  primaryBtnText: { fontWeight: "700" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  headerEmoji: { fontSize: 24 },
  headerTitle: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
  progressBg: {
    height: 10, marginHorizontal: 20,
    borderRadius: 5, overflow: "hidden",
  },
  progressFill: { height: "100%" },
  progressText: { textAlign: "center", fontSize: 13, marginTop: 4 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  wordCard: {
    width: "100%",
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 4,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  arabic: { fontSize: 72, lineHeight: 96, writingDirection: "rtl", textAlign: "center" },
  arabicBig: { fontSize: 96, lineHeight: 128, writingDirection: "rtl", textAlign: "center" },
  de: { fontSize: 18, marginTop: 4, fontWeight: "600", textAlign: "center" },
  translit: { fontStyle: "italic", fontSize: 15 },
  phaseWrap: { marginTop: 20, alignItems: "center", minHeight: 120, justifyContent: "center" },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  phaseText: { fontSize: 19, fontWeight: "600" },
  resultCard: {
    marginTop: 16,
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
  doneWrap: { flex: 1, gap: 14 },
  doneButtons: { alignSelf: "stretch", gap: 12, marginTop: 10 },
  bigBtn: {
    minHeight: 64,
    borderRadius: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  bigBtnText: { fontSize: 18, fontWeight: "800" },
  footer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  footerBtn: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 12,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  footerBtnBig: { minHeight: 72, borderRadius: 36 },
  footerBtnText: { fontWeight: "700", fontSize: 13 },
  footerBtnTextBig: { fontSize: 15 },

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
