// Integrationstest ueber die echten Zustand-Stores: eine Aufnahme wird ueber
// useProgress gespeichert und muss danach im Levelfortschritt auftauchen.
// Anforderung 14: "Zustand und Progress-Store erweitern statt parallele Stores
// einzufuehren" - genau diese Kopplung wird hier geprueft.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LETTERS } from "@/data/letters";
import { QURAN_CORE_WORDS, SHORT_WORDS } from "@/data/harakat";
import { LEVEL_PLANS } from "@/data/levels";
import { themeForProfile, themeForStyle } from "./profileFlow";
import type { ChildProfile } from "./profileModel";
import {
  HEARD_TARGET,
  coreWordKey,
  letterFormKey,
  letterKey,
  levelProgress,
  masteryReached,
  nextStep,
  reviewQueue,
  shortWordKey,
  type ProgressSnapshot,
} from "./levelFlow";
import { level, useProgress } from "./useProgress";
import { useProfile } from "./useProfile";

// Die Stores persistieren ueber AsyncStorage. Im Test ersetzt eine Map das
// native Modul, sonst laedt vitest React-Native-Code. vitest zieht diesen
// Aufruf automatisch vor die Imports.
vi.mock("@react-native-async-storage/async-storage", () => {
  const memory = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: async (key: string) => {
        memory.delete(key);
      },
    },
  };
});

// Genauso baut app/level.tsx den Snapshot aus dem Store.
const snapshot = (): ProgressSnapshot => {
  const state = useProgress.getState();
  return { mastered: state.wordsMastered, heard: state.heard };
};

const baseProfile: ChildProfile = {
  mode: "child",
  style: "girl",
  theme: themeForStyle("girl"),
  name: "Lina",
  level: 5,
  goal: "quran",
};

beforeEach(() => {
  useProgress.getState().reset();
  useProfile.getState().clearProfile();
});

describe("Progress-Store und Levelfortschritt", () => {
  it("laesst eine bewertete Buchstabenaufnahme im Levelfortschritt ankommen", () => {
    const key = letterKey(LETTERS[0].id);
    expect(levelProgress(5, snapshot()).done).toBe(0);

    // Anhoeren wird gemerkt, schliesst den Buchstaben aber nicht ab: die
    // Aussprache prueft das Sprachmodell.
    useProgress.getState().markHeard(key);
    useProgress.getState().markHeard(key);
    expect(useProgress.getState().heard[key]).toBe(HEARD_TARGET);
    expect(levelProgress(5, snapshot()).done).toBe(0);
    expect(nextStep(5, snapshot())?.item.key).toBe(key);

    useProgress.getState().addResult(key, LEVEL_PLANS[5].mastery.minScoreNew);
    expect(levelProgress(5, snapshot()).done).toBe(1);
    expect(nextStep(5, snapshot())?.item.key).not.toBe(key);
  });

  it("laesst eine gehoerte Buchstabenform im Levelfortschritt ankommen", () => {
    // Formen erkennt man, man liest sie nicht vor - hier zaehlt Anhoeren.
    const key = letterFormKey(LETTERS.find((letter) => letter.connects)!.id);
    const before = levelProgress(5, snapshot()).paths.find((p) => p.path.stage === "letterForms");
    expect(before?.done).toBe(0);

    useProgress.getState().markHeard(key);
    expect(
      levelProgress(5, snapshot()).paths.find((p) => p.path.stage === "letterForms")?.done,
    ).toBe(0);

    useProgress.getState().markHeard(key);
    expect(
      levelProgress(5, snapshot()).paths.find((p) => p.path.stage === "letterForms")?.done,
    ).toBe(1);
  });

  it("laesst eine bewertete Aufnahme den Wortpfad vorruecken und XP geben", () => {
    const key = shortWordKey(SHORT_WORDS[0].ar);
    useProgress.getState().addResult(key, LEVEL_PLANS[6].mastery.minScoreNew);

    const state = useProgress.getState();
    expect(state.wordsMastered[key]).toBe(LEVEL_PLANS[6].mastery.minScoreNew);
    expect(state.xp).toBeGreaterThan(0);
    expect(state.stars).toBeGreaterThan(0);
    expect(state.streakDays).toBe(1);

    const words = levelProgress(6, snapshot()).paths.find((path) => path.path.id === "l6-words");
    expect(words?.done).toBe(1);
  });

  it("haelt eine schwaechere zweite Aufnahme aus dem Fortschritt heraus", () => {
    const key = coreWordKey(QURAN_CORE_WORDS[0].ar);
    useProgress.getState().addResult(key, 95);
    useProgress.getState().addResult(key, 30);
    // Der Store behaelt den besseren Wert - ein Rueckschritt darf einen bereits
    // geschafften Inhalt nicht wieder aufreissen.
    expect(useProgress.getState().wordsMastered[key]).toBe(95);
    expect(
      levelProgress(6, snapshot()).paths.find((path) => path.path.id === "l6-quran-words")?.done,
    ).toBe(1);
  });

  it("schiebt eine zu schwache Aufnahme in die Wiederholung", () => {
    const key = shortWordKey(SHORT_WORDS[3].ar);
    useProgress.getState().addResult(key, 55);
    const queue = reviewQueue(6, snapshot(), 5);
    expect(queue[0].key).toBe(key);

    useProgress.getState().addResult(key, LEVEL_PLANS[6].mastery.minScoreNew);
    expect(reviewQueue(6, snapshot(), 5).map((item) => item.key)).not.toContain(key);
  });

  it("setzt mit reset beide Tabellen und damit den Levelfortschritt zurueck", () => {
    useProgress.getState().markHeard(letterKey(LETTERS[0].id));
    useProgress.getState().addResult(shortWordKey(SHORT_WORDS[0].ar), 90);
    expect(levelProgress(6, snapshot()).done).toBeGreaterThan(0);

    useProgress.getState().reset();
    expect(snapshot()).toEqual({ mastered: {}, heard: {} });
    expect(levelProgress(5, snapshot()).done).toBe(0);
    expect(levelProgress(6, snapshot()).done).toBe(0);
    expect(masteryReached(6, snapshot())).toBe(false);
  });

  it("rechnet XP-Level und Lernlevel unabhaengig voneinander", () => {
    // Das Spielniveau (XP) sagt nichts ueber die Lernstufe des Kindes.
    for (let i = 0; i < 30; i++) useProgress.getState().addResult(`fake:${i}`, 100);
    expect(level(useProgress.getState().xp)).toBeGreaterThan(1);
    // Fremde Schluessel gehoeren zu keinem Levelinhalt.
    expect(levelProgress(5, snapshot()).done).toBe(0);
  });
});

describe("Profil-Store und Levelinhalte", () => {
  it("wechselt die Inhalte, wenn der Elternbereich die Lernstufe umstellt", () => {
    useProfile.getState().saveProfile(baseProfile);
    const first = nextStep(useProfile.getState().profile!.level, snapshot());
    expect(first?.item.stage).toBe("letters");

    // Elternbereich: Lernstufe auf 7 stellen (settings.tsx).
    useProfile.getState().updateProfile({ level: 7 });
    expect(useProfile.getState().profile?.level).toBe(7);
    const later = nextStep(useProfile.getState().profile!.level, snapshot());
    expect(later?.item.stage).not.toBe("letters");
    expect(later?.path.id.startsWith("l7-")).toBe(true);
  });

  it("behaelt den Fortschritt beim Wechsel der Lernstufe", () => {
    useProfile.getState().saveProfile(baseProfile);
    const key = shortWordKey(SHORT_WORDS[0].ar);
    useProgress.getState().addResult(key, 100);

    useProfile.getState().updateProfile({ level: 7 });
    useProfile.getState().updateProfile({ level: 6 });
    // Derselbe Schluessel, dieselbe Punktzahl - nichts wurde beim Wechsel verworfen.
    expect(useProgress.getState().wordsMastered[key]).toBe(100);
    expect(levelProgress(6, snapshot()).paths.find((path) => path.path.id === "l6-words")?.done).toBe(1);
  });

  it("faerbt die App sofort um, wenn der Stil gewechselt wird", () => {
    useProfile.getState().saveProfile(baseProfile);
    const girl = themeForProfile(useProfile.getState().profile!);

    useProfile.getState().updateProfile({ style: "boy", theme: themeForStyle("boy") });
    const boy = themeForProfile(useProfile.getState().profile!);
    expect(boy.primary).not.toBe(girl.primary);
    // Der Fortschritt und alles andere am Profil bleiben unangetastet.
    expect(useProfile.getState().profile?.name).toBe("Lina");
    expect(useProfile.getState().profile?.level).toBe(5);
  });

  it("laesst nach clearProfile nichts vom alten Kind stehen", () => {
    useProfile.getState().saveProfile(baseProfile);
    useProfile.getState().clearProfile();
    expect(useProfile.getState().profile).toBeNull();
    // updateProfile auf ein leeres Profil darf keins erfinden.
    useProfile.getState().updateProfile({ level: 9 });
    expect(useProfile.getState().profile).toBeNull();
  });
});

describe("Ein Kind schafft Level 5 ueber den echten Store", () => {
  it("erreicht das Abschlusskriterium und kann danach aufsteigen", () => {
    useProfile.getState().saveProfile(baseProfile);
    const store = useProgress.getState();
    let guard = 0;

    let step = nextStep(5, snapshot());
    while (step) {
      const item = step.item;
      if (item.parts && item.parts.length > 0) {
        for (const part of item.parts) store.addResult(part, 100);
      } else if (item.mode === "speak") {
        store.addResult(item.key, 100);
      } else {
        for (let i = 0; i < HEARD_TARGET; i++) store.markHeard(item.key);
      }
      expect(++guard).toBeLessThan(2000);
      step = nextStep(5, snapshot());
    }

    expect(masteryReached(5, snapshot())).toBe(true);
    expect(levelProgress(5, snapshot()).ratio).toBe(1);

    useProfile.getState().updateProfile({ level: 6 });
    // Level 6 startet bei null, obwohl Level 5 komplett ist - neue Inhalte.
    expect(masteryReached(6, snapshot())).toBe(false);
    expect(nextStep(6, snapshot())).not.toBeNull();
  });
});
