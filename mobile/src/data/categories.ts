export type Word = {
  ar: string;      // vokalisiert, zur Anzeige
  de: string;      // deutsche Übersetzung
  translit?: string; // optionale Umschrift
};

export type CategoryId =
  | "zahlen"
  | "farben"
  | "tiere"
  | "koerper"
  | "familie"
  | "essen"
  | "propheten";

export type Category = {
  id: CategoryId;
  title: string;      // deutsch
  arabic: string;     // arabischer Kategoriename
  emoji: string;
  bg: string;         // Tailwind bg-Klasse für die Kachel
  fg: string;         // Tailwind text-Klasse
};

export const CATEGORIES: Category[] = [
  { id: "zahlen",    title: "Zahlen",   arabic: "الأَرْقَام",  emoji: "🔢", bg: "bg-brand-500",  fg: "text-white" },
  { id: "farben",    title: "Farben",   arabic: "الأَلْوَان",  emoji: "🎨", bg: "bg-accent-500", fg: "text-white" },
  { id: "tiere",     title: "Tiere",    arabic: "الحَيَوَانَات", emoji: "🦁", bg: "bg-good-500",   fg: "text-white" },
  { id: "koerper",   title: "Körper",   arabic: "الجِسْم",     emoji: "🖐️", bg: "bg-pink-500",   fg: "text-white" },
  { id: "familie",   title: "Familie",  arabic: "العَائِلَة",   emoji: "👨‍👩‍👧", bg: "bg-purple-500", fg: "text-white" },
  { id: "essen",     title: "Essen",    arabic: "الطَّعَام",    emoji: "🍎", bg: "bg-red-500",    fg: "text-white" },
  { id: "propheten", title: "Propheten",arabic: "الأَنْبِيَاء",  emoji: "🕌", bg: "bg-emerald-600",fg: "text-white" },
];
