// Level 8/9 - Tajweed-Bausteine (Anforderungen 5.4 und 5.5).
// Jede Regel zeigt auf eine echte Stelle in Juz Amma; die Referenzen werden im
// Test gegen src/data/juzamma.ts geprueft, damit keine Beispiele erfunden sind.

export type TajweedRuleId =
  | "madd_tabii"
  | "madd_arid"
  | "shadda"
  | "ghunna"
  | "sukun"
  | "qalqalah"
  | "waqf"
  | "lam_shamsi";

export type TajweedExample = {
  ar: string;
  translit: string;
  surah: number;
  ayah: number;
};

export type TajweedRule = {
  id: TajweedRuleId;
  title: string;
  arabic: string;
  emoji: string;
  // Was passiert - in einem Satz, ohne Fachsprache.
  kidExplanation: string;
  // Worauf das Kind beim Hoeren achten soll.
  listenFor: string;
  // Laenge/Takt, wenn die Regel eine Dauer hat.
  timing?: string;
  example: TajweedExample;
  // Gegenbeispiel, wenn die Regel nur im Vergleich klar wird.
  contrast?: TajweedExample;
  level: 8 | 9;
};

export const TAJWEED_RULES: TajweedRule[] = [
  {
    id: "madd_tabii",
    title: "Madd — der lange Ton",
    arabic: "مَدّ طَبِيعِي",
    emoji: "〰️",
    kidExplanation: "Ein Vokal wird gedehnt: statt kurz „a“ hörst du ein langes „aa“.",
    listenFor: "Zähle innerlich bis zwei, während der Ton weiterläuft.",
    timing: "2 Zählzeiten",
    example: { ar: "مَا", translit: "mā", surah: 113, ayah: 2 },
    level: 8,
  },
  {
    id: "shadda",
    title: "Shadda — der doppelte Buchstabe",
    arabic: "شَدَّة",
    emoji: "⏸️",
    kidExplanation: "Der Buchstabe wird zweimal gesprochen und dabei kurz festgehalten.",
    listenFor: "Der Ton stockt einen Moment, bevor er weitergeht.",
    example: { ar: "النَّاسِ", translit: "an-nāsi", surah: 114, ayah: 1 },
    level: 8,
  },
  {
    id: "sukun",
    title: "Sukun — Buchstabe ohne Vokal",
    arabic: "سُكُون",
    emoji: "🔇",
    kidExplanation: "Der Buchstabe bekommt keinen Vokal und wird direkt abgeschlossen.",
    listenFor: "Nach dem Buchstaben kommt kein a, i oder u.",
    example: { ar: "قُلْ", translit: "qul", surah: 114, ayah: 1 },
    level: 8,
  },
  {
    id: "qalqalah",
    title: "Qalqalah — der kleine Sprung",
    arabic: "قَلْقَلَة",
    emoji: "🫧",
    kidExplanation: "Bei ق ط ب ج د mit Sukun springt der Laut kurz zurück, wie ein leises Echo.",
    listenFor: "Am Ende des Buchstabens hörst du ein kurzes Aufblitzen.",
    example: { ar: "يَلِدْ", translit: "yalid", surah: 112, ayah: 3 },
    level: 8,
  },
  {
    id: "ghunna",
    title: "Ghunna — der Nasenton",
    arabic: "غُنَّة",
    emoji: "👃",
    kidExplanation: "Bei نّ und مّ summt der Ton durch die Nase weiter.",
    listenFor: "Halte die Nase kurz zu — dann verschwindet der Ton.",
    timing: "2 Zählzeiten",
    example: { ar: "الْجِنَّةِ", translit: "al-jinnati", surah: 114, ayah: 6 },
    level: 8,
  },
  {
    id: "waqf",
    title: "Waqf — die Atempause",
    arabic: "وَقْف",
    emoji: "🛑",
    kidExplanation: "Am Ende einer Ayah hältst du an, atmest ruhig und liest dann weiter.",
    listenFor: "Die Stimme wird am Ende tiefer und ruhiger.",
    example: { ar: "الْكَوْثَرَ", translit: "al-kawthar", surah: 108, ayah: 1 },
    level: 8,
  },
  {
    id: "madd_arid",
    title: "Madd beim Anhalten",
    arabic: "مَدّ عَارِض",
    emoji: "⏳",
    kidExplanation: "Hältst du auf einem langen Vokal an, darf der Ton länger stehen bleiben.",
    listenFor: "Der Schlusston trägt weiter als ein normales Madd.",
    timing: "2 bis 6 Zählzeiten",
    example: { ar: "الْفِيلِ", translit: "al-fīl", surah: 105, ayah: 1 },
    level: 9,
  },
  {
    id: "lam_shamsi",
    title: "Sonnen- und Mondbuchstaben",
    arabic: "لَام شَمْسِيَّة وَقَمَرِيَّة",
    emoji: "🌞",
    kidExplanation:
      "Nach الـ verschwindet das ل manchmal: bei Sonnenbuchstaben hörst du es nicht, bei Mondbuchstaben schon.",
    listenFor: "„an-nās“ ohne l, aber „al-falaq“ mit l.",
    example: { ar: "النَّاسِ", translit: "an-nāsi", surah: 114, ayah: 1 },
    contrast: { ar: "الْفَلَقِ", translit: "al-falaq", surah: 113, ayah: 1 },
    level: 9,
  },
];

export const TAJWEED_BY_ID: Record<TajweedRuleId, TajweedRule> = Object.fromEntries(
  TAJWEED_RULES.map((rule) => [rule.id, rule]),
) as Record<TajweedRuleId, TajweedRule>;

export function tajweedForLevel(level: number): TajweedRule[] {
  // Level 9 wiederholt die Bausteine aus Level 8 und legt zwei Regeln dazu.
  return TAJWEED_RULES.filter((rule) => rule.level <= level);
}
