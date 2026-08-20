// Level 6 - "Harakat, Silben und Buchstabenverbindungen" (Anforderungen 5.2)
// Kurzvokale, Sukun, Shadda und Tanwin, dazu die Silbentreppe, die Madd-Reihen
// und ein Grundstock kurzer Woerter zum Lesen.

import type { Word } from "./categories";

export type HarakaId =
  | "fatha"
  | "kasra"
  | "damma"
  | "sukun"
  | "shadda"
  | "fathatan"
  | "kasratan"
  | "dammatan";

export type Haraka = {
  id: HarakaId;
  // Das reine Kombinationszeichen. Zur Anzeige immer mit Traeger benutzen.
  symbol: string;
  // Zeichen auf dem gepunkteten Kreis - so zeigt man ein Harakat allein.
  display: string;
  name_ar: string;
  name_de: string;
  sound: string;
  hint: string;
  example: { ar: string; translit: string; de: string };
  // Ab welchem Level das Zeichen eingefuehrt wird.
  level: 6 | 7;
};

const CARRIER = "◌";

export const HARAKAT: Haraka[] = [
  {
    id: "fatha", symbol: "َ", display: `${CARRIER}َ`,
    name_ar: "فَتْحَة", name_de: "Fatha", sound: "a",
    hint: "Ein kleiner Strich oben. Der Buchstabe bekommt ein kurzes a.",
    example: { ar: "بَ", translit: "ba", de: "b + a" },
    level: 6,
  },
  {
    id: "kasra", symbol: "ِ", display: `${CARRIER}ِ`,
    name_ar: "كَسْرَة", name_de: "Kasra", sound: "i",
    hint: "Ein kleiner Strich unten. Der Buchstabe bekommt ein kurzes i.",
    example: { ar: "بِ", translit: "bi", de: "b + i" },
    level: 6,
  },
  {
    id: "damma", symbol: "ُ", display: `${CARRIER}ُ`,
    name_ar: "ضَمَّة", name_de: "Damma", sound: "u",
    hint: "Ein kleines Häkchen oben. Der Buchstabe bekommt ein kurzes u.",
    example: { ar: "بُ", translit: "bu", de: "b + u" },
    level: 6,
  },
  {
    id: "sukun", symbol: "ْ", display: `${CARRIER}ْ`,
    name_ar: "سُكُون", name_de: "Sukun", sound: "—",
    hint: "Ein kleiner Kreis oben: der Buchstabe bekommt gar keinen Vokal.",
    example: { ar: "مَنْ", translit: "man", de: "wer" },
    level: 6,
  },
  {
    id: "shadda", symbol: "ّ", display: `${CARRIER}ّ`,
    name_ar: "شَدَّة", name_de: "Shadda", sound: "doppelt",
    hint: "Das Zeichen wie ein kleines w: der Buchstabe wird doppelt gesprochen.",
    example: { ar: "أُمّ", translit: "umm", de: "Mutter" },
    level: 6,
  },
  {
    id: "fathatan", symbol: "ً", display: `${CARRIER}ً`,
    name_ar: "فَتْحَتَان", name_de: "Fathatan", sound: "an",
    hint: "Zwei Striche oben: am Wortende klingt es wie -an.",
    example: { ar: "أَحَدًا", translit: "aḥadan", de: "einen (jemanden)" },
    level: 7,
  },
  {
    id: "kasratan", symbol: "ٍ", display: `${CARRIER}ٍ`,
    name_ar: "كَسْرَتَان", name_de: "Kasratan", sound: "in",
    hint: "Zwei Striche unten: am Wortende klingt es wie -in.",
    example: { ar: "حَاسِدٍ", translit: "ḥāsidin", de: "eines Neiders" },
    level: 7,
  },
  {
    id: "dammatan", symbol: "ٌ", display: `${CARRIER}ٌ`,
    name_ar: "ضَمَّتَان", name_de: "Dammatan", sound: "un",
    hint: "Zwei Häkchen oben: am Wortende klingt es wie -un.",
    example: { ar: "أَحَدٌ", translit: "aḥadun", de: "Einer" },
    level: 7,
  },
];

export const HARAKAT_BY_ID: Record<HarakaId, Haraka> = Object.fromEntries(
  HARAKAT.map((haraka) => [haraka.id, haraka]),
) as Record<HarakaId, Haraka>;

// Silbentreppe (5.2 "Silben-Treppe mit steigender Schwierigkeit"):
// pro Buchstabe eine Reihe mit Fatha, Kasra, Damma, Sukun und Shadda.
export type SyllableCell = {
  ar: string;
  translit: string;
  haraka: HarakaId;
};

export type SyllableRow = {
  letter: string;
  letter_id: string;
  cells: SyllableCell[];
};

const LADDER_LETTERS: { id: string; ar: string; sound: string }[] = [
  { id: "ba", ar: "ب", sound: "b" },
  { id: "ta", ar: "ت", sound: "t" },
  { id: "jim", ar: "ج", sound: "j" },
  { id: "dal", ar: "د", sound: "d" },
  { id: "ra", ar: "ر", sound: "r" },
  { id: "sin", ar: "س", sound: "s" },
  { id: "kaf", ar: "ك", sound: "k" },
  { id: "lam", ar: "ل", sound: "l" },
  { id: "mim", ar: "م", sound: "m" },
  { id: "nun", ar: "ن", sound: "n" },
];

const LADDER_STEPS: { haraka: HarakaId; suffix: (sound: string) => string }[] = [
  { haraka: "fatha", suffix: (s) => `${s}a` },
  { haraka: "kasra", suffix: (s) => `${s}i` },
  { haraka: "damma", suffix: (s) => `${s}u` },
  { haraka: "sukun", suffix: (s) => `-${s}` },
  { haraka: "shadda", suffix: (s) => `${s}${s}a` },
];

export const SYLLABLE_LADDER: SyllableRow[] = LADDER_LETTERS.map((letter) => ({
  letter: letter.ar,
  letter_id: letter.id,
  cells: LADDER_STEPS.map((step) => ({
    // Shadda wird zusammen mit Fatha gezeigt, sonst waere die Silbe nicht sprechbar.
    ar:
      step.haraka === "shadda"
        ? `${letter.ar}${HARAKAT_BY_ID.shadda.symbol}${HARAKAT_BY_ID.fatha.symbol}`
        : `${letter.ar}${HARAKAT_BY_ID[step.haraka].symbol}`,
    translit: step.suffix(letter.sound),
    haraka: step.haraka,
  })),
}));

export const SYLLABLES: SyllableCell[] = SYLLABLE_LADDER.flatMap((row) => row.cells);

// Madd-Reihen (5.2 "Lautlaenge wahrnehmen", 5.3 "Madd-Grundidee"):
// kurzer Vokal gegen langen Vokal, direkt nebeneinander zum Hoeren.
export type MaddPair = {
  short: SyllableCell;
  long: { ar: string; translit: string };
  letter: string;
};

const MADD_LETTERS = ["ب", "ت", "س", "م", "ن"];
const MADD_SOUNDS: Record<string, string> = { "ب": "b", "ت": "t", "س": "s", "م": "m", "ن": "n" };

export const MADD_PAIRS: MaddPair[] = MADD_LETTERS.flatMap((letter) => {
  const sound = MADD_SOUNDS[letter];
  return [
    {
      letter,
      short: { ar: `${letter}َ`, translit: `${sound}a`, haraka: "fatha" as HarakaId },
      long: { ar: `${letter}َا`, translit: `${sound}ā` },
    },
    {
      letter,
      short: { ar: `${letter}ِ`, translit: `${sound}i`, haraka: "kasra" as HarakaId },
      long: { ar: `${letter}ِي`, translit: `${sound}ī` },
    },
    {
      letter,
      short: { ar: `${letter}ُ`, translit: `${sound}u`, haraka: "damma" as HarakaId },
      long: { ar: `${letter}ُو`, translit: `${sound}ū` },
    },
  ];
});

// Kurze Woerter zum Lesen (Abschlusskriterium Level 6: "stabiles Lesen von
// mindestens 50 kurzen Woertern").
export const SHORT_WORDS: Word[] = [
  { ar: "مَنْ", de: "wer", translit: "man" },
  { ar: "هَلْ", de: "ob", translit: "hal" },
  { ar: "كَمْ", de: "wie viele", translit: "kam" },
  { ar: "قُمْ", de: "steh auf", translit: "qum" },
  { ar: "نَمْ", de: "schlaf", translit: "nam" },
  { ar: "كُلْ", de: "iss", translit: "kul" },
  { ar: "خُذْ", de: "nimm", translit: "khudh" },
  { ar: "قِفْ", de: "halt", translit: "qif" },
  { ar: "اِسْمَعْ", de: "hör zu", translit: "ismaʿ" },
  { ar: "يَد", de: "Hand", translit: "yad" },
  { ar: "أَب", de: "Vater", translit: "ab" },
  { ar: "أُمّ", de: "Mutter", translit: "umm" },
  { ar: "أَخ", de: "Bruder", translit: "akh" },
  { ar: "دَم", de: "Blut", translit: "dam" },
  { ar: "فَم", de: "Mund", translit: "fam" },
  { ar: "جَبَل", de: "Berg", translit: "jabal" },
  { ar: "قَمَر", de: "Mond", translit: "qamar" },
  { ar: "شَمْس", de: "Sonne", translit: "shams" },
  { ar: "نُور", de: "Licht", translit: "nūr" },
  { ar: "بَيْت", de: "Haus", translit: "bayt" },
  { ar: "بَاب", de: "Tür", translit: "bāb" },
  { ar: "كِتَاب", de: "Buch", translit: "kitāb" },
  { ar: "قَلَم", de: "Stift", translit: "qalam" },
  { ar: "وَلَد", de: "Junge", translit: "walad" },
  { ar: "بِنْت", de: "Mädchen", translit: "bint" },
  { ar: "مَاء", de: "Wasser", translit: "māʾ" },
  { ar: "خُبْز", de: "Brot", translit: "khubz" },
  { ar: "لَبَن", de: "Joghurt", translit: "laban" },
  { ar: "تِين", de: "Feige", translit: "tīn" },
  { ar: "عِنَب", de: "Weintrauben", translit: "ʿinab" },
  { ar: "رُمَّان", de: "Granatapfel", translit: "rummān" },
  { ar: "زَيْت", de: "Öl", translit: "zayt" },
  { ar: "مِلْح", de: "Salz", translit: "milḥ" },
  { ar: "سُكَّر", de: "Zucker", translit: "sukkar" },
  { ar: "بَحْر", de: "Meer", translit: "baḥr" },
  { ar: "نَهْر", de: "Fluss", translit: "nahr" },
  { ar: "سَمَاء", de: "Himmel", translit: "samāʾ" },
  { ar: "أَرْض", de: "Erde", translit: "arḍ" },
  { ar: "رِيح", de: "Wind", translit: "rīḥ" },
  { ar: "مَطَر", de: "Regen", translit: "maṭar" },
  { ar: "ثَلْج", de: "Schnee", translit: "thalj" },
  { ar: "نَار", de: "Feuer", translit: "nār" },
  { ar: "طَيْر", de: "Vogel", translit: "ṭayr" },
  { ar: "نَحْل", de: "Bienen", translit: "naḥl" },
  { ar: "غَنَم", de: "Schafe", translit: "ghanam" },
  { ar: "جَمَل", de: "Kamel", translit: "jamal" },
  { ar: "حُوت", de: "Wal", translit: "ḥūt" },
  { ar: "عُصْفُور", de: "Spatz", translit: "ʿuṣfūr" },
  { ar: "مَسْجِد", de: "Moschee", translit: "masjid" },
  { ar: "صَلَاة", de: "Gebet", translit: "ṣalāh" },
  { ar: "دُعَاء", de: "Bittgebet", translit: "duʿāʾ" },
  { ar: "كُرْسِيّ", de: "Stuhl", translit: "kursī" },
  { ar: "سَرِير", de: "Bett", translit: "sarīr" },
  { ar: "طَعَام", de: "Essen", translit: "ṭaʿām" },
];

// Quran-Grundwortschatz (5.3 "Quran-Grundwortschatz mit wiederkehrenden
// Woertern"). Diese Woerter kommen in Juz Amma immer wieder vor.
export const QURAN_CORE_WORDS: Word[] = [
  { ar: "اللَّه", de: "Allah", translit: "allāh" },
  { ar: "رَبّ", de: "Herr", translit: "rabb" },
  { ar: "قُلْ", de: "sag", translit: "qul" },
  { ar: "هُوَ", de: "er", translit: "huwa" },
  { ar: "مِنْ", de: "von", translit: "min" },
  { ar: "فِي", de: "in", translit: "fī" },
  { ar: "مَا", de: "was", translit: "mā" },
  { ar: "لَا", de: "nicht", translit: "lā" },
  { ar: "إِنَّ", de: "wahrlich", translit: "inna" },
  { ar: "كُلّ", de: "jeder", translit: "kull" },
  { ar: "عَلَى", de: "auf", translit: "ʿalā" },
  { ar: "يَوْم", de: "Tag", translit: "yawm" },
  { ar: "النَّاس", de: "die Menschen", translit: "an-nās" },
  { ar: "الْحَمْد", de: "das Lob", translit: "al-ḥamd" },
  { ar: "رَحْمَة", de: "Barmherzigkeit", translit: "raḥma" },
  { ar: "الْعَالَمِين", de: "die Welten", translit: "al-ʿālamīn" },
  { ar: "مَلِك", de: "König", translit: "malik" },
  { ar: "الصِّرَاط", de: "der Weg", translit: "aṣ-ṣirāṭ" },
  { ar: "نِعْمَة", de: "Gnade", translit: "niʿma" },
  { ar: "الْخَيْر", de: "das Gute", translit: "al-khayr" },
  { ar: "الشَّرّ", de: "das Schlechte", translit: "ash-sharr" },
  { ar: "الْجَنَّة", de: "das Paradies", translit: "al-janna" },
  { ar: "الْكِتَاب", de: "das Buch", translit: "al-kitāb" },
  { ar: "الْأَرْض", de: "die Erde", translit: "al-arḍ" },
  { ar: "السَّمَاء", de: "der Himmel", translit: "as-samāʾ" },
  { ar: "الْقَلْب", de: "das Herz", translit: "al-qalb" },
];
