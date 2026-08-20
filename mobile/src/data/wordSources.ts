// Uebungsquellen fuer den Aussprache-Bildschirm (/play/[categoryId]).
//
// Kern der App: das Kind liest vor, das Sprachmodell prueft. Damit das fuer
// jeden Inhalt gilt - Buchstabe, Haraka, Silbe, Madd, Wort, Quranwort - ist
// hier jede Inhaltsart eine Quelle mit denselben Feldern. Der Bildschirm kennt
// nur noch "Quelle mit Woertern", die Aufnahme- und Bewertungsmechanik bleibt
// fuer alle gleich.
//
// Wichtig: keine zweiten Progress-Schluessel. Jede Quelle liefert genau die
// Schluessel aus progressKeys.ts, damit Levelfortschritt und Wiederholung
// dieselben Werte lesen.

import { CATEGORIES, type Word } from "./categories";
import { HARAKAT, HARAKAT_BY_ID, MADD_PAIRS, QURAN_CORE_WORDS, SHORT_WORDS, SYLLABLES } from "./harakat";
import { LETTERS, type Letter } from "./letters";
import { pictureFor, withPictures } from "./pictures";
import {
  coreWordKey,
  harakaKey,
  letterKey,
  maddKey,
  shortWordKey,
  syllableKey,
  wordKey,
} from "./progressKeys";
import { WORDS } from "./words";

export type WordSource = {
  id: string;
  title: string;
  emoji: string;
  words: Word[];
  // Progress-Schluessel fuer ein Wort dieser Quelle.
  keyFor: (ar: string) => string;
};

const FATHA = HARAKAT_BY_ID.fatha.symbol;

// Ein einzelner Konsonant ist nicht sprechbar und fuer die Erkennung nicht
// bewertbar. Zum Vorlesen bekommt jeder Buchstabe darum ein Fatha - genau die
// Silbe, mit der auch die Silbentreppe anfaengt. Alif traegt dabei das Hamza,
// sonst waere aus "ا" kein kurzer Laut zu hoeren.
export function letterSpeakTarget(letter: Letter): string {
  return letter.id === "alif" ? `أ${FATHA}` : `${letter.ar}${FATHA}`;
}

type Entry = { word: Word; key: string };

// Baut eine Quelle aus Paaren von Wort und Schluessel. Der Schluessel wird
// ueber das arabische Wort nachgeschlagen, weil der Bildschirm nur das Wort
// kennt (source.keyFor(word.ar)).
function buildSource(id: string, title: string, emoji: string, entries: Entry[]): WordSource {
  const keys = new Map(entries.map((entry) => [entry.word.ar, entry.key]));
  return {
    id,
    title,
    emoji,
    words: withPictures(entries.map((entry) => entry.word)),
    keyFor: (ar) => keys.get(ar) ?? `${id}:${ar}`,
  };
}

// --- Buchstaben, Zeichen, Silben (Level 5 und 6) -----------------------------

export const LETTER_SOURCE: WordSource = buildSource(
  "buchstaben",
  "Buchstaben sprechen",
  "🔤",
  LETTERS.map((letter) => ({
    word: {
      ar: letterSpeakTarget(letter),
      de: `${letter.translit} wie ${letter.example.de}`,
      translit: letter.id === "alif" ? "a" : `${letter.sound}a`,
      // Bildwort des Buchstaben als Merkhilfe.
      pic: pictureFor(letter.example.ar),
    },
    key: letterKey(letter.id),
  })),
);

export const HARAKA_SOURCE: WordSource = buildSource(
  "harakat",
  "Zeichen sprechen",
  "◌َ",
  // Ein Harakat allein klingt nicht - gesprochen wird das Beispiel des Zeichens.
  HARAKAT.map((haraka) => ({
    word: {
      ar: haraka.example.ar,
      de: `${haraka.name_de} · ${haraka.example.de}`,
      translit: haraka.example.translit,
    },
    key: harakaKey(haraka.id),
  })),
);

export const SYLLABLE_SOURCE: WordSource = buildSource(
  "silben",
  "Silbentreppe",
  "🪜",
  SYLLABLES.map((cell) => ({
    word: {
      ar: cell.ar,
      de: HARAKAT_BY_ID[cell.haraka].name_de,
      translit: cell.translit,
    },
    key: syllableKey(cell.ar),
  })),
);

export const MADD_SOURCE: WordSource = buildSource(
  "madd",
  "Lange Laute",
  "〰️",
  // Geuebt wird die lange Form - das Halten des Vokals ist die Aufgabe. Der
  // kurze Gegenpart steht als Vergleich im Text.
  MADD_PAIRS.map((pair) => ({
    word: {
      ar: pair.long.ar,
      de: `kurz ${pair.short.translit} — lang ${pair.long.translit}`,
      translit: pair.long.translit,
    },
    key: maddKey(pair.short.ar),
  })),
);

// --- Woerter (Level 6 bis 9) -------------------------------------------------

export const EXTRA_WORD_SOURCES: WordSource[] = [
  buildSource(
    "kurz",
    "Kurze Wörter",
    "📗",
    SHORT_WORDS.map((word) => ({ word, key: shortWordKey(word.ar) })),
  ),
  buildSource(
    "quran-core",
    "Quran-Grundwortschatz",
    "📖",
    QURAN_CORE_WORDS.map((word) => ({ word, key: coreWordKey(word.ar) })),
  ),
];

// Quellen, die nicht aus einer Wortkategorie kommen. Reihenfolge = Lernweg.
export const STAGE_WORD_SOURCES: WordSource[] = [
  LETTER_SOURCE,
  HARAKA_SOURCE,
  SYLLABLE_SOURCE,
  MADD_SOURCE,
  ...EXTRA_WORD_SOURCES,
];

export const WORD_SOURCES: WordSource[] = [
  ...CATEGORIES.map((category) =>
    buildSource(
      category.id,
      category.title,
      category.emoji,
      (WORDS[category.id] ?? []).map((word) => ({ word, key: wordKey(category.id, word.ar) })),
    ),
  ),
  ...STAGE_WORD_SOURCES,
];

export function wordSource(id: string | undefined): WordSource | undefined {
  if (!id) return undefined;
  return WORD_SOURCES.find((source) => source.id === id);
}

// --- Von einem Progress-Schluessel zur Uebung --------------------------------

// Umgekehrte Richtung: der Levelfortschritt kennt nur Schluessel
// ("letter:ba", "syl:بَ"). Damit ein Tipp auf einen offenen Inhalt direkt in
// die passende Uebung springt, wird hier einmalig die Rueckabbildung gebaut.
export type DrillTarget = { sourceId: string; index: number };

const DRILL_TARGETS: Map<string, DrillTarget> = (() => {
  const map = new Map<string, DrillTarget>();
  for (const source of WORD_SOURCES) {
    source.words.forEach((word, index) => {
      const key = source.keyFor(word.ar);
      // Der erste Treffer gewinnt: ein Wort kann in mehreren Listen stehen,
      // aber ein Schluessel gehoert immer zu genau einer Quelle.
      if (!map.has(key)) map.set(key, { sourceId: source.id, index });
    });
  }
  return map;
})();

export function drillTargetForKey(key: string): DrillTarget | null {
  return DRILL_TARGETS.get(key) ?? null;
}

// Das Uebungswort hinter einem Schluessel - die Startseite zeigt damit das Bild
// des naechsten Inhalts, statt nur den arabischen Text.
export function drillWordForKey(key: string): Word | null {
  const target = drillTargetForKey(key);
  if (!target) return null;
  const source = wordSource(target.sourceId);
  return source?.words[target.index] ?? null;
}
