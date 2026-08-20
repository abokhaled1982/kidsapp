// Unit-Tests fuer die Tajweed-Regeln (Anforderungen 5.4 und 5.5).
// Kernzusage: jede Regel zeigt auf eine echte Stelle in Juz Amma. Kein
// erfundenes Beispiel, keine falsche Sura:Ayah-Referenz.

import { describe, expect, it } from "vitest";
import { SURAHS } from "./juzamma";
import { TAJWEED_BY_ID, TAJWEED_RULES, tajweedForLevel, type TajweedExample } from "./tajweed";

const surahOf = (n: number) => SURAHS.find((surah) => surah.n === n);

// Alle Referenzen (Beispiel und Gegenbeispiel) in einer flachen Liste.
const REFERENCES: [string, TajweedExample][] = TAJWEED_RULES.flatMap((rule) => {
  const entries: [string, TajweedExample][] = [[`${rule.id} (Beispiel)`, rule.example]];
  if (rule.contrast) entries.push([`${rule.id} (Gegenbeispiel)`, rule.contrast]);
  return entries;
});

describe("TAJWEED_RULES", () => {
  it("hat acht Regeln mit eindeutigen Ids", () => {
    expect(TAJWEED_RULES).toHaveLength(8);
    expect(new Set(TAJWEED_RULES.map((rule) => rule.id)).size).toBe(TAJWEED_RULES.length);
  });

  it("erklaert jede Regel kindgerecht und sagt, worauf zu hoeren ist", () => {
    for (const rule of TAJWEED_RULES) {
      expect(rule.title.trim().length, rule.id).toBeGreaterThan(0);
      expect(rule.arabic.trim().length, rule.id).toBeGreaterThan(0);
      expect(rule.emoji.trim().length, rule.id).toBeGreaterThan(0);
      expect(rule.kidExplanation.trim().length, rule.id).toBeGreaterThan(10);
      expect(rule.listenFor.trim().length, rule.id).toBeGreaterThan(10);
    }
  });

  it("ist ueber die Id-Tabelle vollstaendig erreichbar", () => {
    for (const rule of TAJWEED_RULES) {
      expect(TAJWEED_BY_ID[rule.id]).toBe(rule);
    }
  });
});

describe("Tajweed-Referenzen gegen juzamma.ts", () => {
  it.each(REFERENCES)("%s zeigt auf eine vorhandene Sura", (_label, ref) => {
    expect(surahOf(ref.surah), `Sura ${ref.surah} fehlt`).toBeDefined();
  });

  it.each(REFERENCES)("%s zeigt auf eine vorhandene Ayah", (_label, ref) => {
    const ayah = surahOf(ref.surah)?.ayat.find((a) => a.n === ref.ayah);
    expect(ayah, `Sura ${ref.surah}:${ref.ayah} fehlt`).toBeDefined();
    expect(ayah?.n).toBeGreaterThan(0);
  });

  it.each(REFERENCES)("%s nennt ein Wort, das in dieser Ayah wirklich steht", (_label, ref) => {
    const words = surahOf(ref.surah)?.ayat.find((a) => a.n === ref.ayah)?.words ?? [];
    expect(
      words.some((word) => word.ar === ref.ar),
      `${ref.ar} steht nicht in ${ref.surah}:${ref.ayah} (${words.map((w) => w.ar).join(" ")})`,
    ).toBe(true);
  });

  it.each(REFERENCES)("%s hat eine Transkription", (_label, ref) => {
    expect(ref.translit.trim().length).toBeGreaterThan(0);
  });
});

describe("tajweedForLevel", () => {
  it("gibt Level 8 sechs Bausteine", () => {
    expect(tajweedForLevel(8)).toHaveLength(6);
    expect(tajweedForLevel(8).every((rule) => rule.level === 8)).toBe(true);
  });

  it("legt in Level 9 zwei Regeln dazu und wiederholt die aus Level 8", () => {
    const nine = tajweedForLevel(9);
    expect(nine).toHaveLength(8);
    const eightIds = tajweedForLevel(8).map((rule) => rule.id);
    for (const id of eightIds) {
      expect(nine.map((rule) => rule.id)).toContain(id);
    }
  });

  it("liefert vor Level 8 noch keine Regeln", () => {
    for (const level of [5, 6, 7]) {
      expect(tajweedForLevel(level), `Level ${level}`).toEqual([]);
    }
  });

  it("nennt eine Dauer, wo die Regel eine Laenge hat", () => {
    const timed = TAJWEED_RULES.filter((rule) => rule.timing);
    expect(timed.length).toBeGreaterThanOrEqual(3);
    for (const rule of timed) {
      expect(rule.timing).toMatch(/Zählzeit/);
    }
  });
});
