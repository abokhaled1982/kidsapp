import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { MotiView, MotiText } from "moti";
import { ChevronLeft, Volume2, RotateCcw, Play } from "lucide-react-native";

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
        if (r.total >= 75) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
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
      }, 350);
    });
  };

  useEffect(() => {
    if (!backendUrl) return;
    if (!word) return;
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
      nextTimer.current = setTimeout(() => {
        goNext();
      }, 1800);
    }
    return () => { if (nextTimer.current) clearTimeout(nextTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  const goNext = () => {
    if (idx >= items.length - 1) {
      router.back();
      return;
    }
    setIdx(idx + 1);
  };

  if (!category) {
    return (
      <SafeAreaView className="flex-1 bg-paper-50 items-center justify-center">
        <Text className="font-body text-ink-700">Kategorie unbekannt.</Text>
      </SafeAreaView>
    );
  }

  if (!backendUrl) {
    return (
      <SafeAreaView className="flex-1 bg-paper-50 items-center justify-center px-8">
        <Text className="font-display text-xl text-ink-900 text-center">Erst Backend einrichten</Text>
        <Text className="font-body text-ink-500 text-center mt-2">
          Öffne die Einstellungen und trage die Colab-URL ein.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/settings" as any)}
          className="mt-4 px-6 py-3 rounded-xl2 bg-brand-500"
          style={{ borderRadius: 22 }}
        >
          <Text className="text-white font-display">Zu den Einstellungen</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper-50" edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-2">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full bg-white border border-ink-300/40 items-center justify-center">
          <ChevronLeft size={22} color="#334155" />
        </TouchableOpacity>
        <View className="flex-row items-center gap-2">
          <Text className="text-2xl">{category.emoji}</Text>
          <Text className="font-display text-lg text-ink-900">{category.title}</Text>
        </View>
        <View className="w-10" />
      </View>

      {/* Progress bar */}
      <View className="mx-5 h-2 bg-ink-300/40 rounded-full overflow-hidden">
        <View className="h-full bg-brand-500" style={{ width: `${((idx + 1) / items.length) * 100}%` }} />
      </View>
      <Text className="text-center font-body text-xs text-ink-500 mt-1">Wort {idx + 1} / {items.length}</Text>

      {/* Word display */}
      <View className="flex-1 justify-center items-center px-6">
        <MotiView
          key={`word-${idx}`}
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 12 }}
          className="items-center"
        >
          <Text
            className="font-ar text-[92px] leading-[110px] text-ink-900"
            style={{ writingDirection: "rtl" }}
          >
            {word?.ar}
          </Text>
          <Text className="font-body text-ink-500 text-lg mt-1">{word?.de}</Text>
          {word?.translit ? (
            <Text className="font-body text-ink-500 text-sm mt-1 italic">{word.translit}</Text>
          ) : null}
        </MotiView>

        {/* Phase-Indikator */}
        <View className="mt-10 items-center">
          {phase === "tts" && (
            <View className="flex-row items-center gap-3">
              <Volume2 size={28} color="#2563eb" />
              <Text className="font-body text-brand-600 text-lg">Hör gut zu…</Text>
            </View>
          )}
          {phase === "listening" && (
            <>
              <PulsingMic active level={rec.level} />
              <Text className="font-body text-bad-500 mt-3 text-lg">Sprich das Wort!</Text>
            </>
          )}
          {phase === "processing" && (
            <View className="items-center">
              <ActivityIndicator size="large" color="#2563eb" />
              <Text className="font-body text-ink-500 mt-2">Bewertung…</Text>
            </View>
          )}
          {phase === "error" && (
            <View className="items-center">
              <Text className="font-body text-bad-500 text-center">{errMsg}</Text>
              <TouchableOpacity onPress={runWord} className="mt-4 px-6 py-3 rounded-xl2 bg-brand-500" style={{ borderRadius: 22 }}>
                <Text className="text-white font-display">Nochmal versuchen</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Ergebnis-Karte */}
        {phase === "result" && result && (
          <MotiView
            from={{ opacity: 0, translateY: 20, scale: 0.95 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            transition={{ type: "spring", damping: 14 }}
            className="mt-6 w-full items-center relative"
          >
            <StarBurst show={result.total >= 75} />
            <LetterFeedback units={result.units} />
            <Text className="font-body text-ink-500 mt-1">
              Du hast gesagt:{" "}
              <MotiText className="font-ar text-2xl text-ink-900" style={{ writingDirection: "rtl" }}>
                {result.transcription || "—"}
              </MotiText>
            </Text>
            <ScoreBar total={result.total} />
          </MotiView>
        )}
      </View>

      {/* Footer-Aktionen */}
      <View className="px-5 pb-6 flex-row gap-3">
        <TouchableOpacity
          onPress={() => { setResult(null); runWord(); }}
          className="flex-1 py-4 rounded-xl2 bg-white border border-ink-300/40 items-center flex-row justify-center gap-2"
          style={{ borderRadius: 22 }}
        >
          <RotateCcw size={20} color="#334155" />
          <Text className="font-display text-ink-900">Nochmal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goNext}
          disabled={phase === "tts" || phase === "listening" || phase === "processing"}
          className="flex-1 py-4 rounded-xl2 bg-good-500 items-center flex-row justify-center gap-2"
          style={{ borderRadius: 22, opacity: phase === "listening" || phase === "processing" ? 0.5 : 1 }}
        >
          <Play size={20} color="white" />
          <Text className="text-white font-display">Weiter</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function ScoreBar({ total }: { total: number }) {
  const t = Math.round(total);
  const color = t >= 75 ? "bg-good-500" : t >= 50 ? "bg-mid-500" : "bg-bad-500";
  const label = t >= 75 ? "🌟 Sehr gut!" : t >= 50 ? "🙂 Fast!" : "💪 Nochmal!";
  return (
    <View className="w-full mt-4">
      <View className="h-3 bg-ink-300/40 rounded-full overflow-hidden">
        <MotiView
          className={`h-full ${color}`}
          from={{ width: "0%" }}
          animate={{ width: `${t}%` }}
          transition={{ type: "timing", duration: 500 }}
        />
      </View>
      <Text className="text-center font-display text-lg mt-2">{label} {t} / 100</Text>
    </View>
  );
}
