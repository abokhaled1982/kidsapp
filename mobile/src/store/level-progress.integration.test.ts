// Integrationstest: ein Kind arbeitet ein Level von vorne bis hinten durch.
// Geprueft wird das Zusammenspiel von Levelplan, Inhaltsableitung, Fortschritt
// und "genau eine naechste Aufgabe" (Anforderung 16) - nicht die Einzelteile.

import { describe, expect, it } from "vitest";
import { LETTERS } from "@/data/letters";
import { QURAN_CORE_WORDS, SHORT_WORDS, SYLLABLES } from "@/data/harakat";
import { LEVEL_PLANS } from "@/data/levels";
import {
  HEARD_TARGET,
  coreWordKey,
  levelItems,
  levelProgress,
  masteryReached,
  nextStep,
  pathItems,
  reviewQueue,
  shortWordKey,
  surahWordCount,
  surahsForLevel,
  quranWordKey,
  type LevelItem,
  type ProgressSnapshot,
} from "./levelFlow";

// Kleiner Stellvertreter fuer den Progress-Store: dieselben zwei Tabellen,
// dieselben Schreiboperationen.
function makeProgress() {
  const snapshot: ProgressSnapshot = { mastered: {}, heard: {} };
  return {
    snapshot,
    listen(key: string) {
      snapshot.heard[key] = (snapshot.heard[key] ?? 0) + 1;
    },
    speak(key: string, score: number) {
      snapshot.mastered[key] = Math.max(snapshot.mastered[key] ?? 0, score);
    },
    // So erledigt die App einen Inhalt: hoeren bis zum Ziel oder sprechen.
    finish(item: LevelItem, score: number) {
      if (item.parts && item.parts.length > 0) {
        for (const part of item.parts) this.speak(part, score);
      } else if (item.mode === "speak") {
        this.speak(item.key, score);
      } else {
        for (let i = 0; i < HEARD_TARGET; i++) this.listen(item.key);
      }
    },
  };
}

describe("Level 5 von Anfang bis Abschluss", () => {
  it("fuehrt Schritt fuer Schritt durch alle Inhalte und endet bei 100 Prozent", () => {
    const progress = makeProgress();
    const total = levelItems(5).length;

    expect(levelProgress(5, progress.snapshot).done).toBe(0);
    expect(masteryReached(5, progress.snapshot)).toBe(false);

    let steps = 0;
    let step = nextStep(5, progress.snapshot);
    while (step) {
      progress.finish(step.item, LEVEL_PLANS[5].mastery.minScoreNew);
      steps++;
      // Kein Endlosdurchlauf, falls ein Inhalt nie als erledigt zaehlt.
      expect(steps).toBeLessThanOrEqual(total + 1);
      step = nextStep(5, progress.snapshot);
    }

    expect(steps).toBe(total);
    const done = levelProgress(5, progress.snapshot);
    expect(done.done).toBe(done.total);
    expect(done.ratio).toBe(1);
    expect(masteryReached(5, progress.snapshot)).toBe(true);
    expect(reviewQueue(5, progress.snapshot)).toEqual([]);
  });

  it("laesst den ersten Buchstaben erst nach einer bewerteten Aufnahme stehenbleiben", () => {
    const progress = makeProgress();
    const first = nextStep(5, progress.snapshot);
    expect(first?.item.label).toBe(LETTERS[0].ar);
    expect(first?.item.mode).toBe("speak");

    // Anhoeren ist Vorbereitung, keine Leistung: die Aufgabe bleibt stehen,
    // egal wie oft das Kind zuhoert (Kern der App: das Sprachmodell prueft).
    progress.listen(first!.item.key);
    progress.listen(first!.item.key);
    progress.listen(first!.item.key);
    expect(nextStep(5, progress.snapshot)?.item.key).toBe(first?.item.key);
    expect(levelProgress(5, progress.snapshot).done).toBe(0);

    // Eine zu schwache Aufnahme reicht auch nicht.
    progress.speak(first!.item.key, LEVEL_PLANS[5].mastery.minScoreNew - 1);
    expect(nextStep(5, progress.snapshot)?.item.key).toBe(first?.item.key);

    progress.speak(first!.item.key, LEVEL_PLANS[5].mastery.minScoreNew);
    const second = nextStep(5, progress.snapshot);
    expect(second?.item.key).not.toBe(first?.item.key);
    expect(second?.position).toBe(2);
    expect(levelProgress(5, progress.snapshot).done).toBe(1);
  });
});

describe("Level 6: Harakat, Silben und Lesewoerter", () => {
  it("waechst mit jedem erledigten Pfad und laesst die anderen unberuehrt", () => {
    const progress = makeProgress();
    const plan = LEVEL_PLANS[6];
    const syllablePath = plan.paths.find((path) => path.id === "l6-syllables")!;

    for (const item of pathItems(syllablePath, 6)) progress.finish(item, plan.mastery.minScoreNew);

    const after = levelProgress(6, progress.snapshot);
    const syllables = after.paths.find((path) => path.path.id === "l6-syllables")!;
    expect(syllables.done).toBe(SYLLABLES.length);
    expect(syllables.ratio).toBe(1);
    // Der Wortpfad ist davon voellig unberuehrt.
    expect(after.paths.find((path) => path.path.id === "l6-words")?.done).toBe(0);
    expect(after.done).toBeGreaterThan(0);
    expect(after.done).toBeLessThan(after.total);
  });

  it("nimmt Lesewoerter erst ab der Punktschwelle ab", () => {
    const progress = makeProgress();
    const key = shortWordKey(SHORT_WORDS[0].ar);
    const threshold = LEVEL_PLANS[6].mastery.minScoreNew;

    progress.speak(key, threshold - 5);
    const weak = levelProgress(6, progress.snapshot).paths.find((p) => p.path.id === "l6-words");
    expect(weak?.done).toBe(0);
    // Ein angefangenes Wort steht in der Wiederholungsliste vorne.
    expect(reviewQueue(6, progress.snapshot, 3)[0].key).toBe(key);

    progress.speak(key, threshold);
    expect(levelProgress(6, progress.snapshot).paths.find((p) => p.path.id === "l6-words")?.done).toBe(1);
    expect(reviewQueue(6, progress.snapshot, 3).map((item) => item.key)).not.toContain(key);
  });

  it("behaelt den besseren Versuch, wenn eine Aufnahme schlechter ausfaellt", () => {
    const progress = makeProgress();
    const key = coreWordKey(QURAN_CORE_WORDS[0].ar);
    progress.speak(key, 95);
    progress.speak(key, 40);
    expect(progress.snapshot.mastered[key]).toBe(95);
    expect(levelProgress(6, progress.snapshot).paths.find((p) => p.path.id === "l6-quran-words")?.done).toBe(1);
  });
});

describe("Level 7: kurze Suren aus echten Wortscores", () => {
  it("zaehlt eine Sura erst als geschafft, wenn jedes ihrer Woerter sitzt", () => {
    const progress = makeProgress();
    const plan = LEVEL_PLANS[7];
    const surah = surahsForLevel(7)[0];
    const items = pathItems(plan.paths.find((path) => path.id === "l7-surahs")!, 7);
    const item = items.find((entry) => entry.key === `surah:${surah.n}`)!;

    expect(item.parts).toHaveLength(surahWordCount(surah));

    // Alle Woerter bis auf eines schaffen: die Sura bleibt offen.
    const [last, ...rest] = [...item.parts!].reverse();
    for (const key of rest) progress.speak(key, plan.mastery.minScoreNew);
    let surahs = levelProgress(7, progress.snapshot).paths.find((p) => p.path.id === "l7-surahs");
    expect(surahs?.done).toBe(0);

    progress.speak(last, plan.mastery.minScoreNew);
    surahs = levelProgress(7, progress.snapshot).paths.find((p) => p.path.id === "l7-surahs");
    expect(surahs?.done).toBe(1);
  });

  it("laesst denselben Wortscore auch den Ayah-Pfad vorruecken", () => {
    const progress = makeProgress();
    const surah = surahsForLevel(7)[0];
    const ayah = surah.ayat.find((entry) => entry.n === 1)!;
    for (const word of ayah.words) {
      progress.speak(quranWordKey(surah.n, ayah.n, word.ar), LEVEL_PLANS[7].mastery.minScoreNew);
    }
    // Ein Wortscore, zwei Sichten: Rhythmus-Pfad (Ayat) sieht ihn genauso.
    const rhythm = levelProgress(7, progress.snapshot).paths.find((p) => p.path.id === "l7-rhythm");
    expect(rhythm?.done).toBe(1);
  });

  it("verlangt in Level 8 mehr Punkte fuer denselben Inhalt als in Level 7", () => {
    const progress = makeProgress();
    const surah = surahsForLevel(7)[0];
    for (const ayah of surah.ayat.filter((entry) => entry.n > 0)) {
      for (const word of ayah.words) {
        progress.speak(quranWordKey(surah.n, ayah.n, word.ar), 80);
      }
    }
    // 80 Punkte reichen Level 7 (Schwelle 80), nicht Level 8 (Schwelle 85).
    expect(levelProgress(7, progress.snapshot).paths.find((p) => p.path.id === "l7-surahs")?.done).toBe(1);
    expect(levelProgress(8, progress.snapshot).paths.find((p) => p.path.id === "l8-juzamma")?.done).toBe(0);
  });
});

describe("Level 9: angekuendigte Inhalte tauschen sich nicht ein", () => {
  it("laesst Juz Tabarak leer, statt Juz Amma zweimal zu zeigen", () => {
    const progress = makeProgress();
    const nine = levelProgress(9, progress.snapshot);
    const tabarak = nine.paths.find((path) => path.path.id === "l9-tabarak");
    const juzamma = nine.paths.find((path) => path.path.id === "l9-juzamma");

    expect(tabarak?.total).toBe(0);
    expect(juzamma?.total).toBeGreaterThan(0);
    // Ein Pfad ohne Inhalte darf nie die naechste Aufgabe stellen.
    expect(nextStep(9, progress.snapshot)?.path.id).not.toBe("l9-tabarak");
  });

  it("erreicht 100 Prozent, obwohl ein Pfad noch keine Inhalte hat", () => {
    const progress = makeProgress();
    let step = nextStep(9, progress.snapshot);
    let guard = 0;
    while (step) {
      progress.finish(step.item, LEVEL_PLANS[9].mastery.minScoreNew);
      expect(++guard).toBeLessThanOrEqual(levelItems(9).length + 1);
      step = nextStep(9, progress.snapshot);
    }
    expect(masteryReached(9, progress.snapshot)).toBe(true);
    expect(levelProgress(9, progress.snapshot).ratio).toBe(1);
  });
});
