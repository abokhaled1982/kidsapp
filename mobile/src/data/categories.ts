export type Word = {
  ar: string;
  de: string;
  translit?: string;
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
  title: string;
  arabic: string;
  emoji: string;
  color: string;
  fg: string;
};

export const CATEGORIES: Category[] = [
  { id: "zahlen",    title: "Zahlen",    arabic: "الأَرْقَام",    emoji: "🔢", color: "#3b82f6", fg: "#ffffff" },
  { id: "farben",    title: "Farben",    arabic: "الأَلْوَان",    emoji: "🎨", color: "#f59e0b", fg: "#ffffff" },
  { id: "tiere",     title: "Tiere",     arabic: "الحَيَوَانَات", emoji: "🦁", color: "#22c55e", fg: "#ffffff" },
  { id: "koerper",   title: "Körper",    arabic: "الجِسْم",        emoji: "🖐️", color: "#ec4899", fg: "#ffffff" },
  { id: "familie",   title: "Familie",   arabic: "العَائِلَة",     emoji: "👨‍👩‍👧", color: "#a855f7", fg: "#ffffff" },
  { id: "essen",     title: "Essen",     arabic: "الطَّعَام",       emoji: "🍎", color: "#ef4444", fg: "#ffffff" },
  { id: "propheten", title: "Propheten", arabic: "الأَنْبِيَاء",   emoji: "🕌", color: "#059669", fg: "#ffffff" },
];
