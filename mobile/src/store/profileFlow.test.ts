import { describe, expect, it } from "vitest";
import { buildProfile, initialProfileScreen, themeForProfile, themeForStyle } from "./profileFlow";

 describe("profile flow unit tests", () => {
  it("keeps the root stable while storage is hydrating", () => {
    expect(initialProfileScreen(false, null)).toBe("loading");
  });

  it("shows onboarding only after hydration when no profile exists", () => {
    expect(initialProfileScreen(true, null)).toBe("onboarding");
  });

  it("opens the home screen after a profile is saved", () => {
    const profile = buildProfile({ mode: "child", style: "neutral", level: 7, goal: "all" });
    expect(initialProfileScreen(true, profile)).toBe("home");
  });

  it("maps profile styles to accessible themes", () => {
    expect(themeForStyle("girl")).toBe("coral");
    expect(themeForStyle("boy")).toBe("ocean");
    expect(themeForStyle("neutral")).toBe("neutral");
  });

  it("uses a safe fallback name and a matching theme", () => {
    const profile = buildProfile({ name: "  ", mode: "parent", style: "boy", level: 9, goal: "quran" });
    expect(profile.name).toBe("Lernkind");
    expect(profile.theme).toBe("ocean");
    expect(themeForProfile(profile).primary).toBe("#2474d2");
  });
});
