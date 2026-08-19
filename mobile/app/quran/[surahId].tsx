import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { SURAHS } from "@/data/juzamma";
import { useBackend } from "@/store/useBackend";
import { useProgress } from "@/store/useProgress";
import { useTheme } from "@/store/useTheme";
import type { ThemePalette } from "@/store/profileModel";
import { speakArabic, stopSpeaking } from "@/lib/tts";
import { useAyahRecorder } from "@/hooks/useAyahRecorder";
import {
  getStreamSession,
  type AyahProgress,
  type AyahWordEvent,
  type AyahClientTimings,
  type AyahDoneEvent,
} from "@/lib/stream";
import { WordChip, type WordChipState } from "@/components/WordChip";
import { PulsingMic } from "@/components/PulsingMic";
import { StarBurst } from "@/components/StarBurst";
import { DebugOverlay } from "@/components/DebugOverlay";
import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";
import { useDebug } from "@/store/useDebug";

type Phase = "idle" | "tts" | "listening" | "scoring" | "result" | "error";

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicNumber = (n: number) =>
  String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("");

function stateFromScore(score: number): WordChipState {
  if (score >= 75) return "good";
  if (score >= 50) return "medium";
  return "bad";
}

function DiagLine({
  label, value, extra, bold, muted, colors,
}: {
  label: string;
  value: string;
  extra?: string;
  bold?: boolean;
  muted?: boolean;
  colors: ThemePalette;
}) {
  const tint = muted ? colors.textMuted : colors.text;
  return (
    <View style={styles.diagRow}>
      <Text style={[styles.diagLabel, { color: colors.textMuted }, muted && styles.diagMuted]}>
        {label}
      </Text>
      <Text style={[styles.diagValue, { color: tint }, bold && styles.diagBold, muted && styles.diagMuted]}>
        {value}{extra ? `  · ${extra}` : ""}
      </Text>
    </View>
  );
}

export default function QuranAyahScreen() {
  const { surahId } = useLocalSearchParams<{ surahId: string }>();
  const router = useRouter();
  const c = useTheme();
  const backendUrl = useBackend((s) => s.url);
  const backendToken = useBackend((s) => s.token);
  const addResult  = useProgress((s) => s.addResult);
  const insets = useSafeAreaInsets();

  const surah = useMemo(
    () => SURAHS.find((s) => s.n === Number(surahId)),
    [surahId],
  );

  // Nur Sprech-Ayat: die synthetische Basmala (n=0) ueberspringen.
  const ayat = useMemo(() => surah?.ayat.filter((a) => a.n > 0) ?? [], [surah]);
  const [ayahIdx, setAyahIdx] = useState(0);
  const ayah = ayat[ayahIdx];

  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [totalScore, setTotalScore] = useState<number | null>(null);
  const [serverMs, setServerMs] = useState<number | null>(null);
  const [timings, setTimings] = useState<{
    done?: AyahDoneEvent;
    client?: AyahClientTimings;
    mode: "ws" | null;
  }>({ mode: null });

  // wordStates: parallel zu ayah.words, Zustand + optional Score
  const [wordStates, setWordStates] = useState<
    Array<{ state: WordChipState; score?: number; units?: AyahWordEvent["units"] }>
  >([]);

  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneOnceRef = useRef<boolean>(false);

  // Beim Screen-Mount: WS vorwaermen (spart 300-500ms bei der ersten Ayah).
  useEffect(() => {
    if (backendUrl) {
      getStreamSession(backendUrl, backendToken).warmUp();
    }
    return () => {
      stopSpeaking();
      if (nextTimer.current) clearTimeout(nextTimer.current);
    };
  }, [backendUrl, backendToken]);

  // Bei Wechsel der Ayah: States zuruecksetzen.
  useEffect(() => {
    if (!ayah) return;
    setPhase("idle");
    setErrMsg(null);
    setTotalScore(null);
    setServerMs(null);
    setTimings({ mode: null });
    setWordStates(ayah.words.map(() => ({ state: "pending" })));
    doneOnceRef.current = false;
  }, [ayah]);

  // ------- Aufnahme + Bewertung -------
  const onRecordingStop = useCallback(async (uri: string | null) => {
    if (!ayah) return;
    useDebug.getState().push("rec_stop", uri ? `Aufnahme fertig ${uri.split("/").pop()}` : "Aufnahme leer");
    if (!uri) {
      setErrMsg("Keine Aufnahme empfangen.");
      setPhase("error");
      return;
    }
    setPhase("scoring");
    // Alle Woerter auf 'scanning' -> UI zeigt Shimmer / Erwartung
    setWordStates(ayah.words.map(() => ({ state: "scanning" })));

    const ayahText = ayah.words.map((w) => w.ar).join(" ");
    const key = (idx: number) => `quran:${surah?.n}:${ayah.n}:${ayah.words[idx]?.ar}`;

    const applyWord = (ev: AyahWordEvent) => {
      setWordStates((prev) => {
        const next = [...prev];
        if (ev.word_idx < 0 || ev.word_idx >= next.length) return next;
        next[ev.word_idx] = {
          state: stateFromScore(ev.score),
          score: ev.score,
          units: ev.units,
        };
        return next;
      });
      // Punkte pro Wort direkt gutschreiben (persistenter Fortschritt).
      addResult(key(ev.word_idx), ev.score);
      if (Platform.OS !== "web") {
        Haptics.selectionAsync().catch(() => {});
      }
    };

    // WS-Weg mit progressivem Streaming (einziger Pfad, HTTP entfernt).
    if (!backendUrl) {
      setErrMsg("Backend-URL fehlt.");
      setPhase("error");
      return;
    }
    try {
      const session = getStreamSession(backendUrl, backendToken);
      const { done, client } = await session.assessAyah(uri, ayahText, (ev: AyahProgress) => {
        if (ev.kind === "word") applyWord(ev);
      });
      setTotalScore(done.total);
      setServerMs(done.duration_ms);
      setTimings({ done, client, mode: "ws" });
      setPhase("result");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          done.total >= 75
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        ).catch(() => {});
      }
    } catch (e: any) {
      useDebug.getState().push("ws_error", `WS gescheitert: ${e?.message ?? e}`);
      setErrMsg(e?.message ?? "WebSocket-Fehler.");
      setPhase("error");
    }
  }, [ayah, backendUrl, surah, addResult]);

  const rec = useAyahRecorder(onRecordingStop);

  const startRecord = useCallback(() => {
    if (!ayah) return;
    setErrMsg(null);
    setTotalScore(null);
    setServerMs(null);
    setWordStates(ayah.words.map(() => ({ state: "pending" })));
    setPhase("listening");
    useDebug.getState().push("rec_start", `Ayah ${ayah.n} · ${ayah.words.length} Wörter`);
    rec.start();
  }, [ayah, rec]);

  // Auto-Start: 500ms nach Ayah-Load lauscht die App automatisch. Kein Button noetig.
  // Der Recorder wartet intern (useAyahRecorder) auf Sprach-Onset via VAD-Metering und
  // stoppt automatisch bei 700ms Stille -> "ambient" UX, wie beim Wort-Modus.
  useEffect(() => {
    if (!ayah || !backendUrl) return;
    if (phase !== "idle") return;
    const t = setTimeout(() => {
      if (phase === "idle") startRecord();
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayah, backendUrl, phase]);

  const listenTts = useCallback(() => {
    if (!ayah || phase === "scoring") return;
    if (phase === "listening") rec.stop();
    setPhase("tts");
    const t = ayah.words.map((w) => w.ar).join(" ");
    speakArabic(t, () => setPhase("idle"));
  }, [ayah, phase, rec]);

  // Auto-Next bei sehr gutem Ergebnis
  useEffect(() => {
    if (phase !== "result" || totalScore == null) return;
    if (totalScore >= 85 && !doneOnceRef.current) {
      doneOnceRef.current = true;
      nextTimer.current = setTimeout(() => goNext(), 1800);
    }
    return () => { if (nextTimer.current) clearTimeout(nextTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, totalScore]);

  const goNext = () => {
    if (!ayat.length) { router.back(); return; }
    if (ayahIdx >= ayat.length - 1) { router.back(); return; }
    setAyahIdx(ayahIdx + 1);
  };
  const goPrev = () => {
    if (ayahIdx <= 0) return;
    setAyahIdx(ayahIdx - 1);
  };

  // ------- Guards -------
  if (!surah) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.headline, { color: c.text }]}>Sura nicht gefunden.</Text>
        <Pressable onPress={() => router.back()} style={[styles.primaryBtn, { backgroundColor: c.primary }]}>
          <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Zurück</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!backendUrl) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.headline, { color: c.text }]}>Backend fehlt</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>
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
  if (!ayah) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.headline, { color: c.text }]}>Keine Verse verfügbar.</Text>
      </SafeAreaView>
    );
  }

  const busy = phase === "listening" || phase === "scoring" || phase === "tts";
  const percent = ((ayahIdx + 1) / ayat.length) * 100;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top", "left", "right"]}>
      {/* Header */}
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
          <Text style={[styles.headerAr, { color: c.text }]} allowFontScaling={false}>
            سُورَة {surah.name_ar}
          </Text>
          <Text style={[styles.headerMeta, { color: c.textMuted }]}>
            {surah.translit} · Vers {ayahIdx + 1} / {ayat.length}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.progressBg, { backgroundColor: c.surfaceMuted }]}>
        <View style={[styles.progressFill, { backgroundColor: c.good.base, width: `${percent}%` }]} />
      </View>

      <NetworkStatusBadge />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Ayah-Karte */}
        <View style={[styles.ayahCard, { backgroundColor: c.surface, borderColor: c.border, shadowColor: c.text }]}>
          <View style={styles.ayahHeader}>
            <View style={[styles.ayahBadge, { backgroundColor: c.surfaceMuted, borderColor: c.primary }]}>
              <Text style={[styles.ayahBadgeText, { color: c.primary }]}>{toArabicNumber(ayah.n)}</Text>
            </View>
            <Text style={[styles.ayahHeaderText, { color: c.textMuted }]}>Vers</Text>
          </View>

          <View style={styles.ayahWordsWrap}>
            {ayah.words.map((w, i) => {
              const st = wordStates[i]?.state ?? "pending";
              const sc = wordStates[i]?.score;
              return (
                <WordChip
                  key={`${w.ar}-${i}`}
                  word={w.ar}
                  state={st}
                  score={sc}
                />
              );
            })}
          </View>
        </View>

        {/* Zustandsblock */}
        <View style={styles.phaseWrap}>
          {phase === "idle" && (
            <Text style={[styles.hint, { color: c.text }]}>Ich höre gleich zu — rezitiere einfach los.</Text>
          )}
          {phase === "tts" && (
            <View style={styles.row}>
              <Ionicons name="volume-high" size={22} color={c.info} />
              <Text style={[styles.hint, { color: c.info }]}>Hör gut zu…</Text>
            </View>
          )}
          {phase === "listening" && (
            <>
              <PulsingMic active level={rec.level} />
              <Text style={[styles.hint, { color: c.recording, marginTop: 12 }]}>
                Ich höre dir zu…
              </Text>
              <Text style={[styles.hintSub, { color: c.textMuted, marginTop: 4 }]}>
                Ich stoppe automatisch, wenn du fertig bist.
              </Text>
            </>
          )}
          {phase === "scoring" && (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={c.scanning.base} />
              <Text style={[styles.hint, { color: c.scanning.text }]}>Bewertung läuft…</Text>
            </View>
          )}
          {phase === "result" && totalScore != null && (
            <View style={styles.resultBlock}>
              <StarBurst show={totalScore >= 75} />
              <Text style={[styles.scoreBig, { color: c.text }]}>{Math.round(totalScore)}</Text>
              <Text style={[styles.scoreLabel, { color: c.text }]}>
                {totalScore >= 90 ? "Ma šāʾ Allāh!" :
                 totalScore >= 75 ? "Sehr gut!"     :
                 totalScore >= 50 ? "Noch mal üben." : "Versuch es nochmal."}
              </Text>
              <View style={styles.modeRow}>
                <View
                  style={[
                    styles.modeChip,
                    timings.mode === "ws"
                      ? { backgroundColor: c.scanning.bg, borderColor: c.scanning.border }
                      : { backgroundColor: c.pending.bg, borderColor: c.pending.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      { color: timings.mode === "ws" ? c.scanning.text : c.pending.text },
                    ]}
                  >
                    {timings.mode === "ws" ? "⚡ WebSocket-Stream" : "?"}
                  </Text>
                </View>
                {serverMs != null && (
                  <Text style={[styles.metaText, { color: c.textMuted }]}>Server {serverMs} ms</Text>
                )}
              </View>

              {/* Latenz-Analyse — immer sichtbar wenn irgendein Timing da ist */}
              {(timings.client || timings.done?.timings) && (
                <View style={[styles.diagBox, { backgroundColor: c.background, borderColor: c.border }]}>
                  <Text style={[styles.diagTitle, { color: c.text }]}>Latenz-Analyse</Text>
                  <DiagLine label="Modus"                value={timings.mode ?? "?"} bold colors={c} />
                  {timings.client && (
                    <>
                      <DiagLine label="Audio (Handy → Bytes)"    value={`${timings.client.bytes_read_ms} ms`} extra={`${Math.round((timings.client.bytes ?? 0) / 1024)} KB`} colors={c} />
                      <DiagLine label="WS send-Aufruf"           value={`${timings.client.ws_send_ms} ms`} colors={c} />
                      <DiagLine label="→ Erstes Server-Frame"    value={`${timings.client.first_frame_ms} ms`} bold colors={c} />
                      <DiagLine label="→ Letztes Frame (done)"   value={`${timings.client.last_frame_ms} ms`} bold colors={c} />
                    </>
                  )}
                  {timings.done?.timings && (
                    <>
                      <DiagLine label="Audio-Länge (Kind spricht)" value={`${timings.done.timings.audio_ms ?? "?"} ms`} colors={c} />
                      <DiagLine label="Bytes empfangen (Server)"   value={`${timings.done.timings.bytes_recv_ms ?? "?"} ms`} colors={c} />
                      <DiagLine label="Preprocess (CPU)"           value={`${timings.done.timings.preprocess_ms} ms`} colors={c} />
                      <DiagLine label="ASR (GPU)"                  value={`${timings.done.timings.asr_ms} ms`} bold colors={c} />
                      <DiagLine label="Forced-Align"               value={`${timings.done.timings.align_ms} ms`} colors={c} />
                      <DiagLine label="Wort-Scoring"               value={`${timings.done.timings.score_ms} ms`} colors={c} />
                    </>
                  )}
                  {!timings.done?.timings && (
                    <Text style={[styles.diagMutedNote, { color: c.textMuted }]}>
                      Server-Timings fehlen — vermutlich WS-Fehler vor dem done-Frame.
                    </Text>
                  )}
                </View>
              )}

              {!timings.client && !timings.done?.timings && (
                <Text style={[styles.diagMutedNote, { color: c.textMuted }]}>
                  Keine Timings verfügbar (weder Client noch Server).
                </Text>
              )}
            </View>
          )}
          {phase === "error" && (
            <View style={styles.row}>
              <Ionicons name="warning" size={20} color={c.bad.base} />
              <Text style={[styles.hint, { color: c.bad.text }]}>{errMsg}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Debug-Overlay: zeigt Modus + letzte Events, antippen für Detail-Log */}
      <DebugOverlay />

      {/* Aktions-Leiste */}
      <View
        style={[
          styles.actionBar,
          { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: 12 + insets.bottom },
        ]}
      >
        <Pressable
          onPress={goPrev}
          disabled={busy || ayahIdx <= 0}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.surfaceMuted },
            (busy || ayahIdx <= 0) && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={c.text} />
        </Pressable>

        <Pressable
          onPress={listenTts}
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.surfaceMuted },
            busy && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="volume-high" size={22} color={c.info} />
          <Text style={[styles.secondaryText, { color: c.text }]}>Anhören</Text>
        </Pressable>

        {phase === "listening" ? (
          <Pressable
            onPress={rec.stop}
            style={({ pressed }) => [
              styles.primaryBtnBig,
              { backgroundColor: c.good.base },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="checkmark" size={26} color={c.onPrimary} />
            <Text style={[styles.primaryBtnBigText, { color: c.onPrimary }]}>Fertig</Text>
          </Pressable>
        ) : phase === "result" || phase === "error" ? (
          <Pressable
            onPress={startRecord}
            style={({ pressed }) => [
              styles.primaryBtnBig,
              { backgroundColor: c.recording },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="refresh" size={24} color={c.onPrimary} />
            <Text style={[styles.primaryBtnBigText, { color: c.onPrimary }]}>Nochmal</Text>
          </Pressable>
        ) : (
          <View style={[styles.primaryBtnBig, { backgroundColor: c.surfaceMuted }]}>
            <ActivityIndicator size="small" color={c.pending.text} />
            <Text style={[styles.primaryBtnBigText, { color: c.pending.text }]}>
              {phase === "tts" ? "Höre zu…" : phase === "scoring" ? "Bewertung…" : "Bereit"}
            </Text>
          </View>
        )}

        <Pressable
          onPress={goNext}
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.surfaceMuted },
            busy && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-forward" size={20} color={c.text} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerAr: { fontSize: 20, fontWeight: "700", writingDirection: "rtl" },
  headerMeta: { fontSize: 12, marginTop: 2 },

  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  pressed: { opacity: 0.75 },

  progressBg: {
    height: 6,
    marginHorizontal: 16, marginTop: 4, borderRadius: 3, overflow: "hidden",
  },
  progressFill: { height: 6 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 20, alignItems: "stretch" },

  ayahCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  ayahHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  ayahBadge: {
    minWidth: 32, height: 32, borderRadius: 16,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 8,
  },
  ayahBadgeText: { fontWeight: "800", fontSize: 14 },
  ayahHeaderText: { fontSize: 13 },

  ayahWordsWrap: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingVertical: 6,
  },

  phaseWrap: {
    marginTop: 22,
    alignItems: "center",
    minHeight: 120,
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { fontSize: 15, textAlign: "center" },
  hintSub: { fontSize: 12, textAlign: "center" },

  resultBlock: { alignItems: "center", position: "relative" },
  scoreBig: { fontSize: 56, fontWeight: "900", letterSpacing: -1 },
  scoreLabel: { fontSize: 16, fontWeight: "600", marginTop: 4 },
  metaText: { fontSize: 11, marginTop: 4, fontWeight: "600" },

  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  modeChipText: { fontSize: 12, fontWeight: "800" },
  diagMutedNote: { fontStyle: "italic", fontSize: 11, marginTop: 6, textAlign: "center" },

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
  diagMuted: { fontStyle: "italic" },

  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryText: { fontSize: 14, fontWeight: "700" },
  primaryBtnBig: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
  },
  primaryBtnBigText: { fontSize: 16, fontWeight: "800" },
  btnDisabled: { opacity: 0.4 },

  headline: { fontSize: 20, fontWeight: "800", marginBottom: 8 },
  sub: { textAlign: "center", marginBottom: 16 },
  primaryBtn: {
    marginTop: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 14,
  },
  primaryBtnText: { fontWeight: "800", fontSize: 16 },
});
