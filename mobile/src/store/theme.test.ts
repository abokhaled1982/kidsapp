import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/data/categories";
import { contrastRatio, hexToRgb, isDistinguishable } from "@/lib/color";
import { PROFILE_THEMES, type ProfileTheme } from "./profileModel";

const THEMES = Object.keys(PROFILE_THEMES) as ProfileTheme[];
const TONES = ["pending", "scanning", "good", "medium", "bad"] as const;
const HEX = /^#[0-9a-f]{6}$/i;

describe("theme palettes", () => {
  it.each(THEMES)("%s definiert jeden Token als gueltiges Hex", (theme) => {
    const palette = PROFILE_THEMES[theme];
    const flat: string[] = [
      palette.primary, palette.onPrimary, palette.secondary, palette.accent,
      palette.background, palette.surface, palette.surfaceMuted, palette.border,
      palette.text, palette.textMuted, palette.info, palette.recording,
      ...TONES.flatMap((tone) => [
        palette[tone].base, palette[tone].bg, palette[tone].border, palette[tone].text,
      ]),
      ...CATEGORIES.map((category) => palette.categories[category.id]),
    ];
    for (const value of flat) {
      expect(value, `Token in ${theme}`).toMatch(HEX);
      expect(() => hexToRgb(value)).not.toThrow();
    }
  });

  it.each(THEMES)("%s hat fuer jede Kategorie eine Farbe", (theme) => {
    const { categories } = PROFILE_THEMES[theme];
    expect(Object.keys(categories).sort()).toEqual(CATEGORIES.map((c) => c.id).sort());
  });

  // WCAG AA: 4.5:1 fuer normalen Text, 3:1 fuer grossen/fetten Text und
  // UI-Flaechen. Die Brand-Buttons tragen ausschliesslich fetten Text >= 16 px.
  it.each(THEMES)("%s ist lesbar (Text-Kontraste)", (theme) => {
    const p = PROFILE_THEMES[theme];
    expect(contrastRatio(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.textMuted, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.textMuted, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.info, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.onPrimary, p.recording)).toBeGreaterThanOrEqual(3);
  });

  it.each(THEMES)("%s: jeder Bewertungs-Chip ist lesbar", (theme) => {
    const p = PROFILE_THEMES[theme];
    for (const tone of TONES) {
      expect(contrastRatio(p[tone].text, p[tone].bg), `${theme}.${tone}`).toBeGreaterThanOrEqual(4.5);
    }
    // "pending" ist absichtlich leise (noch nicht bewertet) und darum vom
    // Mindestkontrast der aussagekraeftigen Zustaende ausgenommen.
    for (const tone of ["scanning", "good", "medium", "bad"] as const) {
      expect(contrastRatio(p[tone].base, p.surface), `${theme}.${tone} Balken`).toBeGreaterThanOrEqual(2.5);
    }
  });

  it.each(THEMES)("%s: gut / mittel / schlecht sind unterscheidbar", (theme) => {
    const p = PROFILE_THEMES[theme];
    const pairs = [["good", "medium"], ["good", "bad"], ["medium", "bad"]] as const;
    for (const [a, b] of pairs) {
      expect(
        isDistinguishable(p[a].base, p[b].base, { minHue: 25 }),
        `${theme}: ${a} (${p[a].base}) vs ${b} (${p[b].base})`,
      ).toBe(true);
    }
    // Der Aufnahme-Ton darf nicht mit "gut" verwechselbar sein.
    expect(
      isDistinguishable(p.recording, p.good.base, { minHue: 25 }),
      `${theme}: recording vs good`,
    ).toBe(true);
  });

  it.each(THEMES)("%s: Kategorie-Karten tragen weissen Text lesbar", (theme) => {
    const p = PROFILE_THEMES[theme];
    for (const category of CATEGORIES) {
      const color = p.categories[category.id];
      expect(contrastRatio("#ffffff", color), `${theme}.${category.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(THEMES)("%s: Kategorie-Karten sind voneinander unterscheidbar", (theme) => {
    const colors = CATEGORIES.map((c) => PROFILE_THEMES[theme].categories[c.id]);
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        expect(
          isDistinguishable(colors[i], colors[j]),
          `${theme}: ${CATEGORIES[i].id} (${colors[i]}) vs ${CATEGORIES[j].id} (${colors[j]})`,
        ).toBe(true);
      }
    }
  });

  it("haelt die Marken-Grundfarben der drei Themes stabil", () => {
    expect(PROFILE_THEMES.coral.primary).toBe("#e85d75");
    expect(PROFILE_THEMES.ocean.primary).toBe("#2474d2");
    expect(PROFILE_THEMES.neutral.primary).toBe("#159c9a");
  });
});
