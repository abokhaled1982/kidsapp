// Ableitungen aus den Levelplaenen: welche Inhalte gehoeren zu einem Level,
// wie viel davon ist geschafft und was ist die eine naechste Aufgabe
// (Anforderungen 16: "Die Startseite zeigt genau eine klare naechste Aufgabe").
// Alles hier ist rein und ohne React, damit es im Test direkt pruefbar ist.

import { CATEGORIES, type Category } from "@/data/categories";
import { HARAKAT, MADD_PAIRS, QURAN_CORE_WORDS, SHORT_WORDS, SYLLABLES } from "@/data/harakat";
import { SURAHS, type Surah } from "@/data/juzamma";
import { LETTERS, SOUND_PAIRS } from "@/data/letters";
import {
  LEVEL_ORDER,
  LEVEL_PLANS,
  SHORT_SURAH_MAX_WORDS,
  STAGE_LABELS,
  type LearningPath,
  type LevelPlan,
  type LevelStage,
} from "@/data/levels";
import { tajweedForLevel } from "@/data/tajweed";
import {
  ayahKey,
  coreWordKey,
  harakaKey,
  letterFormKey,
  letterKey,
  maddKey,
  quranWordKey,
  shortWordKey,
  soundPairKey,
  surahKey,
  syllableKey,
  tajweedKey,
  wordKey,
} from "@/data/progressKeys";
import { WORDS } from "@/data/words";
import { drillTargetForKey } from "@/data/wordSources";
import type { LearningLevel } from "./profileModel";

// Punktschwelle, ab der ein gesprochener Inhalt als gemeistert gilt.
// Gleicher Wert wie auf der Startseite, damit Karten und Levelfortschritt
// nicht unterschiedlich rechnen.
export const MASTERY_SCORE = 75;
// Wie oft ein Hoerinhalt (Buchstabe, Haraka, Tajweed-Regel) gehoert werden
// soll, bevor er als bearbeitet zaehlt.
export const HEARD_TARGET = 2;

export type ProgressSnapshot = {
  mastered: Record<string, number>;
  heard: Record<string, number>;
};

export type LevelItem = {
  // Schluessel im Progress-Store.
  key: string;
  // Arabische Anzeige.
  label: string;
  // Deutsche Bedeutung oder Merkhilfe, wenn vorhanden.
  hint?: string;
  stage: LevelStage;
  // "listen" = anhoeren und erkennen reicht (Formen zuordnen, zwei Laute
  // unterscheiden, eine Regel kennen), "speak" = das Sprachmodell bewertet die
  // Aussprache. Alles, was ein Kind vorlesen kann - Buchstabe, Haraka, Silbe,
  // Madd, Wort, Ayah - ist "speak".
  mode: "listen" | "speak";
  // Wenn gesetzt, gilt der Inhalt erst als geschafft, wenn alle Teilstuecke
  // sitzen (eine Sura besteht aus ihren Woertern).
  parts?: string[];
};

export type PathProgress = {
  path: LearningPath;
  total: number;
  done: number;
  ratio: number;
};

export type LevelProgress = {
  level: LearningLevel;
  total: number;
  done: number;
  ratio: number;
  paths: PathProgress[];
};

export type NextStep = {
  path: LearningPath;
  item: LevelItem;
  // Position innerhalb des Lernpfads, 1-basiert fuer die Anzeige.
  position: number;
  total: number;
};

// --- Progress-Schluessel -----------------------------------------------------
// Die Bauer liegen in der Datenschicht, damit Wortquellen und Selektoren
// dieselben Namen benutzen. Hier nur erneut exportiert.

export {
  ayahKey,
  coreWordKey,
  harakaKey,
  letterFormKey,
  letterKey,
  maddKey,
  quranWordKey,
  shortWordKey,
  soundPairKey,
  surahKey,
  syllableKey,
  tajweedKey,
  wordKey,
} from "@/data/progressKeys";

// --- Levelzugriff -----------------------------------------------------------

export function clampLevel(value: number): LearningLevel {
  const rounded = Math.round(value);
  if (rounded <= 5) return 5;
  if (rounded >= 9) return 9;
  return rounded as LearningLevel;
}

export function levelPlan(level: number): LevelPlan {
  return LEVEL_PLANS[clampLevel(level)];
}

export function levelsInOrder(): LevelPlan[] {
  return LEVEL_ORDER.map((level) => LEVEL_PLANS[level]);
}

export function nextLevel(level: number): LearningLevel | null {
  const current = clampLevel(level);
  return current === 9 ? null : clampLevel(current + 1);
}

export function previousLevel(level: number): LearningLevel | null {
  const current = clampLevel(level);
  return current === 5 ? null : clampLevel(current - 1);
}

// --- Suren ------------------------------------------------------------------

// Basmala steht als Ayah 0 im Datensatz und zaehlt nicht zum Umfang.
export function surahWordCount(surah: Surah): number {
  return surah.ayat.filter((ayah) => ayah.n > 0).reduce((sum, ayah) => sum + ayah.words.length, 0);
}

export function surahDifficulty(surah: Surah): number {
  return surahWordCount(surah);
}

export function isShortSurah(surah: Surah): boolean {
  return surahWordCount(surah) <= SHORT_SURAH_MAX_WORDS;
}

export function surahsForLevel(level: number): Surah[] {
  const current = clampLevel(level);
  // Level 5 und 6 arbeiten an Buchstaben, Harakat und Silben - noch keine Suren.
  if (current <= 6) return [];
  const byDifficulty = [...SURAHS].sort((a, b) => surahDifficulty(a) - surahDifficulty(b));
  if (current === 7) return byDifficulty.filter(isShortSurah);
  if (current === 8) return byDifficulty;
  // Level 9 wiederholt den ganzen Juz in Mushaf-Reihenfolge.
  return [...SURAHS];
}

export function wordsForLevel(level: number): { ar: string; de: string; key: string }[] {
  const current = clampLevel(level);
  if (current === 5) return [];
  if (current === 6) {
    return SHORT_WORDS.map((word) => ({ ar: word.ar, de: word.de, key: shortWordKey(word.ar) }));
  }
  if (current === 7) {
    const vocabulary = CATEGORIES.flatMap((category) =>
      (WORDS[category.id] ?? []).map((word) => ({
        ar: word.ar,
        de: word.de,
        key: wordKey(category.id, word.ar),
      })),
    );
    return [
      ...vocabulary,
      ...QURAN_CORE_WORDS.map((word) => ({ ar: word.ar, de: word.de, key: coreWordKey(word.ar) })),
    ];
  }
  return QURAN_CORE_WORDS.map((word) => ({ ar: word.ar, de: word.de, key: coreWordKey(word.ar) }));
}

// --- Inhalte pro Lernpfad ---------------------------------------------------

function surahItems(level: number): LevelItem[] {
  return surahsForLevel(level).map((surah) => ({
    key: surahKey(surah.n),
    label: surah.name_ar,
    hint: surah.name_de,
    stage: "surahShort",
    mode: "speak",
    parts: surah.ayat
      .filter((ayah) => ayah.n > 0)
      .flatMap((ayah) => ayah.words.map((word) => quranWordKey(surah.n, ayah.n, word.ar))),
  }));
}

function ayahItems(level: number): LevelItem[] {
  return surahsForLevel(level).flatMap((surah) =>
    surah.ayat
      .filter((ayah) => ayah.n > 0)
      .map((ayah) => ({
        key: ayahKey(surah.n, ayah.n),
        label: ayah.words.map((word) => word.ar).join(" "),
        hint: `${surah.name_de} · Ayah ${ayah.n}`,
        stage: "ayah" as LevelStage,
        mode: "speak" as const,
        parts: ayah.words.map((word) => quranWordKey(surah.n, ayah.n, word.ar)),
      })),
  );
}

export function itemsForStage(stage: LevelStage, level: number): LevelItem[] {
  const current = clampLevel(level);
  switch (stage) {
    case "letters":
      return LETTERS.map((letter) => ({
        key: letterKey(letter.id),
        label: letter.ar,
        hint: letter.name_ar,
        stage,
        mode: "speak",
      }));
    case "letterForms":
      return LETTERS.filter((letter) => letter.connects).map((letter) => ({
        key: letterFormKey(letter.id),
        label: letter.forms.initial ?? letter.ar,
        hint: letter.name_ar,
        stage,
        mode: "listen",
      }));
    case "soundPairs":
      return SOUND_PAIRS.filter((pair) => pair.level <= current).map((pair) => ({
        key: soundPairKey(pair.id),
        label: `${pair.a} ${pair.b}`,
        hint: pair.title,
        stage,
        mode: "listen",
      }));
    case "harakat":
      return HARAKAT.filter((haraka) => haraka.level <= Math.max(current, 6)).map((haraka) => ({
        key: harakaKey(haraka.id),
        label: haraka.display,
        hint: haraka.name_de,
        stage,
        mode: "speak",
      }));
    case "syllables":
      return SYLLABLES.map((cell) => ({
        key: syllableKey(cell.ar),
        label: cell.ar,
        hint: cell.translit,
        stage,
        mode: "speak",
      }));
    case "madd":
      return MADD_PAIRS.map((pair) => ({
        key: maddKey(pair.short.ar),
        label: `${pair.short.ar} ${pair.long.ar}`,
        hint: `${pair.short.translit} / ${pair.long.translit}`,
        stage,
        mode: "speak",
      }));
    case "shortWords":
      return SHORT_WORDS.map((word) => ({
        key: shortWordKey(word.ar),
        label: word.ar,
        hint: word.de,
        stage,
        mode: "speak",
      }));
    case "quranWords":
      return QURAN_CORE_WORDS.map((word) => ({
        key: coreWordKey(word.ar),
        label: word.ar,
        hint: word.de,
        stage,
        mode: "speak",
      }));
    case "vocabulary":
      return CATEGORIES.flatMap((category) =>
        (WORDS[category.id] ?? []).map((word) => ({
          key: wordKey(category.id, word.ar),
          label: word.ar,
          hint: word.de,
          stage,
          mode: "speak" as const,
        })),
      );
    case "surahShort":
    case "juz":
      return surahItems(current);
    case "ayah":
      return ayahItems(current);
    case "tajweed":
      return tajweedForLevel(current).map((rule) => ({
        key: tajweedKey(rule.id),
        label: rule.arabic,
        hint: rule.title,
        stage,
        mode: "listen",
      }));
    case "review":
      // Wiederholung hat keine eigenen Inhalte, sie holt sich die schwachen
      // Stellen der anderen Pfade - siehe reviewQueue().
      return [];
  }
}

export function pathItems(path: LearningPath, level: number): LevelItem[] {
  // count 0 heisst: der Inhalt ist angekuendigt, steht aber noch nicht in den
  // Daten (Juz Tabarak). Ohne diese Bremse wuerde so ein Pfad die Inhalte
  // seiner Inhaltsart anzeigen und einen Fortschritt vortaeuschen, den es fuer
  // ihn gar nicht gibt.
  if (path.count === 0) return [];
  return itemsForStage(path.stage, level);
}

export function levelItems(level: number): LevelItem[] {
  const seen = new Set<string>();
  const items: LevelItem[] = [];
  for (const path of levelPlan(level).paths) {
    for (const item of pathItems(path, level)) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      items.push(item);
    }
  }
  return items;
}

// --- Wohin fuehrt ein Inhalt ------------------------------------------------

// Die eine Stelle, die entscheidet, welcher Bildschirm einen Inhalt uebt.
// Startseite, Uebungsseite und Buchstabenwelt fragen nur hier - sonst zeigt
// eine Karte auf einen Bildschirm, der den Inhalt gar nicht kennt.
export function drillRouteForItem(item: LevelItem): string | null {
  // Suren und Ayat werden im Quran-Bildschirm rezitiert, der die Ayat selbst
  // durchlaeuft. Beide Schluessel tragen die Surennummer an zweiter Stelle.
  if (item.stage === "surahShort" || item.stage === "juz" || item.stage === "ayah") {
    const surah = Number(item.key.split(":")[1]);
    return Number.isFinite(surah) ? `/quran/${surah}` : null;
  }
  const target = drillTargetForKey(item.key);
  return target ? `/play/${target.sourceId}?start=${target.index}` : null;
}

// Nur Inhalte, die das Sprachmodell bewerten kann, fuehren in die Aussprache.
export function speakRouteForItem(item: LevelItem): string | null {
  return item.mode === "speak" ? drillRouteForItem(item) : null;
}

// Wortkategorien gehoeren nicht zu jedem Alter: Level 5 und 6 arbeiten an
// Buchstaben, Zeichen und Silben. Ab welchem Level sie dazukommen, steht im
// Levelplan (ein Pfad mit Inhaltsart "vocabulary"), damit es keine zweite Liste
// gibt. Ab dann bleiben sie: Level 8 und 9 haben die Suren als Ziel, aber ein
// Kind soll die Woerter, die es einmal geuebt hat, weiter sprechen koennen.
const CATEGORY_LEVEL: LearningLevel | null =
  LEVEL_ORDER.find((level) => LEVEL_PLANS[level].paths.some((path) => path.stage === "vocabulary")) ??
  null;

export function categoriesForLevel(level: number): Category[] {
  if (CATEGORY_LEVEL === null) return [];
  return clampLevel(level) >= CATEGORY_LEVEL ? CATEGORIES : [];
}

// --- Lernwelten fuer die Startseite -----------------------------------------

// Eine Kachel pro Inhaltsart des Levels: Bild, ein Wort, Fortschritt und ein
// Ziel, das direkt auf den ersten offenen Inhalt zeigt (Anforderungen 8 und 16).
// Ein Level hat mehrere Lernpfade pro Inhaltsart ("Buchstaben kennenlernen",
// "Formfamilien", "Mund und Zunge" sind alle drei stage "letters") - fuer ein
// Kind ist das eine Welt.
export type LearningWorld = {
  stage: LevelStage;
  title: string;
  emoji: string;
  route: string;
  total: number;
  done: number;
  ratio: number;
};

export function worldsForLevel(level: number, snapshot: ProgressSnapshot): LearningWorld[] {
  const plan = levelPlan(level);
  const minScore = plan.mastery.minScoreNew;
  const worlds: LearningWorld[] = [];
  const seen = new Set<LevelStage>();
  for (const path of plan.paths) {
    // Wiederholung hat keine eigenen Inhalte - sie lebt auf der Uebungsseite.
    if (path.stage === "review" || seen.has(path.stage)) continue;
    seen.add(path.stage);
    const items = itemsForStage(path.stage, plan.level);
    if (items.length === 0) continue;
    const open = items.find((item) => !itemDone(item, snapshot, minScore));
    const done = items.filter((item) => itemDone(item, snapshot, minScore)).length;
    const label = STAGE_LABELS[path.stage];
    worlds.push({
      stage: path.stage,
      title: label.title,
      emoji: label.emoji,
      // Erst der offene Inhalt, dann der Anfang der Welt, sonst der Pfad-Screen.
      route:
        (open ? drillRouteForItem(open) : null) ?? drillRouteForItem(items[0]) ?? path.route,
      total: items.length,
      done,
      ratio: done / items.length,
    });
  }
  return worlds;
}


// --- Fortschritt ------------------------------------------------------------

export function itemDone(item: LevelItem, snapshot: ProgressSnapshot, minScore = MASTERY_SCORE): boolean {
  if (item.parts && item.parts.length > 0) {
    return item.parts.every((key) => (snapshot.mastered[key] ?? 0) >= minScore);
  }
  const score = snapshot.mastered[item.key] ?? 0;
  if (item.mode === "speak") return score >= minScore;
  return (snapshot.heard[item.key] ?? 0) >= HEARD_TARGET || score >= minScore;
}

export function levelProgress(level: number, snapshot: ProgressSnapshot): LevelProgress {
  const plan = levelPlan(level);
  const minScore = plan.mastery.minScoreNew;
  const paths = plan.paths.map((path) => {
    const items = pathItems(path, plan.level);
    const done = items.filter((item) => itemDone(item, snapshot, minScore)).length;
    return { path, total: items.length, done, ratio: items.length ? done / items.length : 0 };
  });
  const items = levelItems(plan.level);
  const done = items.filter((item) => itemDone(item, snapshot, minScore)).length;
  return {
    level: plan.level,
    total: items.length,
    done,
    ratio: items.length ? done / items.length : 0,
    paths,
  };
}

// Genau eine naechste Aufgabe: der erste offene Inhalt im ersten Lernpfad,
// der noch nicht fertig ist.
export function nextStep(level: number, snapshot: ProgressSnapshot): NextStep | null {
  const plan = levelPlan(level);
  const minScore = plan.mastery.minScoreNew;
  for (const path of plan.paths) {
    const items = pathItems(path, plan.level);
    if (items.length === 0) continue;
    const index = items.findIndex((item) => !itemDone(item, snapshot, minScore));
    if (index >= 0) {
      return { path, item: items[index], position: index + 1, total: items.length };
    }
  }
  return null;
}

// Echte Baustellen zuerst: absteigend nach bisher erreichter Punktzahl. Wer
// schon Punkte hat, aber unter der Schwelle liegt, ist geuebt und noch nicht
// sicher - genau der Fall fuer die Fehlerwerkstatt (5.4). Noch nie geuebte
// Inhalte (0 Punkte) stehen danach.
export function reviewQueue(level: number, snapshot: ProgressSnapshot, limit = 10): LevelItem[] {
  const plan = levelPlan(level);
  const minScore = plan.mastery.minScoreNew;
  const score = (item: LevelItem) => {
    if (item.parts && item.parts.length > 0) {
      const sum = item.parts.reduce((total, key) => total + (snapshot.mastered[key] ?? 0), 0);
      return sum / item.parts.length;
    }
    return snapshot.mastered[item.key] ?? 0;
  };
  return levelItems(plan.level)
    .filter((item) => !itemDone(item, snapshot, minScore))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}

// Ein Level ist abgeschlossen, wenn jeder uebbare Inhalt die Punktschwelle des
// Levels erreicht hat. Die ausformulierten Abschlusskriterien stehen zusaetzlich
// als Text in plan.mastery und werden dem Elternteil angezeigt.
export function masteryReached(level: number, snapshot: ProgressSnapshot): boolean {
  const progress = levelProgress(level, snapshot);
  return progress.total > 0 && progress.done === progress.total;
}

export function levelHeadline(level: number): string {
  const plan = levelPlan(level);
  return `${plan.level}. Lernlevel · ${plan.summary}`;
}
