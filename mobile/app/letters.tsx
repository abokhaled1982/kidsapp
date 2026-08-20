// Buchstabenwelt: der Lernbereich fuer Level 5 und 6.
// Buchstaben, Formfamilien, Hoerpaare, Harakat, Silbentreppe, Madd-Reihen und
// die kurzen Lesewoerter - alles aus src/data, alle Farben aus dem Theme.
//
// Jede Inhaltsart hat hier zwei Wege: anhoeren (das Zeichen kennenlernen) und
// sprechen (das Sprachmodell prueft, Anforderungen 4 und 7). Der Sprechweg
// fuehrt immer in /play/<Quelle> - dieselbe Mechanik wie bei den Wortlisten.
//
// Bei Level 5 und 6 sind die Abschnitte grosse Bildkacheln und nur die, die im
// Levelplan vorkommen; ab Level 7 die volle Liste als Chips (Anforderungen 8).

import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { EXTRA_SIGNS, LETTERS, LETTER_FAMILIES, SOUND_PAIRS, type Letter } from "@/data/letters";
import {
  HARAKAT,
  MADD_PAIRS,
  QURAN_CORE_WORDS,
  SHORT_WORDS,
  SYLLABLE_LADDER,
} from "@/data/harakat";
import { TAJWEED_RULES } from "@/data/tajweed";
import type { LevelStage } from "@/data/levels";
import { pictureFor } from "@/data/pictures";
import { harakaKey, letterKey, maddKey, soundPairKey, syllableKey, tajweedKey } from "@/data/progressKeys";
import { drillTargetForKey } from "@/data/wordSources";
import { PictureTile } from "@/components/PictureTile";
import { speakArabic } from "@/lib/tts";
import { useProgress } from "@/store/useProgress";
import { useProfile } from "@/store/useProfile";
import { useTheme } from "@/store/useTheme";
import { HEARD_TARGET, levelPlan } from "@/store/levelFlow";
import type { ThemePalette } from "@/store/profileModel";

type SectionId = "letters" | "families" | "pairs" | "harakat" | "syllables" | "words" | "tajweed";

const SECTIONS: { id: SectionId; title: string; emoji: string }[] = [
  { id: "letters", title: "Buchstaben", emoji: "🔤" },
  { id: "families", title: "Formfamilien", emoji: "👨‍👩‍👧" },
  { id: "pairs", title: "Hörpaare", emoji: "👂" },
  { id: "harakat", title: "Harakat", emoji: "◌َ" },
  { id: "syllables", title: "Silbentreppe", emoji: "🪜" },
  { id: "words", title: "Wörter", emoji: "📗" },
  { id: "tajweed", title: "Tajweed", emoji: "🕌" },
];

// Welche Inhaltsart des Levelplans in welchem Abschnitt geuebt wird. Formen
// stehen in der Buchstabenkarte, Madd-Reihen unter der Silbentreppe.
const SECTION_FOR_STAGE: Partial<Record<LevelStage, SectionId>> = {
  letters: "letters",
  letterForms: "letters",
  soundPairs: "pairs",
  harakat: "harakat",
  syllables: "syllables",
  madd: "syllables",
  shortWords: "words",
  quranWords: "words",
  tajweed: "tajweed",
};

// Fuer die Jungsten nur die Abschnitte, die im Level wirklich vorkommen.
function sectionsForLevel(level: number): typeof SECTIONS {
  const wanted = new Set<SectionId>();
  for (const path of levelPlan(level).paths) {
    const id = SECTION_FOR_STAGE[path.stage];
    if (id) wanted.add(id);
  }
  const list = SECTIONS.filter((entry) => wanted.has(entry.id));
  return list.length > 0 ? list : SECTIONS;
}

// Sprechweg eines Inhalts: derselbe Progress-Schluessel, dieselbe Uebung wie
// auf der Startseite.
function speakRoute(key: string): string | null {
  const target = drillTargetForKey(key);
  return target ? `/play/${target.sourceId}?start=${target.index}` : null;
}

export default function LettersScreen() {
  const router = useRouter();
  const c = useTheme();
  const profileLevel = useProfile((s) => s.profile?.level ?? 5);
  const heard = useProgress((s) => s.heard);
  const markHeard = useProgress((s) => s.markHeard);
  const big = levelPlan(profileLevel).ui.density === "large";
  const sections = useMemo(
    () => (big ? sectionsForLevel(profileLevel) : SECTIONS),
    [big, profileLevel],
  );
  const [section, setSection] = useState<SectionId>(sections[0].id);
  const [openLetter, setOpenLetter] = useState<string>(LETTERS[0].id);
  const [openFamily, setOpenFamily] = useState<string | null>(null);

  const letter = useMemo(
    () => LETTERS.find((item) => item.id === openLetter) ?? LETTERS[0],
    [openLetter],
  );

  const listen = (key: string, text: string) => {
    markHeard(key);
    speakArabic(text);
  };

  const speak = (key: string) => {
    const route = speakRoute(key);
    if (route) router.push(route as any);
  };

  const done = (key: string) => (heard[key] ?? 0) >= HEARD_TARGET;


  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          hitSlop={10}
          accessibilityLabel="Zurück"
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>🔤</Text>
          <Text style={[styles.headerTitle, { color: c.text }]}>Buchstabenwelt</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {big ? (
        // Level 5 und 6: wenige, grosse Bildkacheln - lesen muss man dafuer nicht.
        <View style={styles.tabRow}>
          {sections.map((item) => {
            const active = item.id === section;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSection(item.id)}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                style={({ pressed }) => [
                  styles.tab,
                  {
                    backgroundColor: active ? c.primary : c.surface,
                    borderColor: active ? c.primary : c.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <PictureTile pic={item.emoji} size={56} tone={active ? "surface" : "muted"} />
                <Text
                  style={[styles.tabText, { color: active ? c.onPrimary : c.text }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {sections.map((item) => {
            const active = item.id === section;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSection(item.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? c.primary : c.surface,
                    borderColor: active ? c.primary : c.border,
                  },
                ]}
              >
                <Text style={styles.chipEmoji}>{item.emoji}</Text>
                <Text style={[styles.chipText, { color: active ? c.onPrimary : c.text }]}>{item.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {section === "letters" && (
          <>
            <LetterDetail
              letter={letter}
              colors={c}
              onListen={listen}
              onSpeak={() => speak(letterKey(letter.id))}
              heardCount={heard[letterKey(letter.id)] ?? 0}
              big={big}
            />
            <Text style={[styles.sectionTitle, { color: c.text }]}>Alle 28 Buchstaben</Text>
            <Pressable
              onPress={() => router.push("/play/buchstaben" as any)}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.primary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="mic" size={20} color={c.onPrimary} />
              <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>
                Alle Buchstaben sprechen
              </Text>
            </Pressable>
            <View style={styles.tileGrid}>
              {LETTERS.map((item) => {
                const active = item.id === letter.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setOpenLetter(item.id);
                      listen(letterKey(item.id), item.ar);
                    }}
                    style={[
                      styles.tile,
                      big && styles.tileBig,
                      {
                        backgroundColor: active ? c.primary : c.surface,
                        borderColor: done(letterKey(item.id)) ? c.good.base : active ? c.primary : c.border,
                      },
                    ]}
                  >
                    <Text style={[styles.tileArabic, { color: active ? c.onPrimary : c.text }]}>{item.ar}</Text>
                    <Text style={[styles.tileLabel, { color: active ? c.onPrimary : c.textMuted }]}>
                      {item.translit}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {big ? null : (
              <>
                <Text style={[styles.sectionTitle, { color: c.text }]}>Zusätzliche Zeichen</Text>
                {EXTRA_SIGNS.map((sign) => (
                  <Pressable
                    key={sign.id}
                    onPress={() => speakArabic(sign.ar)}
                    style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}
                  >
                    <Text style={[styles.rowArabic, { color: c.text }]}>{sign.ar}</Text>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: c.text }]}>{sign.name_ar} · {sign.translit}</Text>
                      <Text style={[styles.rowDetail, { color: c.textMuted }]}>{sign.detail}</Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}

        {section === "families" && (
          <>
            <Text style={[styles.lead, { color: c.textMuted }]}>
              Gleiche Grundform, andere Punkte. Tippe eine Familie an, um sie zu hören.
            </Text>
            {LETTER_FAMILIES.map((family) => {
              const open = family.id === openFamily;
              return (
                <Pressable
                  key={family.id}
                  onPress={() => setOpenFamily(open ? null : family.id)}
                  style={[styles.card, { backgroundColor: c.surface, borderColor: open ? c.primary : c.border }]}
                >
                  <View style={styles.cardHead}>
                    <Text style={[styles.cardTitle, { color: c.text }]}>{family.title}</Text>
                    <Text style={[styles.badge, { color: c.textMuted }]}>{family.letters.length}</Text>
                  </View>
                  <View style={styles.letterRow}>
                    {family.letters.map((char) => (
                      <Pressable
                        key={char}
                        onPress={() => speakArabic(char)}
                        style={[styles.miniTile, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}
                      >
                        <Text style={[styles.miniArabic, { color: c.text }]}>{char}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.rowDetail, { color: c.textMuted }]}>{family.detail}</Text>
                </Pressable>
              );
            })}
          </>
        )}

        {section === "pairs" && (
          <>
            <Text style={[styles.lead, { color: c.textMuted }]}>
              Zwei Laute, die leicht verwechselt werden. Höre beide direkt hintereinander.
            </Text>
            {SOUND_PAIRS.map((pair) => (
              <View
                key={pair.id}
                style={[
                  styles.card,
                  { backgroundColor: c.surface, borderColor: done(soundPairKey(pair.id)) ? c.good.base : c.border },
                ]}
              >
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: c.text }]}>{pair.title}</Text>
                  <Text style={[styles.badge, { color: c.textMuted }]}>Level {pair.level}</Text>
                </View>
                <View style={styles.pairRow}>
                  {[pair.a, pair.b].map((char) => (
                    <Pressable
                      key={char}
                      onPress={() => listen(soundPairKey(pair.id), char)}
                      style={[styles.pairBtn, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}
                    >
                      <Text style={[styles.pairArabic, { color: c.text }]}>{char}</Text>
                      <Ionicons name="volume-high" size={16} color={c.info} />
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.rowDetail, { color: c.textMuted }]}>{pair.hint}</Text>
                <Text style={[styles.rowDetail, { color: c.info }]}>👂 {pair.listenFor}</Text>
              </View>
            ))}
          </>
        )}

        {section === "harakat" && (
          <>
            <Text style={[styles.lead, { color: c.textMuted }]}>
              Die Zeichen sitzen über oder unter dem Buchstaben und sagen, wie er klingt.
            </Text>
            <Pressable
              onPress={() => router.push("/play/harakat" as any)}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.primary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="mic" size={20} color={c.onPrimary} />
              <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Zeichen sprechen</Text>
            </Pressable>
            {HARAKAT.map((haraka) => (
              <View
                key={haraka.id}
                style={[
                  styles.row,
                  { backgroundColor: c.surface, borderColor: done(harakaKey(haraka.id)) ? c.good.base : c.border },
                ]}
              >
                <Pressable
                  onPress={() => listen(harakaKey(haraka.id), haraka.example.ar)}
                  accessibilityRole="button"
                  accessibilityLabel={`${haraka.name_de} anhören`}
                  style={styles.rowListen}
                >
                  <Text style={[styles.rowArabic, { color: c.text }]}>{haraka.display}</Text>
                  <Ionicons name="volume-high" size={18} color={c.info} />
                </Pressable>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: c.text }]}>
                    {haraka.name_de} · {haraka.name_ar} → „{haraka.sound}“
                  </Text>
                  {big ? null : (
                    <Text style={[styles.rowDetail, { color: c.textMuted }]}>{haraka.hint}</Text>
                  )}
                  <Text style={[styles.rowDetail, { color: c.info }]}>
                    {haraka.example.ar} · {haraka.example.translit} · {haraka.example.de}
                  </Text>
                </View>
                <Pressable
                  onPress={() => speak(harakaKey(haraka.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`${haraka.name_de} sprechen`}
                  style={({ pressed }) => [
                    styles.micBtn,
                    { backgroundColor: c.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="mic" size={22} color={c.onPrimary} />
                </Pressable>
              </View>
            ))}
          </>
        )}

        {section === "syllables" && (
          <>
            <Text style={[styles.lead, { color: c.textMuted }]}>
              Jede Reihe nimmt einen Buchstaben durch alle Zeichen. Tippe eine Silbe zum Hören.
            </Text>
            <Pressable
              onPress={() => router.push("/play/silben" as any)}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.primary },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="mic" size={20} color={c.onPrimary} />
              <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Silben sprechen</Text>
            </Pressable>
            {SYLLABLE_LADDER.map((row) => (
              <View key={row.letter_id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{row.letter}</Text>
                <View style={styles.letterRow}>
                  {row.cells.map((cell) => (
                    <Pressable
                      key={cell.ar}
                      onPress={() => listen(syllableKey(cell.ar), cell.ar)}
                      onLongPress={() => speak(syllableKey(cell.ar))}
                      style={[
                        styles.syllable,
                        {
                          backgroundColor: c.surfaceMuted,
                          borderColor: done(syllableKey(cell.ar)) ? c.good.base : c.border,
                        },
                      ]}
                    >
                      <Text style={[styles.miniArabic, { color: c.text }]}>{cell.ar}</Text>
                      <Text style={[styles.tileLabel, { color: c.textMuted }]}>{cell.translit}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            <Text style={[styles.sectionTitle, { color: c.text }]}>Kurz gegen lang</Text>
            <Pressable
              onPress={() => router.push("/play/madd" as any)}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="mic" size={20} color={c.text} />
              <Text style={[styles.primaryBtnText, { color: c.text }]}>Lange Laute sprechen</Text>
            </Pressable>
            <View style={styles.tileGrid}>
              {MADD_PAIRS.map((pair) => (
                <Pressable
                  key={pair.short.ar}
                  onPress={() => listen(maddKey(pair.short.ar), `${pair.short.ar} ${pair.long.ar}`)}
                  onLongPress={() => speak(maddKey(pair.short.ar))}
                  style={[
                    styles.maddTile,
                    {
                      backgroundColor: c.surface,
                      borderColor: done(maddKey(pair.short.ar)) ? c.good.base : c.border,
                    },
                  ]}
                >
                  <Text style={[styles.miniArabic, { color: c.text }]}>
                    {pair.short.ar} · {pair.long.ar}
                  </Text>
                  <Text style={[styles.tileLabel, { color: c.textMuted }]}>
                    {pair.short.translit} / {pair.long.translit}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {section === "words" && (
          <>
            <Text style={[styles.lead, { color: c.textMuted }]}>
              {SHORT_WORDS.length} kurze Wörter zum Lesen und {QURAN_CORE_WORDS.length} Wörter, die im
              Quran immer wieder vorkommen.
            </Text>
            <Pressable
              onPress={() => router.push("/play/kurz" as any)}
              style={[styles.primaryBtn, { backgroundColor: c.primary }]}
            >
              <Ionicons name="mic" size={18} color={c.onPrimary} />
              <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Kurze Wörter üben</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/play/quran-core" as any)}
              style={[styles.primaryBtn, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }]}
            >
              <Ionicons name="mic" size={18} color={c.text} />
              <Text style={[styles.primaryBtnText, { color: c.text }]}>Quran-Wörter üben</Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { color: c.text }]}>Kurze Wörter</Text>
            <View style={styles.tileGrid}>
              {SHORT_WORDS.map((word) => (
                <Pressable
                  key={word.ar}
                  onPress={() => speakArabic(word.ar)}
                  style={[styles.wordTile, { backgroundColor: c.surface, borderColor: c.border }]}
                >
                  <PictureTile pic={pictureFor(word.ar)} fallback="📗" size={44} tone="muted" />
                  <Text style={[styles.miniArabic, { color: c.text }]}>{word.ar}</Text>
                  <Text style={[styles.tileLabel, { color: c.textMuted }]}>{word.de}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: c.text }]}>Quran-Grundwortschatz</Text>
            <View style={styles.tileGrid}>
              {QURAN_CORE_WORDS.map((word) => (
                <Pressable
                  key={word.ar}
                  onPress={() => speakArabic(word.ar)}
                  style={[styles.wordTile, { backgroundColor: c.surface, borderColor: c.border }]}
                >
                  <PictureTile pic={pictureFor(word.ar)} fallback="📖" size={44} tone="muted" />
                  <Text style={[styles.miniArabic, { color: c.text }]}>{word.ar}</Text>
                  <Text style={[styles.tileLabel, { color: c.textMuted }]}>{word.de}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {section === "tajweed" && (
          <>
            <Text style={[styles.lead, { color: c.textMuted }]}>
              Die Regeln aus Level 8 und 9. Jedes Beispiel steht so im Juzʾ ʿAmma.
            </Text>
            {TAJWEED_RULES.map((rule) => (
              <Pressable
                key={rule.id}
                onPress={() => listen(tajweedKey(rule.id), rule.example.ar)}
                style={[
                  styles.card,
                  {
                    backgroundColor: c.surface,
                    borderColor: done(tajweedKey(rule.id)) ? c.good.base : c.border,
                    opacity: rule.level <= Math.max(profileLevel, 8) ? 1 : 0.6,
                  },
                ]}
              >
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: c.text }]}>
                    {rule.emoji} {rule.title}
                  </Text>
                  <Text style={[styles.badge, { color: c.textMuted }]}>Lv {rule.level}</Text>
                </View>
                <Text style={[styles.rowDetail, { color: c.textMuted }]}>{rule.kidExplanation}</Text>
                <Text style={[styles.rowDetail, { color: c.info }]}>👂 {rule.listenFor}</Text>
                {rule.timing ? (
                  <Text style={[styles.rowDetail, { color: c.textMuted }]}>⏱️ {rule.timing}</Text>
                ) : null}
                <Text style={[styles.exampleArabic, { color: c.text }]}>{rule.example.ar}</Text>
                <Text style={[styles.rowDetail, { color: c.textMuted }]}>
                  {rule.example.translit} · Sura {rule.example.surah}, Ayah {rule.example.ayah}
                </Text>
                {rule.contrast ? (
                  <Text style={[styles.rowDetail, { color: c.textMuted }]}>
                    Vergleich: {rule.contrast.ar} ({rule.contrast.translit}) · Sura {rule.contrast.surah},
                    Ayah {rule.contrast.ayah}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LetterDetail({
  letter,
  colors,
  onListen,
  onSpeak,
  heardCount,
  big,
}: {
  letter: Letter;
  colors: ThemePalette;
  onListen: (key: string, text: string) => void;
  onSpeak: () => void;
  heardCount: number;
  big: boolean;
}) {
  const dots =
    letter.dots.count === 0
      ? "keine Punkte"
      : `${letter.dots.count} ${letter.dots.count === 1 ? "Punkt" : "Punkte"} ${
          letter.dots.position === "above" ? "oben" : "unten"
        }`;

  const forms: { label: string; value: string | null }[] = [
    { label: "Allein", value: letter.forms.isolated },
    { label: "Anfang", value: letter.forms.initial },
    { label: "Mitte", value: letter.forms.medial },
    { label: "Ende", value: letter.forms.final },
  ];

  return (
    <View style={[styles.detail, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.detailArabic, { color: colors.text }]}>{letter.ar}</Text>
      <Text style={[styles.detailName, { color: colors.text }]}>
        {letter.name_ar} · {letter.translit}
      </Text>

      {/* Bildwort des Buchstaben: das Kind erkennt den Laut am Bild wieder. */}
      <PictureTile
        pic={pictureFor(letter.example.ar)}
        fallback="🔤"
        size={big ? 96 : 72}
        tone="muted"
        label={`${letter.example.ar} · ${letter.example.de}`}
      />

      {/* Die beiden Wege: hoeren und selbst sprechen - gleich gross. */}
      <View style={styles.btnRow}>
        <Pressable
          onPress={() => onListen(letterKey(letter.id), letter.ar)}
          accessibilityRole="button"
          accessibilityLabel="Laut anhören"
          style={({ pressed }) => [
            styles.halfBtn,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="volume-high" size={26} color={colors.text} />
          <Text style={[styles.halfBtnText, { color: colors.text }]}>
            Anhören{heardCount > 0 ? ` ${Math.min(heardCount, HEARD_TARGET)}/${HEARD_TARGET}` : ""}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSpeak}
          accessibilityRole="button"
          accessibilityLabel="Buchstabe sprechen"
          style={({ pressed }) => [
            styles.halfBtn,
            { backgroundColor: colors.primary, borderColor: colors.primary },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="mic" size={26} color={colors.onPrimary} />
          <Text style={[styles.halfBtnText, { color: colors.onPrimary }]}>🎙️ Sprechen</Text>
        </Pressable>
      </View>

      {/* Ab Level 7 die Einzelheiten: Laut, Punkte, Positionsformen. */}
      {big ? null : (
        <>
          <Text style={[styles.rowDetail, { color: colors.textMuted, textAlign: "center" }]}>
            Laut „{letter.sound}“ · {dots} ·{" "}
            {letter.connects ? "verbindet nach links" : "verbindet nicht nach links"}
          </Text>
          <Text style={[styles.rowDetail, { color: colors.textMuted, textAlign: "center" }]}>
            👄 {letter.hint}
          </Text>
          {letter.variants ? (
            <Text style={[styles.rowDetail, { color: colors.textMuted }]}>
              Schreibvarianten: {letter.variants.join(" ")}
            </Text>
          ) : null}
        </>
      )}

      <View style={styles.formRow}>
        {forms.map((form) => (
          <View
            key={form.label}
            style={[styles.formBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          >
            <Text style={[styles.formArabic, { color: form.value ? colors.text : colors.textMuted }]}>
              {form.value ?? "—"}
            </Text>
            <Text style={[styles.tileLabel, { color: colors.textMuted }]}>{form.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  headerEmoji: { fontSize: 22 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  // Grosse Bildkacheln als Abschnittswahl fuer Level 5 und 6.
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  tab: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 6,
    minHeight: 108,
    justifyContent: "center",
  },
  tabText: { fontSize: 13, fontWeight: "800" },
  chipRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipEmoji: { fontSize: 15 },
  chipText: { fontWeight: "700", fontSize: 13 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginTop: 12, marginBottom: 2 },

  detail: { borderRadius: 20, borderWidth: 1, padding: 16, alignItems: "center", gap: 6 },
  detailArabic: { fontSize: 88, lineHeight: 116, writingDirection: "rtl" },
  detailName: { fontSize: 18, fontWeight: "700" },
  // Anhoeren und Sprechen gleich gross, beide ueber 64 px hoch (Anforderung 7).
  btnRow: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 10 },
  halfBtn: {
    flex: 1,
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
  halfBtnText: { fontSize: 14, fontWeight: "800" },
  micBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  rowListen: { alignItems: "center", gap: 2, minWidth: 52 },
  formRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 4 },
  formBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
  formArabic: { fontSize: 30, lineHeight: 44, writingDirection: "rtl" },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    width: "22%",
    aspectRatio: 0.95,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tileArabic: { fontSize: 32, lineHeight: 44, writingDirection: "rtl" },
  tileBig: { width: "30%", borderRadius: 20 },
  tileLabel: { fontSize: 11 },
  wordTile: {
    width: "31%",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
  maddTile: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: "center",
    gap: 2,
  },

  card: { borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 6 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  badge: { fontSize: 12, fontWeight: "600" },
  letterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  miniTile: {
    minWidth: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  miniArabic: { fontSize: 24, lineHeight: 36, writingDirection: "rtl" },
  syllable: {
    minWidth: 58,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
  },

  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 12 },
  rowArabic: { fontSize: 34, lineHeight: 48, writingDirection: "rtl", minWidth: 44, textAlign: "center" },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowDetail: { fontSize: 13, lineHeight: 19 },

  pairRow: { flexDirection: "row", gap: 10 },
  pairBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  pairArabic: { fontSize: 34, lineHeight: 46, writingDirection: "rtl" },
  exampleArabic: { fontSize: 30, lineHeight: 46, writingDirection: "rtl", textAlign: "right" },

  primaryBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
  },
  primaryBtnText: { fontWeight: "700", fontSize: 15 },
});
