// Systemtest: die Datenschicht nennt Navigationsziele als Text
// ("/(tabs)/quran"). Ob es diese Route wirklich gibt, entscheidet der
// Dateibaum unter app/ - expo-router leitet die Routen aus Dateinamen ab.
// Ein Tippfehler faellt sonst erst auf dem Geraet auf, wenn ein Kind auf die
// Lernpfad-Karte tippt und nichts passiert.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_ROUTES, LEVEL_ORDER, LEVEL_PLANS } from "@/data/levels";
import { CATEGORIES } from "@/data/categories";
import { EXTRA_WORD_SOURCES, WORD_SOURCES } from "@/data/wordSources";
import { SURAHS } from "@/data/juzamma";

const APP_DIR = resolve(__dirname, "../../app");

// expo-router: "/x" -> app/x.tsx, ein Ordner braucht seine index.tsx, und
// "/play/kurz" landet auf der dynamischen Datei app/play/[categoryId].tsx.
function routeExists(route: string): boolean {
  const relative = route.replace(/^\//, "");
  const target = relative === "" ? APP_DIR : join(APP_DIR, relative);
  if (existsSync(`${target}.tsx`) || existsSync(join(target, "index.tsx"))) return true;
  const segments = relative.split("/");
  const parent = join(APP_DIR, ...segments.slice(0, -1));
  if (segments.length < 2 || !existsSync(parent)) return false;
  return readdirSync(parent).some((name) => /^\[.+\]\.tsx$/.test(name));
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const APP_FILES = tsxFiles(APP_DIR);

describe("App-Verzeichnis", () => {
  it("hat die Screens, die expo-router fuer diese App braucht", () => {
    for (const file of ["_layout.tsx", "onboarding.tsx", "level.tsx", "settings.tsx", "letters.tsx"]) {
      expect(existsSync(join(APP_DIR, file)), file).toBe(true);
    }
    for (const file of ["_layout.tsx", "index.tsx", "quran.tsx", "games.tsx", "rewards.tsx"]) {
      expect(existsSync(join(APP_DIR, "(tabs)", file)), `(tabs)/${file}`).toBe(true);
    }
    // Dynamische Routen fuer Wortlisten und Suren.
    expect(existsSync(join(APP_DIR, "play", "[categoryId].tsx"))).toBe(true);
    expect(existsSync(join(APP_DIR, "quran", "[surahId].tsx"))).toBe(true);
  });
});

describe("KNOWN_ROUTES", () => {
  it("zeigt auf Dateien, die es wirklich gibt", () => {
    for (const route of KNOWN_ROUTES) {
      expect(routeExists(route), route).toBe(true);
    }
  });

  it("enthaelt keine Route doppelt", () => {
    expect(new Set(KNOWN_ROUTES).size).toBe(KNOWN_ROUTES.length);
  });
});

describe("Lernpfade und Navigation", () => {
  it("fuehrt jeden Lernpfad auf einen existierenden Screen", () => {
    for (const level of LEVEL_ORDER) {
      for (const path of LEVEL_PLANS[level].paths) {
        expect(routeExists(path.route), `${path.id} -> ${path.route}`).toBe(true);
      }
    }
  });

  it("haelt Level 5 auf einem Screen und verteilt die hoeheren Level", () => {
    // Anforderung 8: fuer die Jungsten wenig Dichte - alle Pfade von Level 5
    // fuehren auf den Buchstaben-Screen. Ab Level 7 wird das Angebot breiter.
    expect(new Set(LEVEL_PLANS[5].paths.map((path) => path.route))).toEqual(new Set(["/letters"]));
    for (const level of [7, 8, 9] as const) {
      const routes = new Set(LEVEL_PLANS[level].paths.map((path) => path.route));
      expect(routes.size, `Level ${level}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("router.push-Ziele im App-Code", () => {
  // Statische Ziele aus dem Quelltext ziehen: router.push("/x") / router.replace("/x").
  const literals = new Set<string>();
  for (const file of APP_FILES) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/router\.(?:push|replace)\(\s*"(\/[^"]*)"/g)) {
      literals.add(match[1]);
    }
  }

  it("findet die erwarteten festen Navigationsziele", () => {
    // Wenn der Regex ins Leere greift, ist der Test wertlos - daher diese Bremse.
    expect(literals.size).toBeGreaterThanOrEqual(4);
    expect(literals).toContain("/settings");
    expect(literals).toContain("/level");
  });

  it("zeigt mit jedem festen Ziel auf eine existierende Datei", () => {
    for (const route of literals) {
      expect(routeExists(route), route).toBe(true);
    }
  });

  it("bedient jede Wortquelle ueber die dynamische Play-Route", () => {
    // /play/${id} braucht app/play/[categoryId].tsx - und die Route muss jede
    // Kategorie und die beiden Extra-Listen (kurz, quran-core) annehmen.
    const play = join(APP_DIR, "play", "[categoryId].tsx");
    expect(existsSync(play)).toBe(true);
    const source = readFileSync(play, "utf8");
    expect(source).toContain("useLocalSearchParams");
    expect(source).toContain("wordSource");
    // Feste Play-Links im Code (z. B. /play/kurz) muessen eine echte Quelle treffen.
    const ids = new Set(WORD_SOURCES.map((entry) => entry.id));
    const linked = [...literals].filter((route) => route.startsWith("/play/"));
    expect(linked.length).toBeGreaterThan(0);
    for (const route of linked) {
      expect(ids, route).toContain(route.slice("/play/".length));
    }
    for (const id of [...CATEGORIES.map((c) => c.id), ...EXTRA_WORD_SOURCES.map((s) => s.id)]) {
      expect(id, id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("bedient jede Sura ueber die dynamische Quran-Route", () => {
    const surahScreen = join(APP_DIR, "quran", "[surahId].tsx");
    const source = readFileSync(surahScreen, "utf8");
    expect(source).toContain("useLocalSearchParams");
    for (const surah of SURAHS) {
      expect(Number.isInteger(surah.n), String(surah.n)).toBe(true);
    }
  });
});

describe("Bildebene der Kinderoberflaeche", () => {
  // Anforderung 8: Kinder bedienen die App ueber Bilder, nicht ueber Textzeilen.
  // Alle Bilder laufen ueber PictureTile - so bleibt der Wechsel von Emoji auf
  // die gezeichneten Illustrationen ein einziger Griff.
  const TILE = resolve(__dirname, "../components/PictureTile.tsx");

  it("faerbt das Bildfeld aus dem Theme", () => {
    expect(existsSync(TILE)).toBe(true);
    const source = readFileSync(TILE, "utf8");
    expect(source).toContain("useTheme");
    // Flaeche, Rand und Beschriftung kommen aus der Palette.
    for (const token of ["c.surfaceMuted", "c.border", "c.primary", "c.onPrimary"]) {
      expect(source, token).toContain(token);
    }
    expect(/#[0-9a-fA-F]{3,8}\b/.test(source)).toBe(false);
  });

  it("zeigt Bilder auf jedem Bildschirm, den ein Kind bedient", () => {
    for (const file of [
      join(APP_DIR, "(tabs)", "index.tsx"),
      join(APP_DIR, "(tabs)", "games.tsx"),
      join(APP_DIR, "letters.tsx"),
      join(APP_DIR, "play", "[categoryId].tsx"),
    ]) {
      expect(readFileSync(file, "utf8"), file).toContain("PictureTile");
    }
  });
});

describe("Themenfarben im App-Code", () => {
  // Nutzerentscheidung: alle Farben kommen aus dem Profil-Theme.
  // Bewusste Ausnahmen: settings.tsx hat eine dunkle Diagnosebox, und
  // onboarding.tsx kann kein Profil-Theme lesen, weil das Profil erst dort
  // entsteht - es traegt eine eigene neutrale Palette bis zur Stilwahl.
  const EXEMPT = ["settings.tsx", "onboarding.tsx"];

  it("laedt in jedem farbtragenden Screen das Theme", () => {
    for (const file of APP_FILES) {
      if (file.endsWith("onboarding.tsx")) continue;
      const source = readFileSync(file, "utf8");
      // Layout-Dateien ohne eigene Farben brauchen kein Theme.
      if (!/#[0-9a-fA-F]{3,8}|backgroundColor|color:/.test(source)) continue;
      expect(source.includes("useTheme"), file).toBe(true);
    }
  });

  it("hat keine fest verdrahteten Farben in den Screens", () => {
    const offenders: string[] = [];
    for (const file of APP_FILES) {
      if (EXEMPT.some((name) => file.endsWith(name))) continue;
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        // Reine Transparenz-/Schattenwerte (rgba) bleiben erlaubt.
        const hex = line.match(/#[0-9a-fA-F]{3,8}\b/g);
        if (hex) offenders.push(`${file}:${index + 1} ${hex.join(",")}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("haelt die festen Farben im Onboarding auf die Palette vor der Stilwahl begrenzt", () => {
    const source = readFileSync(join(APP_DIR, "onboarding.tsx"), "utf8");
    // Ab der Stilwahl kommt die Farbe aus dem gewaehlten Stil, nicht aus einem Default.
    expect(source).toContain("themeForStyle");
    expect(source).toContain("PROFILE_THEMES");

    const lines = source.split("\n");
    const start = lines.findIndex((line) => line.includes("const PRE_STYLE_COLORS"));
    expect(start).toBeGreaterThan(0);
    const end = start + lines.slice(start).findIndex((line) => line.startsWith("};"));
    const outside = lines
      .map((line, index) => ({ line, index }))
      .filter(({ index }) => index < start || index > end)
      .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b/.test(line))
      .map(({ line, index }) => `onboarding.tsx:${index + 1} ${line.trim()}`);
    expect(outside).toEqual([]);
  });

  it("nutzt in settings.tsx feste Farben nur in der Diagnosebox", () => {
    const lines = readFileSync(join(APP_DIR, "settings.tsx"), "utf8").split("\n");
    // Die Diagnoseausgabe ist ein dunkles Terminalfenster fuer Eltern und
    // bewusst nicht gethemt. Alles ausserhalb dieses Blocks muss aus dem Theme
    // kommen.
    const start = lines.findIndex((line) => line.trim().startsWith("diagBox:"));
    const end = lines.findIndex((line) => line.trim().startsWith("diagText:"));
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const outside = lines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(({ index }) => index < start || index > end)
      .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b/.test(line))
      .map(({ line, index }) => `settings.tsx:${index + 1} ${line}`);
    expect(outside).toEqual([]);
  });

  it("faerbt auch die Komponenten aus dem Theme", () => {
    // DebugOverlay ist ein Entwicklerwerkzeug mit fester dunkler Optik und
    // taucht im Kinder-UI nicht auf.
    const offenders: string[] = [];
    for (const file of tsxFiles(resolve(__dirname, "../components"))) {
      if (file.endsWith("DebugOverlay.tsx")) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const hex = line.match(/#[0-9a-fA-F]{3,8}\b/g);
          if (hex) offenders.push(`${file}:${index + 1} ${hex.join(",")}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
