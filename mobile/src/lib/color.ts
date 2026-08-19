// Kleine Farb-Helfer fuer Kontrast-Pruefungen (WCAG 2.1) und Farbabstaende.
// Wird von den Theme-Tests genutzt, damit kein Theme mit unlesbaren
// Kombinationen in die App rutscht.

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Ungueltige Farbe: ${hex}`);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

// Relative Luminanz nach WCAG 2.1
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// Kontrastverhaeltnis zwischen 1 (identisch) und 21 (Schwarz auf Weiss)
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

// Euklidischer Abstand im sRGB-Raum (0 - 441). Grober, aber ausreichender
// Indikator dafuer, ob zwei Farben fuer Kinder unterscheidbar sind.
export function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.sqrt((x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2);
}

// Farbwinkel in Grad (0 = Rot, 120 = Gruen, 240 = Blau).
export function hue(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return 0; // Grau hat keinen Farbwinkel
  const raw =
    max === rn ? ((gn - bn) / delta) % 6 :
    max === gn ? (bn - rn) / delta + 2 :
    (rn - gn) / delta + 4;
  return (raw * 60 + 360) % 360;
}

// Kuerzester Abstand zweier Farbwinkel auf dem Farbkreis (0 - 180).
export function hueDistance(a: string, b: string): number {
  const diff = Math.abs(hue(a) - hue(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

// Zwei Farben gelten als unterscheidbar, wenn sie sich deutlich im Farbton
// ODER in der Helligkeit trennen. Reiner RGB-Abstand ist dafuer zu grob:
// Rosa und Rot koennen nah beieinander liegen und sind trotzdem verwechselbar,
// waehrend Hell- und Dunkeltuerkis den gleichen Farbton haben und sich klar
// unterscheiden.
export function isDistinguishable(
  a: string,
  b: string,
  { minHue = 18, minLightnessRatio = 1.5 } = {},
): boolean {
  return hueDistance(a, b) >= minHue || contrastRatio(a, b) >= minLightnessRatio;
}

