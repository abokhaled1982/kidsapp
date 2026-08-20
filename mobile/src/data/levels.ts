// Lerninhalte nach Level (docs/mobile-kinder-app-anforderungen.md, Abschnitt 5).
// Ein Level besteht aus Lernpfaden (was gelernt wird), Uebungen (wie geuebt
// wird), einem Abschlusskriterium und altersgerechten UI-Vorgaben aus
// Abschnitt 8. Die Mengenangaben kommen aus den echten Datenquellen, damit
// keine Zahl im Text von der Datenlage abweicht.

import type { LearningLevel } from "@/store/profileModel";
import { CATEGORIES } from "./categories";
import { WORDS } from "./words";
import { LETTERS, LETTER_FAMILIES, SOUND_PAIRS } from "./letters";
import { HARAKAT, MADD_PAIRS, QURAN_CORE_WORDS, SHORT_WORDS, SYLLABLES } from "./harakat";
import { SURAHS } from "./juzamma";
import { tajweedForLevel } from "./tajweed";

// Ein Lernpfad haengt an genau einer Inhaltsart. levelFlow.ts loest daraus die
// uebbaren Einzelteile und die Progress-Schluessel auf.
export type LevelStage =
  | "letters"
  | "letterForms"
  | "soundPairs"
  | "harakat"
  | "syllables"
  | "madd"
  | "shortWords"
  | "quranWords"
  | "vocabulary"
  | "surahShort"
  | "ayah"
  | "tajweed"
  | "juz"
  | "review";

// Ziele der App-Navigation. Der Test prueft, dass jeder Pfad auf eine Route
// zeigt, die es wirklich gibt.
export const KNOWN_ROUTES = [
  "/letters",
  "/level",
  "/(tabs)",
  "/(tabs)/quran",
  "/(tabs)/games",
  "/(tabs)/rewards",
  "/settings",
] as const;

export type KnownRoute = (typeof KNOWN_ROUTES)[number];

// Kindgerechter Name und Bild pro Inhaltsart (Anforderungen 8: grosse Bilder,
// wenig Text). Die Lernpfad-Titel sind fuer Eltern geschrieben ("Anfang, Mitte,
// Ende"), auf der Startseite braucht ein Kind ein Wort und ein Bild.
export const STAGE_LABELS: Record<LevelStage, { title: string; emoji: string }> = {
  letters: { title: "Buchstaben", emoji: "🔤" },
  letterForms: { title: "Formen", emoji: "✏️" },
  soundPairs: { title: "Hör genau", emoji: "👂" },
  harakat: { title: "Zeichen", emoji: "◌َ" },
  syllables: { title: "Silben", emoji: "🪜" },
  madd: { title: "Lange Laute", emoji: "〰️" },
  shortWords: { title: "Kurze Wörter", emoji: "📗" },
  quranWords: { title: "Quran-Wörter", emoji: "📖" },
  vocabulary: { title: "Wörter", emoji: "🗂️" },
  surahShort: { title: "Suren", emoji: "🕌" },
  ayah: { title: "Ayat", emoji: "🎵" },
  tajweed: { title: "Schön lesen", emoji: "🌞" },
  juz: { title: "Juz", emoji: "📚" },
  review: { title: "Wiederholen", emoji: "🔁" },
};


export type LearningPath = {
  id: string;
  title: string;
  detail: string;
  emoji: string;
  stage: LevelStage;
  count: number;
  route: KnownRoute;
};

export type LevelExercise = {
  id: string;
  title: string;
  hint: string;
  emoji: string;
};

export type MasteryGoal = {
  label: string;
  // "score" = Prozentwert, "items" = Anzahl Inhalte, "recordings" = Aufnahmen
  // pro Inhalt, "days" = Tage in Folge.
  metric: "score" | "items" | "recordings" | "days";
  value: number;
};

export type MasteryRule = {
  // Abschlusskriterium als ganzer Satz, direkt aus der Anforderung.
  label: string;
  // Punkte, ab denen ein neuer Inhalt als geschafft zaehlt.
  minScoreNew: number;
  // Punkte, die ein bereits geuebter Inhalt halten soll.
  minScorePracticed: number;
  goals: MasteryGoal[];
};

export type LevelUi = {
  // "large" = grosse Illustrationen, wenig Text (Level 5-6),
  // "compact" = Lernkarten, mehr Navigation (Level 7-9).
  density: "large" | "compact";
  taskSeconds: [number, number];
  showTranslit: boolean;
  audioFirst: boolean;
  maxItemsPerSession: number;
};

export type LevelPlan = {
  level: LearningLevel;
  title: string;
  summary: string;
  goal: string;
  emoji: string;
  paths: LearningPath[];
  exercises: LevelExercise[];
  mastery: MasteryRule;
  ui: LevelUi;
};

const VOCAB_COUNT = CATEGORIES.reduce((sum, category) => sum + (WORDS[category.id]?.length ?? 0), 0);
const AYAH_COUNT = SURAHS.reduce((sum, surah) => sum + surah.ayat.filter((a) => a.n > 0).length, 0);
const QURAN_WORD_COUNT = SURAHS.reduce(
  (sum, surah) => sum + surah.ayat.reduce((inner, ayah) => inner + ayah.words.length, 0),
  0,
);
const CONNECTING_LETTERS = LETTERS.filter((letter) => letter.connects).length;
const HARAKAT_L6 = HARAKAT.filter((haraka) => haraka.level === 6).length;
const TANWIN_COUNT = HARAKAT.filter((haraka) => haraka.level === 7).length;
const PAIRS_L5 = SOUND_PAIRS.filter((pair) => pair.level === 5).length;
// Kurze Suren fuer Level 7: alles bis 40 Woerter (ohne Basmala gerechnet).
export const SHORT_SURAH_MAX_WORDS = 40;

export const LEVEL_PLANS: Record<LearningLevel, LevelPlan> = {
  5: {
    level: 5,
    title: "Buchstabenwelt und Lautdetektive",
    summary: "Buchstaben und Laute entdecken",
    goal: "Das Kind erkennt, benennt, hört und spricht die 28 Buchstaben.",
    emoji: "🔤",
    paths: [
      {
        id: "l5-letters", stage: "letters", route: "/letters", emoji: "🔤",
        title: "Buchstaben kennenlernen",
        detail: "Name, Form, Laut und Punktmuster für jeden Buchstaben.",
        count: LETTERS.length,
      },
      {
        id: "l5-families", stage: "letters", route: "/letters", emoji: "👨‍👩‍👧",
        title: "Formfamilien",
        detail: "ب/ت/ث, ج/ح/خ, د/ذ, ر/ز, س/ش, ص/ض, ط/ظ, ع/غ, ف/ق und die Einzelgänger.",
        count: LETTER_FAMILIES.length,
      },
      {
        id: "l5-forms", stage: "letterForms", route: "/letters", emoji: "✏️",
        title: "Anfang, Mitte, Ende",
        detail: "Die Positionsformen visuell unterscheiden — und wer nicht verbindet.",
        count: CONNECTING_LETTERS,
      },
      {
        id: "l5-pairs", stage: "soundPairs", route: "/letters", emoji: "👂",
        title: "Ähnliche Laute hören",
        detail: "س/ص, ت/ط, د/ض, ح/ه, ع/ء, ق/ك und ف/ث sicher auseinanderhalten.",
        count: PAIRS_L5,
      },
      {
        id: "l5-mouth", stage: "letters", route: "/letters", emoji: "👄",
        title: "Mundbild und Hörbeispiel",
        detail: "Für jeden Laut eine kurze Anweisung, wo Zunge und Lippen sind.",
        count: LETTERS.length,
      },
      {
        id: "l5-picture", stage: "letters", route: "/letters", emoji: "🖼️",
        title: "Buchstabe, Laut und Bildwort",
        detail: "Jeder Buchstabe bekommt ein Wort zum Merken: أَسَد, بَاب, تُفَّاحَة …",
        count: LETTERS.length,
      },
    ],
    exercises: [
      { id: "l5-e1", emoji: "👆", title: "Antippen und anhören", hint: "Buchstabe antippen, Laut hören, Form ansehen." },
      { id: "l5-e2", emoji: "🎧", title: "Laut aus drei Optionen", hint: "Du hörst einen Laut und wählst den richtigen Buchstaben." },
      { id: "l5-e3", emoji: "⚫", title: "Punkte und Formen sortieren", hint: "Gleiche Grundform zusammenlegen, Punkte zählen." },
      { id: "l5-e4", emoji: "🧩", title: "Fehlender Buchstabe", hint: "In einer Reihe fehlt einer — welcher?" },
      { id: "l5-e5", emoji: "🃏", title: "Buchstaben-Memory", hint: "Paare aus Form und Laut aufdecken." },
      { id: "l5-e6", emoji: "✍️", title: "Nachfahren", hint: "Den Buchstaben mit dem Finger nachziehen." },
      { id: "l5-e7", emoji: "🎙️", title: "Laut aufnehmen", hint: "Einzelnen Laut sprechen und direkt wieder anhören." },
      { id: "l5-e8", emoji: "🔍", title: "Erwartet und erkannt", hint: "Dein Laut steht neben dem Ziellaut." },
      { id: "l5-e9", emoji: "⏱️", title: "3-Minuten-Lautreise", hint: "Tägliche Runde, die schwache Buchstaben wiederholt." },
    ],
    mastery: {
      label:
        "Mindestens 90 % Erkennung bei den Buchstabenformen und mindestens drei stabile Ausspracheaufnahmen pro Buchstabenfamilie.",
      minScoreNew: 75,
      minScorePracticed: 90,
      goals: [
        { label: "Erkennung bei Buchstabenformen", metric: "score", value: 90 },
        { label: "Buchstaben insgesamt", metric: "items", value: LETTERS.length },
        { label: "Aufnahmen pro Buchstabenfamilie", metric: "recordings", value: 3 },
      ],
    },
    ui: { density: "large", taskSeconds: [20, 60], showTranslit: true, audioFirst: true, maxItemsPerSession: 6 },
  },

  6: {
    level: 6,
    title: "Harakat, Silben und Buchstabenverbindungen",
    summary: "Harakat, Silben und erste Wörter",
    goal: "Das Kind liest und spricht kurze Silben und einfache Wörter mit korrekter Grundvokalisierung.",
    emoji: "🪜",
    paths: [
      {
        id: "l6-harakat", stage: "harakat", route: "/letters", emoji: "◌َ",
        title: "Fatha, Kasra und Damma",
        detail: "Die drei Kurzvokale hören, sehen und unterscheiden.",
        count: HARAKAT_L6,
      },
      {
        id: "l6-signs", stage: "harakat", route: "/letters", emoji: "🔇",
        title: "Sukun und Shadda",
        detail: "Die ersten Lesesignale: kein Vokal und doppelter Buchstabe.",
        count: 2,
      },
      {
        id: "l6-tanwin", stage: "harakat", route: "/letters", emoji: "✌️",
        title: "Tanwin kennenlernen",
        detail: "Die doppelten Zeichen am Wortende: -an, -in, -un.",
        count: TANWIN_COUNT,
      },
      {
        id: "l6-joining", stage: "letterForms", route: "/letters", emoji: "🔗",
        title: "Buchstaben verbinden",
        detail: "Anfangs-, Mittel- und Endposition zusammensetzen.",
        count: CONNECTING_LETTERS,
      },
      {
        id: "l6-syllables", stage: "syllables", route: "/letters", emoji: "🪜",
        title: "Silbentreppe",
        detail: "بَ, بِ, بُ, بْ, بَّ und die gleichen Reihen für weitere Buchstaben.",
        count: SYLLABLES.length,
      },
      {
        id: "l6-madd", stage: "madd", route: "/letters", emoji: "〰️",
        title: "Kurz gegen lang",
        detail: "بَ gegen بَا hören: Lautlänge und kurze Pausen wahrnehmen.",
        count: MADD_PAIRS.length,
      },
      {
        id: "l6-words", stage: "shortWords", route: "/letters", emoji: "📗",
        title: "Kurze Wörter lesen",
        detail: "Wörter aus zwei bis vier Buchstaben, vollständig vokalisiert.",
        count: SHORT_WORDS.length,
      },
      {
        id: "l6-quran-words", stage: "quranWords", route: "/(tabs)/quran", emoji: "📖",
        title: "Häufige Quran-Wörter",
        detail: "Wörter, die in Juzʾ ʿAmma immer wieder vorkommen.",
        count: QURAN_CORE_WORDS.length,
      },
    ],
    exercises: [
      { id: "l6-e1", emoji: "🎧", title: "Passende Haraka wählen", hint: "Du hörst die Silbe und wählst das Zeichen." },
      { id: "l6-e2", emoji: "🪜", title: "Silben-Treppe", hint: "Reihe für Reihe, die Schwierigkeit steigt." },
      { id: "l6-e3", emoji: "🔗", title: "Verbundene Form bauen", hint: "Buchstaben in der richtigen Position zusammensetzen." },
      { id: "l6-e4", emoji: "🧱", title: "Wort aus Silben bauen", hint: "Silben in die richtige Reihenfolge ziehen." },
      { id: "l6-e5", emoji: "🔉", title: "Audio zum Wort", hint: "Gehörtes Wort dem geschriebenen zuordnen." },
      { id: "l6-e6", emoji: "❌", title: "Fehler markieren", hint: "Falsche Haraka oder falsches Sukun finden." },
      { id: "l6-e7", emoji: "⏸️", title: "Shadda hören", hint: "Doppelten Buchstaben hören und nachsprechen." },
      { id: "l6-e8", emoji: "🐢", title: "Langsame Audiohilfe", hint: "Alles auch in 0,75× Geschwindigkeit." },
      { id: "l6-e9", emoji: "🎙️", title: "Kurze Aufnahme", hint: "Sprechen und pro Zeichen eine klare Korrektur sehen." },
    ],
    mastery: {
      label: "Mindestens 85 % bei der Haraka-Zuordnung und stabiles Lesen von mindestens 50 kurzen Wörtern.",
      minScoreNew: 75,
      minScorePracticed: 85,
      goals: [
        { label: "Haraka-Zuordnung", metric: "score", value: 85 },
        { label: "Kurze Wörter stabil lesen", metric: "items", value: 50 },
        { label: "Aufnahmen pro Silbenreihe", metric: "recordings", value: 2 },
      ],
    },
    ui: { density: "large", taskSeconds: [20, 60], showTranslit: true, audioFirst: true, maxItemsPerSession: 8 },
  },

  7: {
    level: 7,
    title: "Wortschatz, Lesefluss und kurze Suren",
    summary: "Wortschatz und kurze Suren",
    goal: "Das Kind liest häufige Wörter flüssig und versteht die eigene Aussprachekorrektur.",
    emoji: "📗",
    paths: [
      {
        id: "l7-vocab", stage: "vocabulary", route: "/(tabs)", emoji: "🗂️",
        title: "Alltagswortschatz",
        detail: "Familie, Körper, Essen, Farben, Tiere, Zahlen und Propheten.",
        count: VOCAB_COUNT,
      },
      {
        id: "l7-quran-words", stage: "quranWords", route: "/(tabs)/quran", emoji: "📖",
        title: "Quran-Grundwortschatz",
        detail: "Wiederkehrende Wörter zuerst — dann liest sich jede Sura leichter.",
        count: QURAN_CORE_WORDS.length,
      },
      {
        id: "l7-patterns", stage: "shortWords", route: "/letters", emoji: "🧩",
        title: "Kurze Wortmuster",
        detail: "Artikel, Präpositionen und häufige kurze Muster erkennen.",
        count: SHORT_WORDS.length,
      },
      {
        id: "l7-rhythm", stage: "ayah", route: "/(tabs)/quran", emoji: "🎵",
        title: "Wortgrenzen und Leserhythmus",
        detail: "Wo endet ein Wort, wo darf geatmet werden?",
        count: AYAH_COUNT,
      },
      {
        id: "l7-madd", stage: "madd", route: "/letters", emoji: "〰️",
        title: "Madd-Grundidee",
        detail: "Kurze und verlängerte Laute im Wort heraushören.",
        count: MADD_PAIRS.length,
      },
      {
        id: "l7-signs", stage: "harakat", route: "/letters", emoji: "⏸️",
        title: "Shadda und Sukun anwenden",
        detail: "Nicht mehr einzeln, sondern in echten Wörtern.",
        count: HARAKAT.length,
      },
      {
        id: "l7-surahs", stage: "surahShort", route: "/(tabs)/quran", emoji: "🕌",
        title: "Kurze Suren",
        detail: "Al-Ikhlāṣ, Al-Falaq, An-Nās, Al-Kawthar und weitere kurze Suren.",
        count: SURAHS.filter(
          (surah) =>
            surah.ayat.filter((a) => a.n > 0).reduce((sum, a) => sum + a.words.length, 0) <= SHORT_SURAH_MAX_WORDS,
        ).length,
      },
      {
        id: "l7-errors", stage: "review", route: "/(tabs)/games", emoji: "🛠️",
        title: "Eigene Fehlerfamilien",
        detail: "Aus dem Verlauf werden die Laute abgeleitet, die noch wackeln.",
        count: SOUND_PAIRS.length,
      },
    ],
    exercises: [
      { id: "l7-e1", emoji: "🎙️", title: "Lesen, aufnehmen, vergleichen", hint: "Wort sprechen und die erkannte Transkription sehen." },
      { id: "l7-e2", emoji: "🆚", title: "Ziel gegen Erkannt", hint: "Zielwort und erkannte Zeichen nebeneinander." },
      { id: "l7-e3", emoji: "🔁", title: "Problembuchstabe isoliert", hint: "Nur den einen Laut wiederholen, nicht das ganze Wort." },
      { id: "l7-e4", emoji: "🧩", title: "Wort- und Silben-Puzzle", hint: "Teile in die richtige Reihenfolge bringen." },
      { id: "l7-e5", emoji: "🖼️", title: "Hörverständnis", hint: "Passendes Bild oder Wort auswählen." },
      { id: "l7-e6", emoji: "🎱", title: "Wort-Bingo mit Audio", hint: "Gehörte Wörter auf der Karte finden." },
      { id: "l7-e7", emoji: "⏩", title: "Tempoübung", hint: "Langsam, normal und frei sprechen." },
      { id: "l7-e8", emoji: "✂️", title: "Ayah in Wörter zerlegen", hint: "Eine kurze Ayah Wort für Wort lesen." },
      { id: "l7-e9", emoji: "💡", title: "Drei Versuche mit Hinweis", hint: "Jeder Versuch bringt einen besseren Tipp, keine bloße Punktzahl." },
    ],
    mastery: {
      label:
        "Mindestens 80 % bei neuen Wörtern, mindestens 90 % bei bereits geübten Wörtern und sichere Lesung von drei kurzen Suren.",
      minScoreNew: 80,
      minScorePracticed: 90,
      goals: [
        { label: "Neue Wörter", metric: "score", value: 80 },
        { label: "Geübte Wörter", metric: "score", value: 90 },
        { label: "Kurze Suren sicher lesen", metric: "items", value: 3 },
      ],
    },
    ui: { density: "compact", taskSeconds: [45, 120], showTranslit: true, audioFirst: false, maxItemsPerSession: 12 },
  },

  8: {
    level: 8,
    title: "Ayat, Tajweed-Bausteine und Fehlerwerkstatt",
    summary: "Ayat und Tajweed-Grundlagen",
    goal:
      "Das Kind rezitiert kurze Ayat zusammenhängend und arbeitet gezielt an den eigenen Aussprache- und Tajweed-Problemen.",
    emoji: "🕌",
    paths: [
      {
        id: "l8-juzamma", stage: "surahShort", route: "/(tabs)/quran", emoji: "📚",
        title: "Juzʾ ʿAmma nach Schwierigkeit",
        detail: "Nicht nach Sura-Nummer, sondern von der kürzesten zur längsten.",
        count: SURAHS.length,
      },
      {
        id: "l8-tashkeel", stage: "ayah", route: "/(tabs)/quran", emoji: "🔤",
        title: "Vollständiges Tashkeel",
        detail: "Originaltext mit allen Zeichen — nichts wird zum Üben weggelassen.",
        count: AYAH_COUNT,
      },
      {
        id: "l8-madd", stage: "tajweed", route: "/(tabs)/quran", emoji: "〰️",
        title: "Madd-Grundlagen",
        detail: "Hörbare Längenunterschiede und die Zählzeiten dahinter.",
        count: tajweedForLevel(8).length,
      },
      {
        id: "l8-qalqalah", stage: "tajweed", route: "/(tabs)/quran", emoji: "🫧",
        title: "Shadda, Sukun und Qalqalah",
        detail: "Die drei Bausteine, die den Klang einer Ayah tragen.",
        count: 3,
      },
      {
        id: "l8-pairs", stage: "soundPairs", route: "/letters", emoji: "👂",
        title: "Häufige Verwechslungen",
        detail: "س/ص, ت/ط, ذ/ز, ح/ه, ع/ء, ق/ك und ث/س gezielt trennen.",
        count: SOUND_PAIRS.length,
      },
      {
        id: "l8-linking", stage: "ayah", route: "/(tabs)/quran", emoji: "🔗",
        title: "Verbundene Aussprache",
        detail: "Wortanfänge und Wortenden sauber aneinander setzen.",
        count: AYAH_COUNT,
      },
      {
        id: "l8-breath", stage: "tajweed", route: "/(tabs)/quran", emoji: "🫁",
        title: "Atemstellen und Pausen",
        detail: "Wo anhalten hilft — und wo es den Sinn zerschneidet.",
        count: tajweedForLevel(8).length,
      },
      {
        id: "l8-sections", stage: "ayah", route: "/(tabs)/quran", emoji: "📖",
        title: "Von einer Ayah zum Abschnitt",
        detail: "Einzelne Ayah, zwei verbundene Ayat, dann ein kurzer Abschnitt.",
        count: AYAH_COUNT,
      },
    ],
    exercises: [
      { id: "l8-e1", emoji: "🎙️", title: "Ayah aufnehmen", hint: "Wort-für-Wort-Fortschritt während der Aufnahme sehen." },
      { id: "l8-e2", emoji: "🔍", title: "Erkannt über Erwartet", hint: "Der erkannte Gesamttext steht über dem Zieltext." },
      { id: "l8-e3", emoji: "📊", title: "Pro Zeichen prüfen", hint: "Erwartet, erkannt, Konfidenz und ein Hinweis." },
      { id: "l8-e4", emoji: "❓", title: "Unsicher markieren", hint: "Zu leise oder unklar? Dann heißt es „nicht sicher“." },
      { id: "l8-e5", emoji: "🛠️", title: "Fehlerwerkstatt", hint: "Ein Laut, ein Beispiel, ein Hörvergleich, Wiederholung." },
      { id: "l8-e6", emoji: "⏳", title: "Madd-Längenvergleich", hint: "Zeitleiste zeigt, wie lang der Ton gehalten wurde." },
      { id: "l8-e7", emoji: "🫧", title: "Shadda-/Sukun-Challenge", hint: "Kurze Runde nur mit diesen beiden Zeichen." },
      { id: "l8-e8", emoji: "🐢", title: "Langsam nachsprechen", hint: "Erst im ruhigen Tempo, Silbe für Silbe." },
      { id: "l8-e9", emoji: "▶️", title: "Dann normales Tempo", hint: "Dieselbe Ayah noch einmal, jetzt flüssig." },
      { id: "l8-e10", emoji: "🔁", title: "Automatische Wiederholung", hint: "Nach zwei schwachen Versuchen kommt die Stelle zurück." },
    ],
    mastery: {
      label:
        "Mindestens 85 % bei geübten Ayat, keine dauerhaft unklaren Kernbuchstaben und drei konsistente Aufnahmen derselben Sura.",
      minScoreNew: 85,
      minScorePracticed: 90,
      goals: [
        { label: "Geübte Ayat", metric: "score", value: 85 },
        { label: "Konsistente Aufnahmen derselben Sura", metric: "recordings", value: 3 },
        { label: "Tajweed-Bausteine sitzen", metric: "items", value: tajweedForLevel(8).length },
      ],
    },
    ui: { density: "compact", taskSeconds: [60, 180], showTranslit: false, audioFirst: false, maxItemsPerSession: 16 },
  },

  9: {
    level: 9,
    title: "Juz-Meisterschaft und selbstständige Rezitation",
    summary: "Juz-Lernen und selbstständige Rezitation",
    goal:
      "Das Kind steuert den eigenen Lernweg, wiederholt Juz-Inhalte und rezitiert längere Abschnitte selbstständig.",
    emoji: "🌙",
    paths: [
      {
        id: "l9-juzamma", stage: "juz", route: "/(tabs)/quran", emoji: "📚",
        title: "Juzʾ ʿAmma komplett",
        detail: "Alle vorhandenen Suren, in Mushaf-Reihenfolge wiederholbar.",
        count: SURAHS.length,
      },
      {
        id: "l9-tabarak", stage: "juz", route: "/(tabs)/quran", emoji: "📕",
        title: "Juzʾ Tabārak",
        detail: "Al-Mulk bis Al-Mursalāt — wird nach fachlicher Prüfung ergänzt.",
        count: 0,
      },
      {
        id: "l9-buckets", stage: "review", route: "/(tabs)/games", emoji: "🗂️",
        title: "Neu, Wiederholung, Korrektur",
        detail: "Drei klar getrennte Stapel statt einer langen Liste.",
        count: 3,
      },
      {
        id: "l9-profile", stage: "review", route: "/(tabs)/rewards", emoji: "🧭",
        title: "Persönliches Fehlerprofil",
        detail: "Buchstaben, Harakat und Tajweed-Regeln mit eigener Statistik.",
        count: SOUND_PAIRS.length,
      },
      {
        id: "l9-schedule", stage: "review", route: "/(tabs)/games", emoji: "📅",
        title: "Täglicher Wiederholungsplan",
        detail: "Verteilte Wiederholungen statt alles an einem Tag.",
        count: 7,
      },
      {
        id: "l9-alignment", stage: "ayah", route: "/(tabs)/quran", emoji: "🧵",
        title: "Längere Ayat mit Alignment",
        detail: "Der ganze Abschnitt wird auf einmal ausgerichtet und bewertet.",
        count: AYAH_COUNT,
      },
      {
        id: "l9-recitation", stage: "juz", route: "/(tabs)/quran", emoji: "🎙️",
        title: "Zusammenhängende Rezitation",
        detail: "Mehrere Ayat ohne Unterbrechung rezitieren.",
        count: QURAN_WORD_COUNT,
      },
      {
        id: "l9-tajweed", stage: "tajweed", route: "/(tabs)/quran", emoji: "🌞",
        title: "Tajweed vertiefen",
        detail: "Madd beim Anhalten sowie Sonnen- und Mondbuchstaben.",
        count: tajweedForLevel(9).length,
      },
      {
        id: "l9-selfcheck", stage: "review", route: "/(tabs)/games", emoji: "🪞",
        title: "Selbstbewertung zuerst",
        detail: "Erst selbst einschätzen, dann das automatische Ergebnis ansehen.",
        count: SURAHS.length,
      },
    ],
    exercises: [
      { id: "l9-e1", emoji: "🎙️", title: "Ayah oder mehrere Ayat", hint: "Am Stück rezitieren, ohne Zwischenstopp." },
      { id: "l9-e2", emoji: "📖", title: "Abschnitt ohne Pause", hint: "Einen ganzen Sura-Abschnitt durchlesen." },
      { id: "l9-e3", emoji: "✏️", title: "Transkription selbst korrigieren", hint: "Nach der Aufnahme das Erkannte prüfen und richtigstellen." },
      { id: "l9-e4", emoji: "🎯", title: "Schwierige Wörter prüfen", hint: "Wörter aus mehreren Suren in einer Runde." },
      { id: "l9-e5", emoji: "💪", title: "Stärke und Baustelle", hint: "Täglich eine Einheit zu beidem." },
      { id: "l9-e6", emoji: "⏱️", title: "Zeit oder Genauigkeit", hint: "Zwei getrennte Modi, du wählst." },
      { id: "l9-e7", emoji: "🎲", title: "Gemischte Prüfung", hint: "Bekannte und neue Wörter zusammen." },
      { id: "l9-e8", emoji: "👨‍👩‍👧", title: "Eltern- oder Lehrkraftmodus", hint: "Gezielte Aufgaben von außen setzen." },
      { id: "l9-e9", emoji: "🕌", title: "Abschluss pro Sura", hint: "Ohne Druck, ohne Rangliste." },
    ],
    mastery: {
      label:
        "Stabile Rezitation der gewählten Sura, abgeschlossene Wiederholungsserie und nachvollziehbare Verbesserung der persönlichen Fehler.",
      minScoreNew: 85,
      minScorePracticed: 90,
      goals: [
        { label: "Rezitation der gewählten Sura", metric: "score", value: 90 },
        { label: "Tage Wiederholungsserie", metric: "days", value: 7 },
        { label: "Aufnahmen pro Abschnitt", metric: "recordings", value: 3 },
      ],
    },
    ui: { density: "compact", taskSeconds: [90, 240], showTranslit: false, audioFirst: false, maxItemsPerSession: 20 },
  },
};

export const LEVEL_ORDER: LearningLevel[] = [5, 6, 7, 8, 9];

// Kurzzeile fuer Karten und Listen. Einzige Quelle ist der Levelplan.
export const LEVEL_SUMMARIES: Record<LearningLevel, string> = Object.fromEntries(
  LEVEL_ORDER.map((level) => [level, LEVEL_PLANS[level].summary]),
) as Record<LearningLevel, string>;
