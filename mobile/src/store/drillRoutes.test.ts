// Die Bruecke zwischen Levelinhalt und Aussprache-Uebung.
//
// Kernzusage der App: das Kind liest vor, das Sprachmodell prueft - und zwar
// fuer jeden Inhalt, nicht nur fuer Wortkategorien. Damit das haelt, muss jeder
// sprechbare Inhalt jedes Levels einen Uebungsplatz haben: eine Quelle, einen
// Index darin und eine Route. Faellt hier etwas durch, zeigt die Startseite
// eine Karte, die entweder nirgends hinfuehrt oder in eine Uebung, die den
// Inhalt gar nicht kennt - und der Fortschritt kaeme nie ueber die Schwelle.

import { describe, expect, it } from "vitest";
import { LETTERS } from "@/data/letters";
import { HARAKAT_BY_ID } from "@/data/harakat";
import { LEVEL_ORDER } from "@/data/levels";
import {
  drillTargetForKey,
  drillWordForKey,
  letterSpeakTarget,
  wordSource,
  WORD_SOURCES,
} from "@/data/wordSources";
import {
  drillRouteForItem,
  levelItems,
  levelPlan,
  nextStep,
  speakRouteForItem,
  worldsForLevel,
  type LevelItem,
} from "./levelFlow";

const empty = () => ({ mastered: {}, heard: {} });

// Suren und Ayat werden im Quran-Bildschirm rezitiert, nicht in /play.
const RECITED = new Set(["surahShort", "ayah", "juz"]);

// Arabische Vokal- und Lesezeichen (Fatha bis Sukun, Tanween, Shadda, Madda).
const VOWEL_MARK = /[ً-ْٰ]/;

const speakItems = (level: number): LevelItem[] =>
  levelItems(level).filter((item) => item.mode === "speak" && !RECITED.has(item.stage));

describe("Uebungsziel fuer jeden Inhalt", () => {
  it("gibt jedem Level sprechbare Inhalte", () => {
    // Kein Level darf ohne Aussprache abschliessbar sein. Level 5 bis 7 ueben
    // in /play, Level 8 und 9 rezitieren im Quran-Bildschirm.
    for (const level of LEVEL_ORDER) {
      const speak = levelItems(level).filter((item) => item.mode === "speak");
      expect(speak.length, `Level ${level}`).toBeGreaterThan(0);
    }
    for (const level of [5, 6, 7]) {
      expect(speakItems(level).length, `Level ${level}`).toBeGreaterThan(0);
    }
    for (const level of [8, 9]) {
      const recited = levelItems(level).filter((item) => RECITED.has(item.stage));
      expect(recited.length, `Level ${level}`).toBeGreaterThan(0);
    }
  });

  it("findet fuer jeden sprechbaren Inhalt jedes Levels eine Quelle", () => {
    for (const level of LEVEL_ORDER) {
      for (const item of speakItems(level)) {
        const target = drillTargetForKey(item.key);
        expect(target, `Level ${level} · ${item.key}`).not.toBeNull();
        expect(wordSource(target!.sourceId), item.key).toBeDefined();
      }
    }
  });

  it("zeigt mit dem Index genau auf das Wort, das den Schluessel tragt", () => {
    for (const level of LEVEL_ORDER) {
      for (const item of speakItems(level)) {
        const target = drillTargetForKey(item.key)!;
        const source = wordSource(target.sourceId)!;
        const word = source.words[target.index];
        expect(word, item.key).toBeDefined();
        // Rundlauf: aus dem Wort der Quelle entsteht wieder derselbe Schluessel.
        // Sonst schreibt die Uebung den Score in einen Schluessel, den kein
        // Level liest.
        expect(source.keyFor(word.ar), item.key).toBe(item.key);
      }
    }
  });

  it("liefert fuer jeden sprechbaren Inhalt eine Route mit Startindex", () => {
    for (const level of LEVEL_ORDER) {
      for (const item of speakItems(level)) {
        const route = speakRouteForItem(item);
        expect(route, `Level ${level} · ${item.key}`).toMatch(/^\/play\/[a-z][a-z0-9-]*\?start=\d+$/);
        const [, sourceId] = route!.match(/^\/play\/([^?]+)/)!;
        expect(wordSource(sourceId), route!).toBeDefined();
      }
    }
  });

  it("schickt Suren und Ayat in den Quran-Bildschirm", () => {
    const items = levelItems(9).filter((item) => RECITED.has(item.stage));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(drillRouteForItem(item), item.key).toMatch(/^\/quran\/\d+$/);
    }
  });

  it("gibt fuer Hoerinhalte keine Sprechroute aus", () => {
    // Buchstabenformen, Hoerpaare und Tajweed-Regeln liest man nicht vor.
    const listen = levelItems(8).filter((item) => item.mode === "listen");
    expect(listen.length).toBeGreaterThan(0);
    for (const item of listen) {
      expect(speakRouteForItem(item), item.key).toBeNull();
    }
  });

  it("liefert zu jedem Uebungsziel das Wort mit Bedeutung", () => {
    for (const level of LEVEL_ORDER) {
      for (const item of speakItems(level)) {
        const word = drillWordForKey(item.key);
        expect(word, item.key).not.toBeNull();
        expect(word!.de.trim().length, item.key).toBeGreaterThan(0);
      }
    }
  });

  it("gibt fuer unbekannte Schluessel nichts zurueck", () => {
    expect(drillTargetForKey("gibt-es-nicht")).toBeNull();
    expect(drillWordForKey("gibt-es-nicht")).toBeNull();
  });
});

describe("Sprechziele sind sprechbar", () => {
  it("gibt jedem Wort jeder Quelle mindestens ein Lesezeichen", () => {
    // Ein nackter Konsonant ("ب") ist nicht sprechbar und fuer die Erkennung
    // nicht bewertbar - jedes Uebungswort tragt ein Vokal- oder Lesezeichen.
    for (const source of WORD_SOURCES) {
      for (const word of source.words) {
        expect(VOWEL_MARK.test(word.ar), `${source.id} · ${word.ar}`).toBe(true);
      }
    }
  });

  it("uebt einen Buchstaben als Silbe mit Fatha", () => {
    const fatha = HARAKAT_BY_ID.fatha.symbol;
    for (const letter of LETTERS) {
      const target = letterSpeakTarget(letter);
      expect(target.endsWith(fatha), letter.id).toBe(true);
      // Alif traegt das Hamza, sonst ist kein kurzer Laut zu hoeren.
      expect(target, letter.id).toBe(letter.id === "alif" ? `أ${fatha}` : `${letter.ar}${fatha}`);
    }
  });

  it("stellt die Buchstabenquelle in derselben Reihenfolge wie die Levelinhalte", () => {
    const source = wordSource("buchstaben")!;
    expect(source.words.map((word) => word.ar)).toEqual(LETTERS.map(letterSpeakTarget));
  });
});

describe("Einstiegspunkte der Oberflaeche", () => {
  it("gibt jedem Level einen ersten Schritt, der irgendwohin fuehrt", () => {
    for (const level of LEVEL_ORDER) {
      const step = nextStep(level, empty());
      expect(step, `Level ${level}`).not.toBeNull();
      const route = drillRouteForItem(step!.item) ?? step!.path.route;
      expect(route, `Level ${level}`).toMatch(/^\//);
    }
  });

  it("gibt jeder Lernwelt eines Levels ein Ziel und einen Titel", () => {
    for (const level of LEVEL_ORDER) {
      const worlds = worldsForLevel(level, empty());
      expect(worlds.length, `Level ${level}`).toBeGreaterThan(0);
      // Eine Inhaltsart ist genau eine Welt, auch wenn mehrere Lernpfade sie
      // benutzen (Level 5 hat drei Pfade auf "letters").
      expect(new Set(worlds.map((world) => world.stage)).size).toBe(worlds.length);
      for (const world of worlds) {
        expect(world.route, `Level ${level} · ${world.stage}`).toMatch(/^\//);
        expect(world.title.trim().length, world.stage).toBeGreaterThan(0);
        expect(world.emoji.trim().length, world.stage).toBeGreaterThan(0);
        expect(world.total, world.stage).toBeGreaterThan(0);
        expect(world.done, world.stage).toBe(0);
        expect(world.ratio, world.stage).toBe(0);
      }
    }
  });

  it("zeigt in einer Lernwelt auf den ersten offenen Inhalt", () => {
    const plan = levelPlan(5);
    const first = levelItems(5)[0];
    const snapshot = { mastered: { [first.key]: plan.mastery.minScoreNew }, heard: {} };
    const letters = worldsForLevel(5, snapshot).find((world) => world.stage === "letters")!;
    expect(letters.done).toBe(1);
    // Der erste Buchstabe sitzt, die Welt fuehrt zum zweiten.
    expect(letters.route).toBe(drillRouteForItem(levelItems(5)[1]));
  });
});
