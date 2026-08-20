// Unit-Tests fuer die Qurantexte. Diese Daten werden dem Kind als Original
// gezeigt und ans Backend geschickt - Struktur und Vollstaendigkeit muessen
// stimmen, sonst zeigt die App falschen Text oder bewertet ins Leere.

import { describe, expect, it } from "vitest";
import { SURAHS, type Surah } from "./juzamma";

const ENTRIES: [string, Surah][] = SURAHS.map((surah) => [`${surah.n} ${surah.translit}`, surah]);
const TASHKEEL = /[ً-ْٰ]/;

describe("SURAHS", () => {
  it("enthaelt Suren mit eindeutigen Nummern aus Juz Amma", () => {
    // Stand heute 17 Suren; laengere Suren werden inkrementell ergaenzt.
    expect(SURAHS.length).toBeGreaterThanOrEqual(17);
    expect(new Set(SURAHS.map((surah) => surah.n)).size).toBe(SURAHS.length);
    for (const surah of SURAHS) {
      // Juz 30 beginnt bei Sura 78.
      expect(surah.n, surah.translit).toBeGreaterThanOrEqual(78);
      expect(surah.n, surah.translit).toBeLessThanOrEqual(114);
    }
  });

  it.each(ENTRIES)("%s hat arabischen Namen, deutschen Namen und Transkription", (_label, surah) => {
    expect(surah.name_ar.trim().length).toBeGreaterThan(0);
    expect(surah.name_de.trim().length).toBeGreaterThan(0);
    expect(surah.translit.trim().length).toBeGreaterThan(0);
  });

  it.each(ENTRIES)("%s beginnt mit der Basmala als Ayah 0", (_label, surah) => {
    expect(surah.ayat.length).toBeGreaterThan(1);
    expect(surah.ayat[0].n).toBe(0);
    expect(surah.ayat[0].words.map((word) => word.ar)).toEqual([
      "بِسْمِ", "اللَّهِ", "الرَّحْمَٰنِ", "الرَّحِيمِ",
    ]);
  });

  it.each(ENTRIES)("%s zaehlt die Ayat luecklos ab 1 durch", (_label, surah) => {
    const numbers = surah.ayat.filter((ayah) => ayah.n > 0).map((ayah) => ayah.n);
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
  });

  it.each(ENTRIES)("%s hat in jeder Ayah Woerter mit Tashkeel", (_label, surah) => {
    for (const ayah of surah.ayat) {
      expect(ayah.words.length, `${surah.n}:${ayah.n}`).toBeGreaterThan(0);
      for (const word of ayah.words) {
        expect(word.ar.trim(), `${surah.n}:${ayah.n}`).toBe(word.ar);
        expect(word.ar.length, `${surah.n}:${ayah.n}`).toBeGreaterThan(0);
        // Kein Leerzeichen: der Text ist wortweise gesplittet, weil das Modell
        // auf Einzelwoertern am zuverlaessigsten arbeitet.
        expect(word.ar.includes(" "), `${surah.n}:${ayah.n} "${word.ar}"`).toBe(false);
        expect(TASHKEEL.test(word.ar), `${surah.n}:${ayah.n} "${word.ar}" ohne Tashkeel`).toBe(true);
      }
    }
  });

  it("hat fuer jede Sura mindestens eine Ayah ausser der Basmala", () => {
    for (const surah of SURAHS) {
      expect(surah.ayat.filter((ayah) => ayah.n > 0).length, surah.translit).toBeGreaterThan(0);
    }
  });

  it("liefert genug Umfang fuer die Levels 7 bis 9", () => {
    const words = SURAHS.reduce(
      (sum, surah) =>
        sum + surah.ayat.filter((a) => a.n > 0).reduce((inner, a) => inner + a.words.length, 0),
      0,
    );
    const ayat = SURAHS.reduce((sum, surah) => sum + surah.ayat.filter((a) => a.n > 0).length, 0);
    expect(ayat).toBeGreaterThanOrEqual(100);
    expect(words).toBeGreaterThanOrEqual(300);
  });
});
