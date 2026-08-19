import {
  PROFILE_THEMES,
  type ChildProfile,
  type LearningGoal,
  type LearningLevel,
  type ProfileMode,
  type ProfileStyle,
  type ProfileTheme,
} from "./profileModel";

export type ProfileScreen = "loading" | "onboarding" | "home";

export function initialProfileScreen(hasHydrated: boolean, profile: ChildProfile | null): ProfileScreen {
  if (!hasHydrated) return "loading";
  return profile ? "home" : "onboarding";
}

export function themeForStyle(style: ProfileStyle): ProfileTheme {
  if (style === "girl") return "coral";
  if (style === "boy") return "ocean";
  return "neutral";
}

export function buildProfile(input: {
  name?: string;
  mode: ProfileMode;
  style: ProfileStyle;
  level: LearningLevel;
  goal: LearningGoal;
}): ChildProfile {
  return {
    name: input.name?.trim() || "Lernkind",
    mode: input.mode,
    style: input.style,
    theme: themeForStyle(input.style),
    level: input.level,
    goal: input.goal,
  };
}

export function themeForProfile(profile: ChildProfile) {
  return PROFILE_THEMES[profile.theme];
}
