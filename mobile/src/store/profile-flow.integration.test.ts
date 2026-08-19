import { describe, expect, it } from "vitest";
import { buildProfile, initialProfileScreen } from "./profileFlow";

describe("profile onboarding integration flow", () => {
  it("moves from loading to onboarding to home without navigation", () => {
    let profile = null;
    let hydrated = false;

    expect(initialProfileScreen(hydrated, profile)).toBe("loading");

    hydrated = true;
    expect(initialProfileScreen(hydrated, profile)).toBe("onboarding");

    profile = buildProfile({
      name: "Mariam",
      mode: "parent",
      style: "girl",
      level: 6,
      goal: "pronunciation",
    });
    expect(initialProfileScreen(hydrated, profile)).toBe("home");
    expect(profile).toMatchObject({
      name: "Mariam",
      mode: "parent",
      style: "girl",
      theme: "coral",
      level: 6,
      goal: "pronunciation",
    });
  });
});
