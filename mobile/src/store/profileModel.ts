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

export const PROFILE_THEMES: Record<ProfileTheme, {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}> = {
  coral: { primary: "#e85d75", secondary: "#ff9f7f", accent: "#16b8a6", background: "#fff7f4" },
  ocean: { primary: "#2474d2", secondary: "#27b59f", accent: "#f59e0b", background: "#f3faff" },
  neutral: { primary: "#159c9a", secondary: "#f3b63f", accent: "#ef6c62", background: "#f5fbfa" },
};

export const LEVEL_SUMMARIES: Record<LearningLevel, string> = {
  5: "Buchstaben und Laute entdecken",
  6: "Harakat, Silben und erste Wörter",
  7: "Wortschatz und kurze Suren",
  8: "Ayat und Tajweed-Grundlagen",
  9: "Juz-Lernen und selbstständige Rezitation",
};
