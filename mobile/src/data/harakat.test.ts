// Unit-Tests fuer Harakat, Silbentreppe, Madd-Reihen und die Wortlisten
// (Anforderungen 5.2 und 5.3). Die Abschlusskriterien nennen konkrete Mengen -
// die werden hier festgenagelt.

import { describe, expect, it } from "vitest";
import {
  HARAKAT,
  HARAKAT_BY_ID,
  MADD_PAIRS,
  QURAN_CORE_WORDS,
  SHORT_WORDS,
  SYLLABLES,
  SYLLABLE_LADDER,
  type Haraka,
} from "./harakat";

const CARRIER = "◌";
const FATHA = "َ";
const SHADDA = "ّ";
const SUKUN = "ْ";
const ALIF = "ا";
const YA = "ي";
const WAW = "و";

describe("HARAKAT", () => {
  it("enthaelt Kurzvokale, Sukun, Shadda und die drei Tanwin", () => {
    expect(HARAKAT).toHaveLength(8);
    expect(HARAKAT.map((h) => h.id)).toEqual([
      "fatha", "kasra", "damma", "sukun", "shadda", "fathatan", "kasratan", "dammatan",
    ]);
  });

  it("teilt Level 6 und Level 7 auf: fuenf Grundzeichen, drei Tanwin", () => {
    expect(HARAKAT.filter((h) => h.level === 6)).toHaveLength(5);
    expect(HARAKAT.filter((h) => h.level === 7)).toHaveLength(3);
  });

  it.each(HARAKAT.map((h): [string, Haraka] => [h.id, h]))(
    "%s zeigt das Zeichen auf dem gepunkteten Traeger",
    (_id, haraka) => {
      // Ein Harakat allein ist nicht darstellbar - es braucht einen Traeger.
      expect(haraka.display).toBe(`${CARRIER}${haraka.symbol}`);
      expect(haraka.symbol.length).toBe(1);
      for (const field of [haraka.name_ar, haraka.name_de, haraka.sound, haraka.hint] as const) {
        expect(field.trim().length).toBeGreaterThan(0);
      }
      expect(haraka.example.ar.trim().length).toBeGreaterThan(0);
    },
  );

  it("ist ueber die Id-Tabelle vollstaendig erreichbar", () => {
    for (const haraka of HARAKAT) {
      expect(HARAKAT_BY_ID[haraka.id]).toBe(haraka);
    }
  });
});

describe("SYLLABLE_LADDER", () => {
  it("hat zehn Reihen mit je fuenf Stufen", () => {
    expect(SYLLABLE_LADDER).toHaveLength(10);
    for (const row of SYLLABLE_LADDER) {
      expect(row.cells, row.letter_id).toHaveLength(5);
      expect(row.cells.map((cell) => cell.haraka)).toEqual([
        "fatha", "kasra", "damma", "sukun", "shadda",
      ]);
    }
  });

  it("ergibt 50 eindeutige Silben", () => {
    expect(SYLLABLES).toHaveLength(50);
    expect(new Set(SYLLABLES.map((cell) => cell.ar)).size).toBe(50);
  });

  it("baut jede Zelle aus dem Buchstaben der Reihe", () => {
    for (const row of SYLLABLE_LADDER) {
      for (const cell of row.cells) {
        expect(cell.ar.startsWith(row.letter), `${row.letter_id}/${cell.haraka}`).toBe(true);
        expect(cell.translit.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("zeigt die Shadda-Stufe zusammen mit Fatha, sonst waere sie nicht sprechbar", () => {
    for (const row of SYLLABLE_LADDER) {
      const shadda = row.cells.find((cell) => cell.haraka === "shadda");
      expect(shadda?.ar).toBe(`${row.letter}${SHADDA}${FATHA}`);
    }
  });

  it("setzt bei der Sukun-Stufe genau das Sukun-Zeichen", () => {
    for (const row of SYLLABLE_LADDER) {
      const sukun = row.cells.find((cell) => cell.haraka === "sukun");
      expect(sukun?.ar).toBe(`${row.letter}${SUKUN}`);
    }
  });
});

describe("MADD_PAIRS", () => {
  it("stellt 15 Paare aus kurzem und langem Vokal", () => {
    expect(MADD_PAIRS).toHaveLength(15);
  });

  it("verlaengert jeden kurzen Vokal um genau einen Madd-Buchstaben", () => {
    for (const pair of MADD_PAIRS) {
      expect(pair.long.ar.startsWith(pair.short.ar), `${pair.letter}: ${pair.long.ar}`).toBe(true);
      const tail = pair.long.ar.slice(pair.short.ar.length);
      expect([ALIF, YA, WAW]).toContain(tail);
      // Die Transkription zeigt die Laenge mit Makron.
      expect(pair.long.translit.length).toBeGreaterThanOrEqual(pair.short.translit.length);
    }
  });

  it("deckt fuer jeden Buchstaben Fatha, Kasra und Damma ab", () => {
    const letters = [...new Set(MADD_PAIRS.map((pair) => pair.letter))];
    expect(letters).toHaveLength(5);
    for (const letter of letters) {
      const harakat = MADD_PAIRS.filter((pair) => pair.letter === letter).map((p) => p.short.haraka);
      expect(harakat.sort()).toEqual(["damma", "fatha", "kasra"]);
    }
  });
});

describe("SHORT_WORDS", () => {
  it("erfuellt das Abschlusskriterium von Level 6: mindestens 50 kurze Woerter", () => {
    expect(SHORT_WORDS.length).toBeGreaterThanOrEqual(50);
  });

  it("hat eindeutige Woerter mit deutscher Bedeutung und Transkription", () => {
    expect(new Set(SHORT_WORDS.map((w) => w.ar)).size).toBe(SHORT_WORDS.length);
    for (const word of SHORT_WORDS) {
      expect(word.de.trim().length, word.ar).toBeGreaterThan(0);
      expect(word.translit?.trim().length ?? 0, word.ar).toBeGreaterThan(0);
    }
  });

  it("ist wirklich kurz: hoechstens sechs Grundbuchstaben pro Wort", () => {
    for (const word of SHORT_WORDS) {
      const bare = word.ar.replace(/[ً-ْٰۖ-ۭ]/g, "");
      expect(bare.length, `${word.ar} (${bare})`).toBeLessThanOrEqual(6);
    }
  });
});

describe("QURAN_CORE_WORDS", () => {
  it("liefert einen Grundwortschatz mit mindestens 25 Woertern", () => {
    expect(QURAN_CORE_WORDS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(QURAN_CORE_WORDS.map((w) => w.ar)).size).toBe(QURAN_CORE_WORDS.length);
  });

  it("ist vollstaendig vokalisiert und uebersetzt", () => {
    for (const word of QURAN_CORE_WORDS) {
      expect(word.de.trim().length, word.ar).toBeGreaterThan(0);
      expect(word.translit?.trim().length ?? 0, word.ar).toBeGreaterThan(0);
      // Jedes Wort traegt mindestens ein Tashkeel-Zeichen.
      expect(/[ً-ْ]/.test(word.ar), `${word.ar} ohne Tashkeel`).toBe(true);
    }
  });

  it("ueberschneidet sich nicht mit den kurzen Lesewoertern", () => {
    const short = new Set(SHORT_WORDS.map((w) => w.ar));
    const overlap = QURAN_CORE_WORDS.filter((w) => short.has(w.ar));
    // Getrennte Progress-Schluessel: Ueberschneidung waere doppelte Arbeit.
    expect(overlap.map((w) => w.ar)).toEqual([]);
  });
});
