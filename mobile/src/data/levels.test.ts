// Unit-Tests fuer die Levelplaene (Anforderungen 5, 8 und 16).
// Geprueft wird die Struktur, die die App voraussetzt: fuenf Level, jeder mit
// Ziel, Lernpfaden, Uebungen und Abschlusskriterium; Routen, die es gibt;
// UI-Dichte passend zum Alter; und Mengenangaben, die zur Datenlage passen.

import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./categories";
import { HARAKAT, MADD_PAIRS, QURAN_CORE_WORDS, SHORT_WORDS, SYLLABLES } from "./harakat";
import { SURAHS } from "./juzamma";
import { LETTERS, LETTER_FAMILIES, SOUND_PAIRS } from "./letters";
import {
  KNOWN_ROUTES,
  LEVEL_ORDER,
  LEVEL_PLANS,
  LEVEL_SUMMARIES,
  SHORT_SURAH_MAX_WORDS,
  STAGE_LABELS,
  type LevelPlan,
} from "./levels";
import { tajweedForLevel } from "./tajweed";
import { WORDS } from "./words";

const PLANS: [number, LevelPlan][] = LEVEL_ORDER.map((level) => [level, LEVEL_PLANS[level]]);
const ROUTES = new Set<string>(KNOWN_ROUTES);
// Anforderung 8: Level 5-6 grosse Flaechen und wenig Text, ab Level 7 Lernkarten.
const EXPECTED_DENSITY: Record<number, "large" | "compact"> = {
  5: "large", 6: "large", 7: "compact", 8: "compact", 9: "compact",
};

describe("LEVEL_PLANS", () => {
  it("deckt genau die Lernlevel 5 bis 9 ab", () => {
    expect(LEVEL_ORDER).toEqual([5, 6, 7, 8, 9]);
    expect(Object.keys(LEVEL_PLANS).map(Number).sort()).toEqual([5, 6, 7, 8, 9]);
  });

  it.each(PLANS)("Level %s traegt Titel, Kurzzeile, Ziel und Emoji", (_level, plan) => {
    expect(plan.title.trim().length).toBeGreaterThan(0);
    expect(plan.summary.trim().length).toBeGreaterThan(0);
    // Das Ziel ist ein ganzer Satz aus der Anforderung, keine Stichwortliste.
    expect(plan.goal.trim().length).toBeGreaterThan(20);
    expect(plan.emoji.trim().length).toBeGreaterThan(0);
  });

  it.each(PLANS)("Level %s hat sein level-Feld korrekt gesetzt", (level, plan) => {
    expect(plan.level).toBe(level);
  });

  it("haelt die Kurzzeilen deckungsgleich mit den Plaenen", () => {
    for (const level of LEVEL_ORDER) {
      expect(LEVEL_SUMMARIES[level]).toBe(LEVEL_PLANS[level].summary);
    }
    expect(Object.keys(LEVEL_SUMMARIES).map(Number).sort()).toEqual([5, 6, 7, 8, 9]);
  });
});

describe("Lernpfade", () => {
  it.each(PLANS)("Level %s hat mindestens sechs Lernpfade", (_level, plan) => {
    expect(plan.paths.length).toBeGreaterThanOrEqual(6);
  });

  it("nutzt levelweit eindeutige Pfad-Ids und global eindeutige Praefixe", () => {
    const all: string[] = [];
    for (const [level, plan] of PLANS) {
      const ids = plan.paths.map((path) => path.id);
      expect(new Set(ids).size, `Level ${level}`).toBe(ids.length);
      for (const id of ids) {
        expect(id.startsWith(`l${level}-`), `${id} passt nicht zu Level ${level}`).toBe(true);
      }
      all.push(...ids);
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(PLANS)("Level %s zeigt nur auf Routen, die es gibt", (_level, plan) => {
    for (const path of plan.paths) {
      expect(ROUTES.has(path.route), `${path.id} -> ${path.route}`).toBe(true);
    }
  });

  it.each(PLANS)("Level %s beschreibt jeden Pfad mit Titel, Detail und Emoji", (_level, plan) => {
    for (const path of plan.paths) {
      expect(path.title.trim().length, path.id).toBeGreaterThan(0);
      expect(path.detail.trim().length, path.id).toBeGreaterThan(10);
      expect(path.emoji.trim().length, path.id).toBeGreaterThan(0);
    }
  });

  it("nennt nur nicht-negative Mengen; nur der noch offene Juz Tabarak ist leer", () => {
    const empty: string[] = [];
    for (const [, plan] of PLANS) {
      for (const path of plan.paths) {
        expect(path.count, path.id).toBeGreaterThanOrEqual(0);
        if (path.count === 0) empty.push(path.id);
      }
    }
    // Juz Tabarak wartet auf die fachliche Pruefung und wird als "kommt spaeter"
    // angezeigt - jeder andere leere Pfad waere ein Fehler.
    expect(empty).toEqual(["l9-tabarak"]);
  });

  it("leitet die Mengen aus den echten Datenquellen ab", () => {
    const countOf = (level: number, id: string) =>
      LEVEL_PLANS[level as 5 | 6 | 7 | 8 | 9].paths.find((path) => path.id === id)?.count;
    const vocab = CATEGORIES.reduce((sum, c) => sum + (WORDS[c.id]?.length ?? 0), 0);
    const connecting = LETTERS.filter((letter) => letter.connects).length;

    expect(countOf(5, "l5-letters")).toBe(LETTERS.length);
    expect(countOf(5, "l5-families")).toBe(LETTER_FAMILIES.length);
    expect(countOf(5, "l5-forms")).toBe(connecting);
    expect(countOf(5, "l5-pairs")).toBe(SOUND_PAIRS.filter((p) => p.level === 5).length);
    expect(countOf(6, "l6-harakat")).toBe(HARAKAT.filter((h) => h.level === 6).length);
    expect(countOf(6, "l6-tanwin")).toBe(HARAKAT.filter((h) => h.level === 7).length);
    expect(countOf(6, "l6-syllables")).toBe(SYLLABLES.length);
    expect(countOf(6, "l6-madd")).toBe(MADD_PAIRS.length);
    expect(countOf(6, "l6-words")).toBe(SHORT_WORDS.length);
    expect(countOf(6, "l6-quran-words")).toBe(QURAN_CORE_WORDS.length);
    expect(countOf(7, "l7-vocab")).toBe(vocab);
    expect(countOf(8, "l8-juzamma")).toBe(SURAHS.length);
    expect(countOf(8, "l8-madd")).toBe(tajweedForLevel(8).length);
    expect(countOf(9, "l9-juzamma")).toBe(SURAHS.length);
    expect(countOf(9, "l9-tajweed")).toBe(tajweedForLevel(9).length);
  });

  it("zaehlt fuer Level 7 nur Suren bis zur Kurzgrenze", () => {
    const short = SURAHS.filter(
      (surah) =>
        surah.ayat.filter((a) => a.n > 0).reduce((sum, a) => sum + a.words.length, 0) <=
        SHORT_SURAH_MAX_WORDS,
    );
    const path = LEVEL_PLANS[7].paths.find((p) => p.id === "l7-surahs");
    expect(path?.count).toBe(short.length);
    // Das Abschlusskriterium verlangt drei kurze Suren - es muessen genug da sein.
    expect(short.length).toBeGreaterThanOrEqual(3);
  });

  it("fuehrt Suren erst ab Level 7 ein", () => {
    const quranStages = ["surahShort", "ayah", "juz", "quranWords"];
    for (const level of [5, 6] as const) {
      const stages = LEVEL_PLANS[level].paths.map((path) => path.stage);
      // Level 6 darf Quran-Woerter ueben, aber keine ganzen Suren oder Ayat.
      expect(stages.filter((stage) => quranStages.includes(stage) && stage !== "quranWords")).toEqual([]);
    }
    expect(LEVEL_PLANS[5].paths.some((path) => path.stage === "quranWords")).toBe(false);
  });
});

describe("Uebungen", () => {
  it.each(PLANS)("Level %s hat mindestens neun Uebungen", (_level, plan) => {
    expect(plan.exercises.length).toBeGreaterThanOrEqual(9);
  });

  it("nutzt global eindeutige Uebungs-Ids mit Levelpraefix", () => {
    const all: string[] = [];
    for (const [level, plan] of PLANS) {
      for (const exercise of plan.exercises) {
        expect(exercise.id.startsWith(`l${level}-e`), exercise.id).toBe(true);
        expect(exercise.title.trim().length, exercise.id).toBeGreaterThan(0);
        expect(exercise.hint.trim().length, exercise.id).toBeGreaterThan(10);
        expect(exercise.emoji.trim().length, exercise.id).toBeGreaterThan(0);
        all.push(exercise.id);
      }
    }
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("Abschlusskriterien", () => {
  it.each(PLANS)("Level %s formuliert das Kriterium als Satz mit Zielen", (_level, plan) => {
    expect(plan.mastery.label.trim().length).toBeGreaterThan(30);
    expect(plan.mastery.goals.length).toBeGreaterThanOrEqual(2);
    for (const goal of plan.mastery.goals) {
      expect(goal.label.trim().length).toBeGreaterThan(0);
      expect(goal.value).toBeGreaterThan(0);
      expect(["score", "items", "recordings", "days"]).toContain(goal.metric);
      // Prozentwerte muessen Prozentwerte bleiben.
      if (goal.metric === "score") expect(goal.value).toBeLessThanOrEqual(100);
    }
  });

  it.each(PLANS)("Level %s verlangt von geuebten Inhalten mindestens so viel wie von neuen", (_level, plan) => {
    expect(plan.mastery.minScoreNew).toBeLessThanOrEqual(plan.mastery.minScorePracticed);
    expect(plan.mastery.minScoreNew).toBeGreaterThan(0);
    expect(plan.mastery.minScorePracticed).toBeLessThanOrEqual(100);
  });

  it("steigert die Anforderung an neue Inhalte monoton", () => {
    const thresholds = LEVEL_ORDER.map((level) => LEVEL_PLANS[level].mastery.minScoreNew);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(thresholds[0]).toBeLessThan(thresholds[thresholds.length - 1]);
  });

  it("nennt Tage als Tage, nicht als Inhalte", () => {
    const dayGoals = PLANS.flatMap(([, plan]) => plan.mastery.goals).filter((g) => g.metric === "days");
    expect(dayGoals.length).toBeGreaterThan(0);
    for (const goal of dayGoals) {
      expect(goal.label).toMatch(/Tag/);
    }
  });
});

describe("STAGE_LABELS", () => {
  it("benennt jede Inhaltsart mit Titel und Bild", () => {
    // Die Startseite baut daraus die Lernwelten - fehlt ein Eintrag, bleibt die
    // Kachel namenlos.
    const stages = new Set(LEVEL_ORDER.flatMap((level) => LEVEL_PLANS[level].paths.map((p) => p.stage)));
    for (const stage of stages) {
      const label = STAGE_LABELS[stage];
      expect(label, stage).toBeDefined();
      expect(label.title.trim().length, stage).toBeGreaterThan(0);
      expect(label.emoji.trim().length, stage).toBeGreaterThan(0);
      // Kinder lesen den Titel vor - kein Fachwort aus dem Levelplan.
      expect(label.title, stage).not.toMatch(/[a-z][A-Z]/);
    }
  });
});

describe("UI-Vorgaben nach Alter (Anforderung 8)", () => {
  it.each(PLANS)("Level %s nutzt die passende Dichte", (level, plan) => {
    expect(plan.ui.density).toBe(EXPECTED_DENSITY[Number(level)]);
  });

  it.each(PLANS)("Level %s haelt Aufgaben in einem sinnvollen Zeitfenster", (_level, plan) => {
    const [min, max] = plan.ui.taskSeconds;
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(plan.ui.maxItemsPerSession).toBeGreaterThan(0);
  });

  it("verlaengert Aufgaben und Sitzungen mit steigendem Level", () => {
    const minSeconds = LEVEL_ORDER.map((level) => LEVEL_PLANS[level].ui.taskSeconds[0]);
    const maxSeconds = LEVEL_ORDER.map((level) => LEVEL_PLANS[level].ui.taskSeconds[1]);
    const items = LEVEL_ORDER.map((level) => LEVEL_PLANS[level].ui.maxItemsPerSession);
    expect(minSeconds).toEqual([...minSeconds].sort((a, b) => a - b));
    expect(maxSeconds).toEqual([...maxSeconds].sort((a, b) => a - b));
    expect(items).toEqual([...items].sort((a, b) => a - b));
  });

  it("stellt in den jungen Levels Audio voran und zeigt Transkription", () => {
    for (const level of [5, 6] as const) {
      expect(LEVEL_PLANS[level].ui.audioFirst, `Level ${level}`).toBe(true);
      expect(LEVEL_PLANS[level].ui.showTranslit, `Level ${level}`).toBe(true);
    }
    // Ab Level 8 wird ohne Lesehilfe gelesen.
    for (const level of [8, 9] as const) {
      expect(LEVEL_PLANS[level].ui.showTranslit, `Level ${level}`).toBe(false);
    }
  });
});
