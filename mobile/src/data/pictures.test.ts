// Bildebene (Anforderungen 8: grosse Illustrationen, wenig Text; 10: Bildwelten).
//
// Ein Kind, das noch nicht liest, bedient die App ueber Bilder. Fehlt einem
// Kategoriewort oder einem Buchstaben-Bildwort das Bild, sieht das Kind an der
// Stelle nur arabischen Text - genau das soll die App nicht verlangen.

import { describe, expect, it } from "vitest";
import { CATEGORIES, type Word } from "./categories";
import { LETTERS } from "./letters";
import { PICTURES, pictureFor, withPictures } from "./pictures";
import { WORDS } from "./words";
import { WORD_SOURCES, wordSource } from "./wordSources";

describe("Bilder fuer die Inhalte", () => {
  it("gibt jedem Kategoriewort ein Bild", () => {
    for (const category of CATEGORIES) {
      for (const word of WORDS[category.id] ?? []) {
        expect(word.pic ?? pictureFor(word.ar), `${category.id} · ${word.ar}`).toBeTruthy();
      }
    }
  });

  it("gibt jedem Buchstaben-Bildwort ein Bild", () => {
    for (const letter of LETTERS) {
      expect(pictureFor(letter.example.ar), `${letter.id} · ${letter.example.ar}`).toBeTruthy();
    }
  });

  it("traegt das Bild in die Kategoriequellen der Uebung", () => {
    for (const category of CATEGORIES) {
      const source = wordSource(category.id)!;
      for (const word of source.words) {
        expect(word.pic, `${category.id} · ${word.ar}`).toBeTruthy();
      }
    }
  });

  it("zeigt in der Buchstabenuebung das Bildwort des Buchstaben", () => {
    const source = wordSource("buchstaben")!;
    expect(source.words).toHaveLength(LETTERS.length);
    source.words.forEach((word, index) => {
      expect(word.pic, LETTERS[index].id).toBe(pictureFor(LETTERS[index].example.ar));
    });
  });
});

describe("pictureFor", () => {
  it("kennt nur arabische Schluessel mit einem Bild dahinter", () => {
    for (const [ar, pic] of Object.entries(PICTURES)) {
      expect(ar.trim().length, ar).toBeGreaterThan(0);
      expect(pic.trim().length, ar).toBeGreaterThan(0);
      // Lateinische Buchstaben in einem Schluessel wuerden nie gefunden - die
      // Tabelle haengt am arabischen Wort.
      expect(/[a-zA-Z]/.test(ar), ar).toBe(false);
    }
  });

  it("gibt fuer unbekannte oder leere Woerter nichts zurueck", () => {
    expect(pictureFor("")).toBeUndefined();
    expect(pictureFor("gibt-es-nicht")).toBeUndefined();
  });

  it("zeigt dasselbe Wort in jeder Wortliste mit demselben Bild", () => {
    // يَد und فَم stehen in "Koerper" und in den kurzen Lesewoertern - in beiden
    // Listen muessen sie gleich aussehen. Ausnahme mit Absicht: die
    // Buchstabenquelle zeigt zur Silbe بَ das Bildwort von ب (بَاب → 🚪).
    for (const ar of ["يَد", "فَم", "خُبْز"]) {
      const pics = WORD_SOURCES.flatMap((source) =>
        source.words.filter((word) => word.ar === ar).map((word) => word.pic),
      );
      expect(pics.length, ar).toBeGreaterThan(1);
      expect(new Set(pics).size, ar).toBe(1);
      expect(pics[0], ar).toBe(pictureFor(ar));
    }
  });
});

describe("withPictures", () => {
  it("setzt fehlende Bilder und laesst gesetzte stehen", () => {
    const filled = withPictures([
      { ar: "قِطّ", de: "Katze" },
      { ar: "قِطّ", de: "Katze", pic: "🐱" },
      { ar: "مِنْ", de: "von" },
    ]);
    expect(filled[0].pic).toBe(pictureFor("قِطّ"));
    expect(filled[1].pic).toBe("🐱");
    // Funktionswoerter bleiben ohne Bild - die Oberflaeche zeigt dort das
    // Emoji der Lernstufe.
    expect(filled[2].pic).toBeUndefined();
  });

  it("laesst die Eingabeliste unveraendert", () => {
    const words: Word[] = [{ ar: "قِطّ", de: "Katze" }];
    withPictures(words);
    expect(words[0].pic).toBeUndefined();
  });
});
