import { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { SURAHS } from "@/data/juzamma";
import { useProgress } from "@/store/useProgress";
import { useBackend } from "@/store/useBackend";
import { useTheme } from "@/store/useTheme";

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicNumber = (n: number) =>
  String(n).split("").map((d) => AR_DIGITS[Number(d)] ?? d).join("");

export default function QuranScreen() {
  const router = useRouter();
  const c = useTheme();
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
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.background }]}>
        <Text style={styles.emoji}>🕌</Text>
        <Text style={[styles.title, { color: c.text }]}>Qurʾān-Modus</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>Erst Backend einrichten.</Text>
        <Pressable onPress={() => router.push("/settings" as any)} style={[styles.primaryBtn, { backgroundColor: c.primary }]}>
          <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Zu den Einstellungen</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={[styles.headline, { color: c.text }]}>جُزْء عَمّ</Text>
        <Text style={[styles.subheadline, { color: c.textMuted }]}>Juzʾ ʿAmma — {SURAHS.length} Suren</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {SURAHS.map((s) => {
          const p = progressBySurah[s.n];
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <Pressable
              key={s.n}
              onPress={() => router.push(`/quran/${s.n}` as any)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: c.surface, borderColor: c.border, shadowColor: c.text },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.numBadge, { backgroundColor: c.surfaceMuted, borderColor: c.primary }]}>
                <Text style={[styles.numText, { color: c.primary }]}>{toArabicNumber(s.n)}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.surahAr, { color: c.text }]} allowFontScaling={false}>
                  سُورَة {s.name_ar}
                </Text>
                <Text style={[styles.surahMeta, { color: c.textMuted }]}>
                  {s.translit} · {s.name_de} · {s.ayat.length - 1} Verse
                </Text>
                <View style={styles.progressWrap}>
                  <View style={[styles.progressBg, { backgroundColor: c.surfaceMuted }]}>
                    <View style={[styles.progressFill, { backgroundColor: c.good.base, width: `${pct}%` }]} />
                  </View>
                  <Text style={[styles.progressText, { color: c.textMuted }]}>{pct}%</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color={c.textMuted} />
            </Pressable>
          );
        })}
        <Text style={[styles.footNote, { color: c.textMuted }]}>
          Weitere Suren werden kontinuierlich ergänzt.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { textAlign: "center", marginTop: 8 },
  primaryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
  },
  primaryBtnText: { fontWeight: "700" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  headline: { fontSize: 34, writingDirection: "rtl", lineHeight: 44 },
  subheadline: { fontSize: 14, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardBody: { flex: 1 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  numBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { fontWeight: "800", fontSize: 18 },
  surahAr: {
    fontSize: 22,
    writingDirection: "rtl",
    textAlign: "right",
  },
  surahMeta: { fontSize: 12, marginTop: 2 },
  progressWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  progressBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%" },
  progressText: { fontSize: 11, fontWeight: "700", minWidth: 34, textAlign: "right" },

  footNote: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 16,
    fontStyle: "italic",
  },
});
