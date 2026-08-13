import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { SURAHS } from "@/data/juzamma";
import { useProgress } from "@/store/useProgress";
import { useBackend } from "@/store/useBackend";

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicNumber = (n: number) =>
  String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("");

export default function QuranScreen() {
  const router = useRouter();
  const backendUrl = useBackend((s) => s.url);
  const wordsMastered = useProgress((s) => s.wordsMastered);

  // Fortschritt pro Sura: Anteil der Woerter mit Score >= 75.
  const progressBySurah = useMemo(() => {
    const out: Record<number, { done: number; total: number }> = {};
    for (const s of SURAHS) {
      let total = 0;
      let done = 0;
      for (const a of s.ayat) {
        for (const w of a.words) {
          total++;
          const key = `quran:${s.n}:${a.n}:${w.ar}`;
          if ((wordsMastered[key] ?? 0) >= 75) done++;
        }
      }
      out[s.n] = { done, total };
    }
    return out;
  }, [wordsMastered]);

  if (!backendUrl) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.emoji}>🕌</Text>
        <Text style={styles.title}>Qurʾān-Modus</Text>
        <Text style={styles.sub}>Erst Backend einrichten.</Text>
        <Pressable onPress={() => router.push("/settings" as any)} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Zu den Einstellungen</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.headline}>جُزْء عَمّ</Text>
        <Text style={styles.subheadline}>Juzʾ ʿAmma — {SURAHS.length} Suren</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {SURAHS.map((s) => {
          const p = progressBySurah[s.n];
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <Pressable
              key={s.n}
              onPress={() => router.push(`/quran/${s.n}` as any)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.numBadge}>
                <Text style={styles.numText}>{toArabicNumber(s.n)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.surahAr} allowFontScaling={false}>
                  سُورَة {s.name_ar}
                </Text>
                <Text style={styles.surahMeta}>
                  {s.translit} · {s.name_de} · {s.ayat.length - 1} Verse
                </Text>
                <View style={styles.progressWrap}>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{pct}%</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
            </Pressable>
          );
        })}
        <Text style={styles.footNote}>
          Weitere Suren werden kontinuierlich ergänzt.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  sub: { color: "#64748b", textAlign: "center", marginTop: 8 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
  },
  primaryBtnText: { color: "white", fontWeight: "700" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  headline: { fontSize: 34, color: "#0f172a", writingDirection: "rtl", lineHeight: 44 },
  subheadline: { color: "#64748b", fontSize: 14, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  numBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eef2ff",
    borderWidth: 2,
    borderColor: "#c7d2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: "#4338ca", fontWeight: "800", fontSize: 18 },
  surahAr: {
    fontSize: 22,
    color: "#0f172a",
    writingDirection: "rtl",
    textAlign: "right",
  },
  surahMeta: { color: "#64748b", fontSize: 12, marginTop: 2 },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  progressBg: {
    flex: 1,
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#22c55e" },
  progressText: { fontSize: 11, color: "#64748b", fontWeight: "700", minWidth: 34, textAlign: "right" },

  footNote: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 16,
    fontStyle: "italic",
  },
});
