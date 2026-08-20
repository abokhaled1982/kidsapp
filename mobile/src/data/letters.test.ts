// Unit-Tests fuer die Buchstabendaten (Anforderungen 5.1). Sie halten die
// fachliche Zusage fest: 28 Buchstaben, korrekte Positionsformen, ehrliche
// Bildwoerter, saubere Formfamilien.

import { describe, expect, it } from "vitest";
import {
  EXTRA_SIGNS,
  LETTERS,
  LETTERS_BY_ID,
  LETTER_FAMILIES,
  SOUND_PAIRS,
  letterByChar,
  type Letter,
} from "./letters";

const TATWEEL = "ـ";
// ا د ذ ر ز و verbinden nicht nach links.
const NON_CONNECTING = ["ا", "د", "ذ", "ر", "ز", "و"];
const ARABIC_LETTER = /^[ء-ي]$/;

// Harakat und Sukun/Shadda entfernen, damit ein Bildwort mit seinem
// Grundbuchstaben verglichen werden kann.
const stripTashkeel = (text: string) => text.replace(/[ً-ْٰۖ-ۭ]/g, "");

describe("LETTERS", () => {
  it("enthaelt genau die 28 arabischen Buchstaben", () => {
    expect(LETTERS).toHaveLength(28);
  });

  it("hat eindeutige Ids und eindeutige Schriftzeichen", () => {
    expect(new Set(LETTERS.map((l) => l.id)).size).toBe(LETTERS.length);
    expect(new Set(LETTERS.map((l) => l.ar)).size).toBe(LETTERS.length);
  });

  it.each(LETTERS.map((l): [string, Letter] => [l.id, l]))(
    "%s hat gefuellte Textfelder und ein einzelnes Schriftzeichen",
    (_id, letter) => {
      expect(letter.ar).toMatch(ARABIC_LETTER);
      for (const field of [letter.name_ar, letter.translit, letter.sound, letter.hint] as const) {
        expect(field.trim().length).toBeGreaterThan(0);
      }
      expect(letter.example.ar.trim().length).toBeGreaterThan(0);
      expect(letter.example.de.trim().length).toBeGreaterThan(0);
      expect(letter.example.translit.trim().length).toBeGreaterThan(0);
    },
  );

  it.each(LETTERS.map((l): [string, Letter] => [l.id, l]))(
    "%s bildet die Positionsformen aus Grundbuchstabe und Tatweel",
    (_id, letter) => {
      expect(letter.forms.isolated).toBe(letter.ar);
      expect(letter.forms.final).toBe(`${TATWEEL}${letter.ar}`);
      if (letter.connects) {
        expect(letter.forms.initial).toBe(`${letter.ar}${TATWEEL}`);
        expect(letter.forms.medial).toBe(`${TATWEEL}${letter.ar}${TATWEEL}`);
      } else {
        // Kein Anschluss nach links: es gibt keine Anfangs- und Mittelform.
        expect(letter.forms.initial).toBeNull();
        expect(letter.forms.medial).toBeNull();
      }
    },
  );

  it("markiert genau ا د ذ ر ز و als nicht verbindend", () => {
    const nonConnecting = LETTERS.filter((l) => !l.connects).map((l) => l.ar);
    expect(nonConnecting.sort()).toEqual([...NON_CONNECTING].sort());
    expect(LETTERS.filter((l) => l.connects)).toHaveLength(22);
  });

  it.each(LETTERS.map((l): [string, Letter] => [l.id, l]))(
    "%s kommt in seinem eigenen Bildwort vor",
    (_id, letter) => {
      const bare = stripTashkeel(letter.example.ar);
      // Alif erscheint im Bildwort als Hamza-Traeger (أَسَد), darum zaehlen
      // die Schreibvarianten mit.
      const forms = [letter.ar, ...(letter.variants ?? [])];
      expect(
        forms.some((form) => bare.includes(form)),
        `${letter.example.ar} enthaelt keine Form von ${letter.ar}`,
      ).toBe(true);
    },
  );

  it("haelt Punktzahl und Punktlage konsistent", () => {
    for (const letter of LETTERS) {
      if (letter.dots.count === 0) {
        expect(letter.dots.position, letter.id).toBe("none");
      } else {
        expect(letter.dots.position, letter.id).not.toBe("none");
        expect(letter.dots.count).toBeLessThanOrEqual(3);
      }
    }
  });

  it("findet jeden Buchstaben ueber Zeichen und Id", () => {
    for (const letter of LETTERS) {
      expect(letterByChar(letter.ar)).toBe(letter);
      expect(LETTERS_BY_ID[letter.id]).toBe(letter);
    }
    expect(letterByChar("x")).toBeUndefined();
  });
});

describe("LETTER_FAMILIES", () => {
  it("deckt alle 28 Buchstaben genau einmal ab", () => {
    const inFamilies = LETTER_FAMILIES.flatMap((family) => family.letters);
    expect(inFamilies).toHaveLength(28);
    expect(new Set(inFamilies).size).toBe(28);
    expect(inFamilies.sort()).toEqual(LETTERS.map((l) => l.ar).sort());
  });

  it("stimmt mit dem family-Feld der Buchstaben ueberein", () => {
    for (const family of LETTER_FAMILIES) {
      for (const ar of family.letters) {
        expect(letterByChar(ar)?.family, ar).toBe(family.id);
      }
    }
  });

  it("hat eindeutige Ids und eine Beschreibung pro Familie", () => {
    expect(new Set(LETTER_FAMILIES.map((f) => f.id)).size).toBe(LETTER_FAMILIES.length);
    for (const family of LETTER_FAMILIES) {
      expect(family.title.trim().length).toBeGreaterThan(0);
      expect(family.detail.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("EXTRA_SIGNS", () => {
  it("beschreibt Zeichen ausserhalb der 28 Buchstaben", () => {
    expect(EXTRA_SIGNS.length).toBeGreaterThanOrEqual(4);
    const letterChars = new Set(LETTERS.map((l) => l.ar));
    for (const sign of EXTRA_SIGNS) {
      expect(letterChars.has(sign.ar), `${sign.id} ist ein Grundbuchstabe`).toBe(false);
      expect(sign.detail.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(EXTRA_SIGNS.map((s) => s.id)).size).toBe(EXTRA_SIGNS.length);
  });
});

describe("SOUND_PAIRS", () => {
  it("hat eindeutige Ids und zwei verschiedene Zeichen pro Paar", () => {
    expect(new Set(SOUND_PAIRS.map((p) => p.id)).size).toBe(SOUND_PAIRS.length);
    for (const pair of SOUND_PAIRS) {
      expect(pair.a).not.toBe(pair.b);
      expect(pair.hint.trim().length).toBeGreaterThan(0);
      expect(pair.listenFor.trim().length).toBeGreaterThan(0);
    }
  });

  it("nutzt nur bekannte Buchstaben oder Extra-Zeichen", () => {
    const known = new Set([...LETTERS.map((l) => l.ar), ...EXTRA_SIGNS.map((s) => s.ar)]);
    for (const pair of SOUND_PAIRS) {
      expect(known.has(pair.a), `${pair.id}: ${pair.a}`).toBe(true);
      expect(known.has(pair.b), `${pair.id}: ${pair.b}`).toBe(true);
    }
  });

  it("fuehrt sieben Paare in Level 5 ein und legt in Level 8 nach", () => {
    expect(SOUND_PAIRS.filter((p) => p.level === 5)).toHaveLength(7);
    expect(SOUND_PAIRS.filter((p) => p.level === 8).length).toBeGreaterThan(0);
  });
});
