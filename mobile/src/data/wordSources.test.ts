// Unit-Tests fuer die Wortquellen. Die Play-Route /play/[categoryId] bedient
// sich hier - stimmen die Schluessel nicht mit progressKeys.ts ueberein,
// laeuft der aufgenommene Score in einen Schluessel, den kein Level liest.

import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./categories";
import { QURAN_CORE_WORDS, SHORT_WORDS } from "./harakat";
import { coreWordKey, shortWordKey, wordKey } from "./progressKeys";
import { WORDS } from "./words";
import { EXTRA_WORD_SOURCES, STAGE_WORD_SOURCES, WORD_SOURCES, wordSource } from "./wordSources";

describe("WORD_SOURCES", () => {
  it("umfasst jede Kategorie und jede Lernstufen-Liste", () => {
    expect(WORD_SOURCES).toHaveLength(CATEGORIES.length + STAGE_WORD_SOURCES.length);
    // Reihenfolge = Lernweg: Buchstaben, Zeichen, Silben, lange Laute, dann Woerter.
    expect(STAGE_WORD_SOURCES.map((source) => source.id)).toEqual([
      "buchstaben",
      "harakat",
      "silben",
      "madd",
      "kurz",
      "quran-core",
    ]);
    expect(EXTRA_WORD_SOURCES.map((source) => source.id)).toEqual(["kurz", "quran-core"]);
  });

  it("hat eindeutige Ids, Titel, Emoji und nicht-leere Wortlisten", () => {
    expect(new Set(WORD_SOURCES.map((source) => source.id)).size).toBe(WORD_SOURCES.length);
    for (const source of WORD_SOURCES) {
      expect(source.title.trim().length, source.id).toBeGreaterThan(0);
      expect(source.emoji.trim().length, source.id).toBeGreaterThan(0);
      expect(source.words.length, source.id).toBeGreaterThan(0);
      // Ids landen in der Route /play/<id> - nur Kleinbuchstaben und Bindestrich.
      expect(source.id, source.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("spiegelt die Kategorie-Woerter in Reihenfolge und Bedeutung", () => {
    for (const category of CATEGORIES) {
      const source = wordSource(category.id);
      expect(source?.title).toBe(category.title);
      // Bilder kommen aus der Bildebene dazu, Wort und Bedeutung bleiben gleich.
      expect(source?.words.map((word) => [word.ar, word.de])).toEqual(
        (WORDS[category.id] ?? []).map((word) => [word.ar, word.de]),
      );
    }
  });

  it("bedient die Level-6- und Level-7-Listen ueber eigene Quellen", () => {
    expect(wordSource("kurz")?.words.map((word) => word.ar)).toEqual(
      SHORT_WORDS.map((word) => word.ar),
    );
    expect(wordSource("quran-core")?.words.map((word) => word.ar)).toEqual(
      QURAN_CORE_WORDS.map((word) => word.ar),
    );
  });

  it("baut dieselben Progress-Schluessel wie die Levelinhalte", () => {
    for (const category of CATEGORIES) {
      const word = (WORDS[category.id] ?? [])[0];
      expect(wordSource(category.id)?.keyFor(word.ar)).toBe(wordKey(category.id, word.ar));
    }
    expect(wordSource("kurz")?.keyFor(SHORT_WORDS[0].ar)).toBe(shortWordKey(SHORT_WORDS[0].ar));
    expect(wordSource("quran-core")?.keyFor(QURAN_CORE_WORDS[0].ar)).toBe(
      coreWordKey(QURAN_CORE_WORDS[0].ar),
    );
  });

  it("erzeugt keine kollidierenden Schluessel zwischen den Quellen", () => {
    const keys = WORD_SOURCES.flatMap((source) => source.words.map((word) => source.keyFor(word.ar)));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gibt fuer unbekannte oder fehlende Ids nichts zurueck", () => {
    expect(wordSource(undefined)).toBeUndefined();
    expect(wordSource("")).toBeUndefined();
    expect(wordSource("gibt-es-nicht")).toBeUndefined();
  });
});
