import type { CategoryId } from "@/data/categories";

export type LearningLevel = 5 | 6 | 7 | 8 | 9;
export type ProfileTheme = "coral" | "ocean" | "neutral";
export type LearningGoal = "arabic" | "pronunciation" | "quran" | "all";
export type ProfileStyle = "girl" | "boy" | "neutral";
export type ProfileMode = "child" | "parent";

export type ChildProfile = {
  name: string;
  mode: ProfileMode;
  style: ProfileStyle;
  theme: ProfileTheme;
  level: LearningLevel;
  goal: LearningGoal;
};

// Ein Bewertungs-Zustand (Wort-Chip, Buchstaben-Feedback): Grundfarbe fuer
// Balken/Raender, plus die drei Werte fuer eine lesbare Chip-Flaeche.
export type Tone = {
  base: string;
  bg: string;
  border: string;
  text: string;
};

export type ThemePalette = {
  // Marke
  primary: string;
  onPrimary: string;
  secondary: string;
  accent: string;
  // Flaechen und Text
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  // Zustaende
  info: string;
  recording: string;
  pending: Tone;
  scanning: Tone;
  good: Tone;
  medium: Tone;
  bad: Tone;
  // Kategorie-Karten: pro Theme eine eigene Reihe, damit die Karten
  // unterscheidbar bleiben und trotzdem zur Themenfamilie passen.
  categories: Record<CategoryId, string>;
};

export const PROFILE_THEMES: Record<ProfileTheme, ThemePalette> = {
  // Maedchen - warmes Rose
  coral: {
    primary: "#e85d75",
    onPrimary: "#ffffff",
    secondary: "#ff9f7f",
    accent: "#16b8a6",
    background: "#fff7f4",
    surface: "#ffffff",
    surfaceMuted: "#fdeeeb",
    border: "#f2d8d3",
    text: "#3a1f26",
    textMuted: "#8a6a70",
    info: "#0b7f77",
    recording: "#d81b60",
    pending: { base: "#b9a3a7", bg: "#faf3f2", border: "#ecdad6", text: "#6d5257" },
    scanning: { base: "#0e7490", bg: "#e8f4f7", border: "#a5d8e2", text: "#0b5c6b" },
    good: { base: "#0f9488", bg: "#e6f7f4", border: "#7fd8ce", text: "#0b6f66" },
    medium: { base: "#c76a00", bg: "#fdf0e0", border: "#f3c489", text: "#8f4e00" },
    bad: { base: "#9d174d", bg: "#fdeaf1", border: "#f0a5c0", text: "#8a0f43" },
    categories: {
      zahlen: "#d81b60",
      farben: "#d97706",
      tiere: "#0d9488",
      koerper: "#7c3aed",
      familie: "#a21caf",
      essen: "#dc2626",
      propheten: "#115e59",
    },
  },

  // Junge - kuehles Blau
  ocean: {
    primary: "#2474d2",
    onPrimary: "#ffffff",
    secondary: "#27b59f",
    accent: "#f59e0b",
    background: "#f3faff",
    surface: "#ffffff",
    surfaceMuted: "#eaf3fb",
    border: "#d3e3f2",
    text: "#0f2033",
    textMuted: "#5b7285",
    info: "#1d4ed8",
    recording: "#e11d48",
    pending: { base: "#9fb2c4", bg: "#f5f9fc", border: "#dae6f0", text: "#4f6478" },
    scanning: { base: "#1d4ed8", bg: "#eaf1fe", border: "#a9c4f7", text: "#1e40af" },
    good: { base: "#0f8a6a", bg: "#e5f6f0", border: "#83d9c1", text: "#0b6650" },
    medium: { base: "#b45309", bg: "#fdf1de", border: "#f2c688", text: "#8a4008" },
    bad: { base: "#d02a4e", bg: "#fdebef", border: "#f4adbc", text: "#9f1239" },
    categories: {
      zahlen: "#2563eb",
      farben: "#c026d3",
      tiere: "#0d9488",
      koerper: "#0369a1",
      familie: "#6d28d9",
      essen: "#b45309",
      propheten: "#065f46",
    },
  },

  // Neutral - Tuerkis
  neutral: {
    primary: "#159c9a",
    onPrimary: "#ffffff",
    secondary: "#f3b63f",
    accent: "#ef6c62",
    background: "#f5fbfa",
    surface: "#ffffff",
    surfaceMuted: "#e9f4f3",
    border: "#d3e6e4",
    text: "#0f2422",
    textMuted: "#52706d",
    info: "#0e7490",
    recording: "#dc2626",
    pending: { base: "#a3b6b4", bg: "#f4faf9", border: "#dbeae8", text: "#4f6d6a" },
    scanning: { base: "#0e7490", bg: "#e7f4f8", border: "#a3d6e3", text: "#0b5c6b" },
    good: { base: "#177f4b", bg: "#e6f5ec", border: "#8bd3a8", text: "#115e37" },
    medium: { base: "#b45309", bg: "#fdf2e0", border: "#f3c78c", text: "#8a4008" },
    bad: { base: "#d12f3f", bg: "#fdecee", border: "#f4aeb5", text: "#a01b28" },
    categories: {
      zahlen: "#2563eb",
      farben: "#d97706",
      tiere: "#16a34a",
      koerper: "#ec4899",
      familie: "#a855f7",
      essen: "#ef4444",
      propheten: "#059669",
    },
  },
};

export const LEVEL_SUMMARIES: Record<LearningLevel, string> = {
  5: "Buchstaben und Laute entdecken",
  6: "Harakat, Silben und erste Wörter",
  7: "Wortschatz und kurze Suren",
  8: "Ayat und Tajweed-Grundlagen",
  9: "Juz-Lernen und selbstständige Rezitation",
};
