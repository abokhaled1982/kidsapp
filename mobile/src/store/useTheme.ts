import { PROFILE_THEMES, type ThemePalette } from "./profileModel";
import { themeForProfile } from "./profileFlow";
import { useProfile } from "./useProfile";

// Farben des aktiven Profils. Ohne Profil (Onboarding, erster Start) wird
// bewusst das neutrale Theme benutzt, bis das Kind seinen Stil gewaehlt hat.
export function useTheme(): ThemePalette {
  const profile = useProfile((state) => state.profile);
  return profile ? themeForProfile(profile) : PROFILE_THEMES.neutral;
}
