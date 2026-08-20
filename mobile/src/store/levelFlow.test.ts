// Unit-Tests fuer die Levelableitungen. Kernzusagen aus Anforderung 16:
// die Startseite zeigt genau eine naechste Aufgabe, und der Fortschritt eines
// Levels haengt an echten Inhalten - nicht an einer Schaetzung.

import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/data/categories";
import { HARAKAT, MADD_PAIRS, QURAN_CORE_WORDS, SHORT_WORDS, SYLLABLES } from "@/data/harakat";
import { SURAHS } from "@/data/juzamma";
import { LETTERS, SOUND_PAIRS } from "@/data/letters";
import { LEVEL_ORDER, LEVEL_PLANS, SHORT_SURAH_MAX_WORDS } from "@/data/levels";
import { tajweedForLevel } from "@/data/tajweed";
import { WORDS } from "@/data/words";
import {
  HEARD_TARGET,
  MASTERY_SCORE,
  categoriesForLevel,
  clampLevel,
  coreWordKey,
  harakaKey,
  isShortSurah,
  itemDone,
  itemsForStage,
  letterKey,
  levelHeadline,
  levelItems,
  levelPlan,
  levelProgress,
  levelsInOrder,
  masteryReached,
  nextLevel,
  nextStep,
  previousLevel,
  quranWordKey,
  reviewQueue,
  shortWordKey,
  surahDifficulty,
  surahWordCount,
  surahsForLevel,
  syllableKey,
  wordKey,
  wordsForLevel,
  type LevelItem,
  type ProgressSnapshot,
} from "./levelFlow";

const empty = (): ProgressSnapshot => ({ mastered: {}, heard: {} });

const withHeard = (keys: string[], times = HEARD_TARGET): ProgressSnapshot => ({
  mastered: {},
  heard: Object.fromEntries(keys.map((key) => [key, times])),
});

const withScores = (keys: string[], score: number): ProgressSnapshot => ({
  mastered: Object.fromEntries(keys.map((key) => [key, score])),
  heard: {},
});

// Alle Inhalte eines Levels als geschafft markieren - Hoerinhalte ueber heard,
// Sprechinhalte (auch Teilstuecke) ueber mastered.
function completeSnapshot(level: number): ProgressSnapshot {
  const snapshot = empty();
  const score = LEVEL_PLANS[clampLevel(level)].mastery.minScoreNew;
  for (const item of levelItems(level)) {
    if (item.parts && item.parts.length > 0) {
      for (const key of item.parts) snapshot.mastered[key] = score;
    } else if (item.mode === "speak") {
      snapshot.mastered[item.key] = score;
    } else {
      snapshot.heard[item.key] = HEARD_TARGET;
    }
  }
  return snapshot;
}

describe("clampLevel", () => {
  it("haelt Werte im Bereich 5 bis 9", () => {
    expect(clampLevel(0)).toBe(5);
    expect(clampLevel(4)).toBe(5);
    expect(clampLevel(5)).toBe(5);
    expect(clampLevel(7)).toBe(7);
    expect(clampLevel(9)).toBe(9);
    expect(clampLevel(12)).toBe(9);
  });

  it("rundet Zwischenwerte", () => {
    expect(clampLevel(6.4)).toBe(6);
    expect(clampLevel(6.6)).toBe(7);
  });
});

describe("Levelzugriff", () => {
  it("liefert fuer jedes Level den passenden Plan", () => {
    for (const level of LEVEL_ORDER) {
      expect(levelPlan(level).level).toBe(level);
    }
    // Ausserhalb des Bereichs wird geklemmt, nicht undefined geliefert.
    expect(levelPlan(2).level).toBe(5);
    expect(levelPlan(99).level).toBe(9);
  });

  it("gibt die Level in Reihenfolge", () => {
    expect(levelsInOrder().map((plan) => plan.level)).toEqual([5, 6, 7, 8, 9]);
  });

  it("kennt Vorgaenger und Nachfolger, mit Grenzen", () => {
    expect(previousLevel(5)).toBeNull();
    expect(previousLevel(6)).toBe(5);
    expect(nextLevel(8)).toBe(9);
    expect(nextLevel(9)).toBeNull();
  });

  it("baut die Kopfzeile aus Level und Kurzzeile", () => {
    expect(levelHeadline(6)).toBe(`6. Lernlevel · ${LEVEL_PLANS[6].summary}`);
  });
});

describe("Suren pro Level", () => {
  it("zaehlt die Basmala nicht zum Umfang einer Sura", () => {
    const surah = SURAHS[0];
    const withBasmala = surah.ayat.reduce((sum, ayah) => sum + ayah.words.length, 0);
    expect(surahWordCount(surah)).toBe(withBasmala - 4);
    expect(surahDifficulty(surah)).toBe(surahWordCount(surah));
  });

  it("zeigt in Level 5 und 6 noch keine Suren", () => {
    expect(surahsForLevel(5)).toEqual([]);
    expect(surahsForLevel(6)).toEqual([]);
  });

  it("gibt Level 7 nur kurze Suren, leichteste zuerst", () => {
    const list = surahsForLevel(7);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.every(isShortSurah)).toBe(true);
    for (const surah of list) {
      expect(surahWordCount(surah)).toBeLessThanOrEqual(SHORT_SURAH_MAX_WORDS);
    }
    const counts = list.map(surahWordCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it("gibt Level 8 alle Suren aufsteigend nach Schwierigkeit", () => {
    const list = surahsForLevel(8);
    expect(list).toHaveLength(SURAHS.length);
    const counts = list.map(surahWordCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it("gibt Level 9 den ganzen Juz in Mushaf-Reihenfolge", () => {
    expect(surahsForLevel(9).map((surah) => surah.n)).toEqual(SURAHS.map((surah) => surah.n));
  });

  it("liefert bei jedem Aufruf eine neue Liste, nie die Originaldaten", () => {
    const list = surahsForLevel(9);
    expect(list).not.toBe(SURAHS);
    list.reverse();
    expect(surahsForLevel(9).map((s) => s.n)).toEqual(SURAHS.map((s) => s.n));
  });
});

describe("wordsForLevel", () => {
  it("hat in Level 5 noch keine Woerter", () => {
    expect(wordsForLevel(5)).toEqual([]);
  });

  it("nutzt in Level 6 die kurzen Lesewoerter", () => {
    const words = wordsForLevel(6);
    expect(words).toHaveLength(SHORT_WORDS.length);
    expect(words[0].key).toBe(shortWordKey(SHORT_WORDS[0].ar));
  });

  it("kombiniert in Level 7 Alltagswortschatz und Quranwoerter", () => {
    const vocab = CATEGORIES.reduce((sum, c) => sum + (WORDS[c.id]?.length ?? 0), 0);
    const words = wordsForLevel(7);
    expect(words).toHaveLength(vocab + QURAN_CORE_WORDS.length);
    expect(words.some((word) => word.key === coreWordKey(QURAN_CORE_WORDS[0].ar))).toBe(true);
    expect(words.some((word) => word.key.startsWith(`${CATEGORIES[0].id}:`))).toBe(true);
  });

  it("konzentriert Level 8 und 9 auf den Quran-Grundwortschatz", () => {
    for (const level of [8, 9]) {
      expect(wordsForLevel(level)).toHaveLength(QURAN_CORE_WORDS.length);
    }
  });
});

describe("itemsForStage", () => {
  it("erzeugt fuer jede Inhaltsart Inhalte mit eindeutigen Schluesseln", () => {
    const stages = [
      ["letters", LETTERS.length],
      ["letterForms", LETTERS.filter((l) => l.connects).length],
      ["syllables", SYLLABLES.length],
      ["madd", MADD_PAIRS.length],
      ["shortWords", SHORT_WORDS.length],
      ["quranWords", QURAN_CORE_WORDS.length],
    ] as const;
    for (const [stage, count] of stages) {
      const items = itemsForStage(stage, 6);
      expect(items, stage).toHaveLength(count);
      expect(new Set(items.map((item) => item.key)).size, stage).toBe(count);
    }
  });

  it("baut Hoerinhalte als listen und Sprechinhalte als speak", () => {
    // Nur was ein Kind nicht vorlesen kann, bleibt Hoeren: eine Buchstabenform
    // zuordnen, zwei Laute unterscheiden, einen Regelbegriff kennen.
    for (const stage of ["letterForms", "soundPairs", "tajweed"] as const) {
      expect(itemsForStage(stage, 8).every((item) => item.mode === "listen"), stage).toBe(true);
    }
    // Alles Sprechbare wird vom Sprachmodell bewertet - auch die Inhalte der
    // jüngsten Kinder (Buchstabe, Haraka, Silbe, Madd).
    for (const stage of [
      "letters",
      "harakat",
      "syllables",
      "madd",
      "shortWords",
      "quranWords",
      "vocabulary",
    ] as const) {
      expect(itemsForStage(stage, 8).every((item) => item.mode === "speak"), stage).toBe(true);
    }
  });

  it("staffelt Hoerpaare nach Level", () => {
    expect(itemsForStage("soundPairs", 5)).toHaveLength(SOUND_PAIRS.filter((p) => p.level === 5).length);
    expect(itemsForStage("soundPairs", 8)).toHaveLength(SOUND_PAIRS.length);
  });

  it("zeigt Tanwin erst ab Level 7, die Grundzeichen aber schon in Level 5", () => {
    const level6 = itemsForStage("harakat", 6);
    expect(level6).toHaveLength(HARAKAT.filter((h) => h.level === 6).length);
    expect(itemsForStage("harakat", 7)).toHaveLength(HARAKAT.length);
    // Level 5 hat keinen Harakat-Pfad, darf aber nicht leer laufen.
    expect(itemsForStage("harakat", 5)).toHaveLength(level6.length);
  });

  it("liefert Tajweed erst ab Level 8", () => {
    expect(itemsForStage("tajweed", 7)).toEqual([]);
    expect(itemsForStage("tajweed", 8)).toHaveLength(tajweedForLevel(8).length);
    expect(itemsForStage("tajweed", 9)).toHaveLength(tajweedForLevel(9).length);
  });

  it("haengt an jede Sura ihre Woerter als Teilstuecke", () => {
    const items = itemsForStage("surahShort", 7);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.parts?.length, item.key).toBeGreaterThan(0);
      // Kein Teilstueck gehoert zur Basmala.
      expect(item.parts?.every((key) => key.startsWith("quran:"))).toBe(true);
    }
    const surah = surahsForLevel(7)[0];
    expect(items[0].parts).toHaveLength(surahWordCount(surah));
  });

  it("baut Ayah-Inhalte aus den Woertern genau einer Ayah", () => {
    const items = itemsForStage("ayah", 8);
    const total = SURAHS.reduce((sum, surah) => sum + surah.ayat.filter((a) => a.n > 0).length, 0);
    expect(items).toHaveLength(total);
    for (const item of items) {
      expect(item.parts?.length, item.key).toBeGreaterThan(0);
      expect(item.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("hat fuer Wiederholung keine eigenen Inhalte", () => {
    expect(itemsForStage("review", 9)).toEqual([]);
  });
});

describe("levelItems", () => {
  it("liefert fuer jedes Level Inhalte mit eindeutigen Schluesseln", () => {
    for (const level of LEVEL_ORDER) {
      const items = levelItems(level);
      expect(items.length, `Level ${level}`).toBeGreaterThan(0);
      expect(new Set(items.map((item) => item.key)).size, `Level ${level}`).toBe(items.length);
    }
  });

  it("entdoppelt Inhalte, die in mehreren Pfaden vorkommen", () => {
    // Level 5 hat drei Pfade auf der Inhaltsart "letters" - sie duerfen den
    // Fortschritt nicht dreifach zaehlen.
    const letterPaths = LEVEL_PLANS[5].paths.filter((path) => path.stage === "letters");
    expect(letterPaths.length).toBeGreaterThan(1);
    const letterItems = levelItems(5).filter((item) => item.stage === "letters");
    expect(letterItems).toHaveLength(LETTERS.length);
  });
});

describe("itemDone", () => {
  const speakItem: LevelItem = { key: "word:x", label: "x", stage: "shortWords", mode: "speak" };
  // Ein Hoerinhalt ist eine Buchstabenform: die erkennt man, man liest sie
  // nicht vor. Der Buchstabe selbst ist inzwischen ein Sprechinhalt.
  const listenItem: LevelItem = { key: "form:ba", label: "بـ", stage: "letterForms", mode: "listen" };
  const partItem: LevelItem = {
    key: "surah:112", label: "…", stage: "surahShort", mode: "speak",
    parts: ["quran:112:1:a", "quran:112:1:b"],
  };

  it("zaehlt Sprechinhalte ab der Punktschwelle", () => {
    expect(itemDone(speakItem, withScores(["word:x"], MASTERY_SCORE - 1))).toBe(false);
    expect(itemDone(speakItem, withScores(["word:x"], MASTERY_SCORE))).toBe(true);
  });

  it("respektiert eine hoehere Schwelle", () => {
    expect(itemDone(speakItem, withScores(["word:x"], 80), 85)).toBe(false);
    expect(itemDone(speakItem, withScores(["word:x"], 85), 85)).toBe(true);
  });

  it("zaehlt Hoerinhalte nach der Zahl der Wiederholungen", () => {
    expect(itemDone(listenItem, empty())).toBe(false);
    expect(itemDone(listenItem, withHeard(["form:ba"], HEARD_TARGET - 1))).toBe(false);
    expect(itemDone(listenItem, withHeard(["form:ba"]))).toBe(true);
  });

  it("akzeptiert bei Hoerinhalten auch eine gute Aufnahme", () => {
    expect(itemDone(listenItem, withScores(["form:ba"], MASTERY_SCORE))).toBe(true);
  });

  it("laesst Sprechinhalte nicht durch bloszes Anhoeren durchgehen", () => {
    // Kern der App: die Aussprache wird vom Sprachmodell geprueft. Ein Kind
    // darf einen Buchstaben nicht abschliessen, indem es ihn nur anhoert.
    const letter: LevelItem = { key: letterKey("ba"), label: "بَ", stage: "letters", mode: "speak" };
    expect(itemDone(letter, withHeard([letterKey("ba")], HEARD_TARGET * 5))).toBe(false);
    expect(itemDone(letter, withScores([letterKey("ba")], MASTERY_SCORE))).toBe(true);
  });

  it("verlangt bei zusammengesetzten Inhalten alle Teilstuecke", () => {
    expect(itemDone(partItem, withScores(["quran:112:1:a"], 100))).toBe(false);
    expect(itemDone(partItem, withScores(["quran:112:1:a", "quran:112:1:b"], 100))).toBe(true);
  });

  it("ignoriert bei zusammengesetzten Inhalten den eigenen Schluessel", () => {
    // Sonst koennte eine Sura als geschafft gelten, ohne ein Wort zu sprechen.
    expect(itemDone(partItem, withScores(["surah:112"], 100))).toBe(false);
  });
});

describe("levelProgress", () => {
  it("startet bei null und nennt jeden Pfad", () => {
    for (const level of LEVEL_ORDER) {
      const progress = levelProgress(level, empty());
      expect(progress.level).toBe(level);
      expect(progress.done).toBe(0);
      expect(progress.ratio).toBe(0);
      expect(progress.paths).toHaveLength(LEVEL_PLANS[level].paths.length);
    }
  });

  it("erreicht mit vollstaendigem Fortschritt genau 100 Prozent", () => {
    for (const level of LEVEL_ORDER) {
      const progress = levelProgress(level, completeSnapshot(level));
      expect(progress.done, `Level ${level}`).toBe(progress.total);
      expect(progress.ratio, `Level ${level}`).toBe(1);
    }
  });

  it("zaehlt einen einzelnen gesprochenen Buchstaben genau einmal", () => {
    const progress = levelProgress(5, withScores([letterKey(LETTERS[0].id)], MASTERY_SCORE));
    expect(progress.done).toBe(1);
    const letterPaths = progress.paths.filter((p) => p.path.stage === "letters");
    // Derselbe Buchstabe erscheint in mehreren Pfaden, im Gesamtzaehler aber nur einmal.
    expect(letterPaths.every((p) => p.done === 1)).toBe(true);
  });

  it("nutzt die Punktschwelle des jeweiligen Levels", () => {
    const key = coreWordKey(QURAN_CORE_WORDS[0].ar);
    // 80 Punkte genuegen Level 7 (Schwelle 80), nicht Level 8 (Schwelle 85).
    expect(LEVEL_PLANS[7].mastery.minScoreNew).toBe(80);
    expect(LEVEL_PLANS[8].mastery.minScoreNew).toBe(85);
    const snapshot = withScores([key], 80);
    const seven = levelProgress(7, snapshot).paths.find((p) => p.path.id === "l7-quran-words");
    expect(seven?.done).toBe(1);
    const eight = levelProgress(8, snapshot);
    expect(eight.done).toBe(0);
  });

  it("laesst Pfade ohne Inhalte bei ratio 0 statt NaN", () => {
    const tabarak = levelProgress(9, empty()).paths.find((p) => p.path.id === "l9-tabarak");
    expect(tabarak?.total).toBe(0);
    expect(tabarak?.ratio).toBe(0);
  });
});

describe("nextStep", () => {
  it("nennt zu Beginn genau eine Aufgabe aus dem ersten Pfad", () => {
    const step = nextStep(5, empty());
    expect(step).not.toBeNull();
    expect(step?.path.id).toBe(LEVEL_PLANS[5].paths[0].id);
    expect(step?.position).toBe(1);
    expect(step?.item.key).toBe(letterKey(LETTERS[0].id));
    expect(step?.total).toBe(LETTERS.length);
  });

  it("rueckt nach erledigter Aufgabe auf die naechste vor", () => {
    const snapshot = withScores(
      [letterKey(LETTERS[0].id), letterKey(LETTERS[1].id)],
      MASTERY_SCORE,
    );
    const step = nextStep(5, snapshot);
    expect(step?.position).toBe(3);
    expect(step?.item.key).toBe(letterKey(LETTERS[2].id));
  });

  it("wechselt in den naechsten Pfad, wenn der erste fertig ist", () => {
    const snapshot = withScores(
      LETTERS.map((letter) => letterKey(letter.id)),
      MASTERY_SCORE,
    );
    const step = nextStep(5, snapshot);
    // Die drei letters-Pfade sind damit alle fertig; weiter geht es bei den Formen.
    expect(step?.path.stage).not.toBe("letters");
    expect(step?.item.stage).toBe(step?.path.stage);
  });

  it("ueberspringt Pfade ohne Inhalte", () => {
    for (const level of LEVEL_ORDER) {
      const step = nextStep(level, empty());
      expect(step, `Level ${level}`).not.toBeNull();
      expect(step?.total, `Level ${level}`).toBeGreaterThan(0);
    }
    // Juz Tabarak (count 0) darf in Level 9 nie als naechster Schritt kommen.
    const nine = nextStep(9, empty());
    expect(nine?.path.id).not.toBe("l9-tabarak");
  });

  it("gibt null zurueck, wenn das Level komplett ist", () => {
    for (const level of LEVEL_ORDER) {
      expect(nextStep(level, completeSnapshot(level)), `Level ${level}`).toBeNull();
    }
  });
});

describe("reviewQueue", () => {
  it("ist leer, wenn nichts offen ist", () => {
    expect(reviewQueue(6, completeSnapshot(6))).toEqual([]);
  });

  it("haelt sich an das Limit", () => {
    expect(reviewQueue(6, empty(), 5)).toHaveLength(5);
    expect(reviewQueue(6, empty(), 3)).toHaveLength(3);
  });

  it("stellt angefangene Inhalte vor noch nie geuebte", () => {
    const started = shortWordKey(SHORT_WORDS[10].ar);
    const queue = reviewQueue(6, withScores([started], MASTERY_SCORE - 10), 5);
    expect(queue[0].key).toBe(started);
  });

  it("sortiert nach erreichter Punktzahl, die hoechste zuerst", () => {
    const snapshot = withScores([], 0);
    snapshot.mastered[shortWordKey(SHORT_WORDS[0].ar)] = 30;
    snapshot.mastered[shortWordKey(SHORT_WORDS[1].ar)] = 60;
    snapshot.mastered[shortWordKey(SHORT_WORDS[2].ar)] = 45;
    const queue = reviewQueue(6, snapshot, 3);
    expect(queue.map((item) => item.key)).toEqual([
      shortWordKey(SHORT_WORDS[1].ar),
      shortWordKey(SHORT_WORDS[2].ar),
      shortWordKey(SHORT_WORDS[0].ar),
    ]);
  });

  it("nimmt nur Inhalte auf, die noch nicht sitzen", () => {
    const done = syllableKey(SYLLABLES[0].ar);
    const queue = reviewQueue(6, withScores([done], MASTERY_SCORE), 50);
    expect(queue.map((item) => item.key)).not.toContain(done);
  });
});

describe("categoriesForLevel", () => {
  it("zeigt den Jungsten keine Wortkategorien", () => {
    // Anforderung des Nutzers: die Kategorien haengen am Alter. Level 5 und 6
    // arbeiten an Buchstaben, Zeichen und Silben - Woerter kann ein Kind dort
    // noch nicht lesen.
    expect(categoriesForLevel(5)).toEqual([]);
    expect(categoriesForLevel(6)).toEqual([]);
  });

  it("schaltet die Kategorien ab dem Level frei, das der Plan dafuer vorsieht", () => {
    const first = LEVEL_ORDER.find((level) =>
      LEVEL_PLANS[level].paths.some((path) => path.stage === "vocabulary"),
    )!;
    expect(first).toBe(7);
    for (const level of LEVEL_ORDER) {
      const expected = level >= first ? CATEGORIES.length : 0;
      expect(categoriesForLevel(level).length, `Level ${level}`).toBe(expected);
    }
  });

  it("laesst die Kategorien in den Quran-Leveln als Uebung stehen", () => {
    // Level 8 und 9 haben die Suren als Ziel - die einmal freigeschalteten
    // Woerter bleiben trotzdem sprechbar.
    expect(categoriesForLevel(8)).toEqual(CATEGORIES);
    expect(categoriesForLevel(9)).toEqual(CATEGORIES);
  });

  it("faengt Werte ausserhalb des Bereichs ab", () => {
    expect(categoriesForLevel(0)).toEqual([]);
    expect(categoriesForLevel(99)).toEqual(CATEGORIES);
  });
});

describe("masteryReached", () => {
  it("ist am Anfang fuer kein Level erreicht", () => {
    for (const level of LEVEL_ORDER) {
      expect(masteryReached(level, empty()), `Level ${level}`).toBe(false);
    }
  });

  it("ist erreicht, wenn jeder Inhalt die Schwelle des Levels haelt", () => {
    for (const level of LEVEL_ORDER) {
      expect(masteryReached(level, completeSnapshot(level)), `Level ${level}`).toBe(true);
    }
  });

  it("kippt zurueck, sobald ein einzelner Inhalt fehlt", () => {
    const snapshot = completeSnapshot(6);
    delete snapshot.mastered[syllableKey(SYLLABLES[0].ar)];
    expect(masteryReached(6, snapshot)).toBe(false);
  });
});

describe("Schluesselbauer", () => {
  it("erzeugt die Formate, die der Progress-Store erwartet", () => {
    expect(letterKey("ba")).toBe("letter:ba");
    expect(harakaKey("fatha")).toBe("haraka:fatha");
    expect(shortWordKey("مَنْ")).toBe("word:مَنْ");
    expect(coreWordKey("قُلْ")).toBe("core:قُلْ");
    expect(wordKey("tiere", "أَسَد")).toBe("tiere:أَسَد");
    expect(quranWordKey(112, 1, "قُلْ")).toBe("quran:112:1:قُلْ");
  });

  it("bleibt kompatibel mit den bereits gespeicherten Kategorie-Schluesseln", () => {
    // Bestandsdaten nutzen `${categoryId}:${ar}` - das Format darf sich nicht aendern.
    const category = CATEGORIES[0];
    const word = (WORDS[category.id] ?? [])[0];
    expect(wordKey(category.id, word.ar)).toBe(`${category.id}:${word.ar}`);
  });
});
