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
import { useLiveKitTurn, isCancelled } from "@/hooks/useLiveKitTurn";
import {
  type AyahProgress,
  type AyahWordEvent,
  type AyahDoneEvent,
  type TurnTimings,
} from "@/lib/livekit-stream";
import { WordChip, type WordChipState } from "@/components/WordChip";
import { PulsingMic } from "@/components/PulsingMic";
import { StarBurst } from "@/components/StarBurst";
import { DebugOverlay } from "@/components/DebugOverlay";
import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";
import { useDebug } from "@/store/useDebug";

// "connecting" ist neu: der Agent laeuft auf Modal und darf kalt starten.
type Phase = "idle" | "connecting" | "tts" | "listening" | "scoring" | "result" | "error";

// Kurzes Durchatmen, bevor das Mikrofon aufgeht - das Kind soll die Ayah erst
// sehen. Vorher war das ein Timer vor dem Aufnahmestart.
const READY_MS = 500;

// Falls expo-speech den Callback verschluckt, darf "Anhören" nicht haengen.
const TTS_GUARD_MS = 15000;

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
  const tokenEndpoint = useBackend((s) => s.tokenEndpoint);
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

  const turn = useLiveKitTurn();

  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [totalScore, setTotalScore] = useState<number | null>(null);
  const [serverMs, setServerMs] = useState<number | null>(null);
  // "ttsBusy" ist die einzige Phase, die nicht vom Transport kommt: das
  // Anhoeren-Knopf-Vorspielen laeuft ausserhalb einer Bewertungsrunde.
  const [ttsBusy, setTtsBusy] = useState(false);
  const [timings, setTimings] = useState<{
    done?: AyahDoneEvent;
    client?: TurnTimings;
  }>({});

  // wordStates: parallel zu ayah.words, Zustand + optional Score
  const [wordStates, setWordStates] = useState<
    Array<{ state: WordChipState; score?: number; units?: AyahWordEvent["units"] }>
  >([]);

  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneOnceRef = useRef<boolean>(false);

  // Die Phase ist abgeleitet: den Rundenverlauf kennt der Transport (der Agent
  // endpointet serverseitig), das Ergebnis dieser Screen.
  const phase: Phase =
    ttsBusy ? "tts" :
    turn.status === "connecting" ? "connecting" :
    turn.status === "reading" ? "idle" :
    turn.status === "listening" ? "listening" :
    turn.status === "scoring" ? "scoring" :
    errMsg ? "error" :
    totalScore != null ? "result" :
    // Runde vorbei, Ergebnis noch nicht im State: nicht kurz auf "idle" springen.
    turn.status === "done" ? "scoring" : "idle";

  // Verbindung beim Screen-Mount vorwaermen (spart Connect + Modal-Kaltstart).
  useEffect(() => {
    turn.warmUp();
  }, [turn.warmUp]);

  // Bei Wechsel der Ayah: States zuruecksetzen.
  useEffect(() => {
    if (!ayah) return;
    setErrMsg(null);
    setTotalScore(null);
    setServerMs(null);
    setTimings({});
    setWordStates(ayah.words.map(() => ({ state: "pending" })));
    doneOnceRef.current = false;
  }, [ayah]);

  // Sobald der Agent das Sprachende erkannt hat: alle Chips auf 'scanning'.
  // Die word-Frames faerben sie danach einzeln um.
  useEffect(() => {
    if (turn.status !== "scoring" || !ayah) return;
    setWordStates(ayah.words.map(() => ({ state: "scanning" })));
  }, [turn.status, ayah]);

  // ------- Bewertung -------
  const recite = useCallback(async () => {
    if (!ayah) return;
    setErrMsg(null);
    setTotalScore(null);
    setServerMs(null);
    setWordStates(ayah.words.map(() => ({ state: "pending" })));

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

    useDebug.getState().push("rec_start", `Ayah ${ayah.n} · ${ayah.words.length} Wörter`);
    try {
      const { done, timings: client } = await turn.runAyah(
        ayahText,
        (ev: AyahProgress) => {
          if (ev.kind === "word") applyWord(ev);
        },
        { kind: "wait", ms: READY_MS },
      );
      setTotalScore(done.total);
      setServerMs(done.duration_ms);
      setTimings({ done, client });
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          done.total >= 75
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        ).catch(() => {});
      }
    } catch (e: any) {
      if (isCancelled(e)) return;
      useDebug.getState().push("lk_error", `Bewertung gescheitert: ${e?.message ?? e}`);
      setErrMsg(e?.message ?? "Verbindungsfehler.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayah, surah, addResult, turn.runAyah]);

  const retry = useCallback(() => {
    // Laufende Runde abbrechen, sonst wartet die neue bis zum Timeout.
    turn.cancel();
    recite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recite]);

  // Auto-Start: die App hoert von sich aus zu, sobald die Ayah steht. Kein
  // Knopf noetig - der Vorspann (READY_MS) haelt das Mikrofon kurz zu.
  //
  // Bewusst ohne Status-Guard: nach einer Runde bleibt turn.status auf "done",
  // ein Guard darauf wuerde die naechste Ayah nie starten. Stattdessen bricht
  // der Cleanup die alte Runde ab, wenn das Kind vorher weiterblaettert.
  useEffect(() => {
    if (!ayah || !tokenEndpoint) return;
    recite();
    return () => {
      stopSpeaking();
      turn.cancel();
      if (nextTimer.current) clearTimeout(nextTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayah, tokenEndpoint]);

  const listenTts = useCallback(() => {
    if (!ayah) return;
    // Waehrend des Vorspielens darf keine Runde laufen, sonst bewertet der
    // Agent die Sprachausgabe.
    turn.cancel();
    setTtsBusy(true);
    const t = ayah.words.map((w) => w.ar).join(" ");
    // Notbremse: bleibt der TTS-Callback aus, waere die Leiste dauerhaft
    // gesperrt (busy enthaelt "tts").
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTtsBusy(false);
    };
    const guard = setTimeout(finish, TTS_GUARD_MS);
    speakArabic(t, () => {
      clearTimeout(guard);
      finish();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayah]);

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
  if (!tokenEndpoint) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.headline, { color: c.text }]}>Backend fehlt</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>
          Öffne die Einstellungen und trage den Modal-Token-Endpoint ein.
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

  const busy =
    phase === "connecting" || phase === "listening" || phase === "scoring" || phase === "tts";
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
          {phase === "connecting" && (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={c.pending.text} />
              <Text style={[styles.hint, { color: c.pending.text }]}>Verbinde…</Text>
            </View>
          )}
          {phase === "tts" && (
            <View style={styles.row}>
              <Ionicons name="volume-high" size={22} color={c.info} />
              <Text style={[styles.hint, { color: c.info }]}>Hör gut zu…</Text>
            </View>
          )}
          {phase === "listening" && (
            <>
              <PulsingMic active level={turn.level} />
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
                    { backgroundColor: c.scanning.bg, borderColor: c.scanning.border },
                  ]}
                >
                  <Text style={[styles.modeChipText, { color: c.scanning.text }]}>
                    🎙️ LiveKit-Stream
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
                  <DiagLine label="Modus" value="LiveKit" bold colors={c} />
                  {timings.client && (
                    <>
                      <DiagLine
                        label="Verbindung"
                        value={timings.client.warm ? "warm" : `${timings.client.connect_ms} ms (Connect)`}
                        colors={c}
                      />
                      <DiagLine
                        label="Agent bereit"
                        value={`${timings.client.ready_ms} ms`}
                        extra={timings.client.ready_ms > 2000 ? "Kaltstart" : undefined}
                        colors={c}
                      />
                      <DiagLine label="Kind rezitiert (bis VAD)" value={`${timings.client.listen_ms} ms`} colors={c} />
                      <DiagLine label="→ Erstes Wort-Frame"      value={`${timings.client.score_ms} ms`} bold colors={c} />
                      <DiagLine label="→ Rest des Streams"       value={`${timings.client.stream_ms} ms`} bold colors={c} />
                    </>
                  )}
                  {timings.done?.timings && (
                    <>
                      <DiagLine label="Audio-Länge (Kind spricht)" value={`${timings.done.timings.audio_ms ?? "?"} ms`} colors={c} />
                      <DiagLine label="Preprocess (CPU)"           value={`${timings.done.timings.preprocess_ms} ms`} colors={c} />
                      <DiagLine label="ASR (ONNX INT8)"            value={`${timings.done.timings.asr_ms} ms`} bold colors={c} />
                      <DiagLine label="Forced-Align"               value={`${timings.done.timings.align_ms} ms`} colors={c} />
                      <DiagLine label="Wort-Scoring"               value={`${timings.done.timings.score_ms} ms`} colors={c} />
                    </>
                  )}
                  {!timings.done?.timings && (
                    <Text style={[styles.diagMutedNote, { color: c.textMuted }]}>
                      Server-Timings fehlen — vermutlich Abbruch vor dem done-Frame.
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
            onPress={turn.flush}
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
            onPress={retry}
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
              {phase === "tts"
                ? "Höre zu…"
                : phase === "connecting"
                  ? "Verbinde…"
                  : phase === "scoring"
                    ? "Bewertung…"
                    : "Bereit"}
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
