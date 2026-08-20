// Bildebene der App (Anforderungen 8: "grosse Illustrationen, wenig Text" und
// 10: Bildwelten). Bis die gezeichneten Illustrationen vorliegen, ist jedes
// Bild ein Emoji - das braucht keine Assets, funktioniert offline und ist auf
// Android wie iOS gleich gross darstellbar.
//
// Die Tabelle haengt am arabischen Wort, nicht an einer Kategorie. So bekommt
// dasselbe Wort in jeder Liste dasselbe Bild (يَد steht in "Koerper" und in den
// kurzen Lesewoertern, بَاب ist Bildwort von ب und kurzes Lesewort).
// Propheten werden bewusst ueber ein Symbol ihrer Geschichte gezeigt, nicht
// ueber eine Figur.

import type { Word } from "./categories";

export const PICTURES: Record<string, string> = {
  // Zahlen
  "وَاحِد": "1️⃣",
  "اِثْنَان": "2️⃣",
  "ثَلَاثَة": "3️⃣",
  "أَرْبَعَة": "4️⃣",
  "خَمْسَة": "5️⃣",
  "سِتَّة": "6️⃣",
  "سَبْعَة": "7️⃣",
  "ثَمَانِيَة": "8️⃣",
  "تِسْعَة": "9️⃣",
  "عَشَرَة": "🔟",

  // Farben - ein farbiges Feld sagt mehr als ein Wort
  "أَحْمَر": "🟥",
  "أَزْرَق": "🟦",
  "أَخْضَر": "🟩",
  "أَصْفَر": "🟨",
  "أَبْيَض": "⬜",
  "أَسْوَد": "⬛",
  "وَرْدِي": "🩷",
  "بُنِّي": "🟫",

  // Tiere
  "قِطّ": "🐈",
  "كَلْب": "🐕",
  "حِصَان": "🐎",
  "بَقَرَة": "🐄",
  "دَجَاجَة": "🐔",
  "سَمَك": "🐟",
  "أَسَد": "🦁",
  "فِيل": "🐘",
  "أَرْنَب": "🐇",
  "جَمَل": "🐪",
  "حُوت": "🐋",
  "طَيْر": "🐦",
  "عُصْفُور": "🐦",
  "نَحْل": "🐝",
  "غَنَم": "🐑",
  "ضِفْدَع": "🐸",

  // Körper
  "رَأْس": "🙂",
  "يَد": "✋",
  "قَدَم": "🦶",
  "عَيْن": "👁️",
  "أُذُن": "👂",
  "أَنْف": "👃",
  "فَم": "👄",
  "قَلْب": "❤️",
  "دَم": "🩸",

  // Familie
  "أَب": "👨",
  "أُم": "👩",
  "أُمّ": "👩",
  "أَخ": "👦",
  "أُخْت": "👧",
  "جَدّ": "👴",
  "جَدَّة": "👵",
  "اِبْن": "🧑",
  "بِنْت": "🧒",
  "وَلَد": "👦",

  // Essen und Trinken
  "خُبْز": "🍞",
  "مَاء": "💧",
  "حَلِيب": "🥛",
  "لَبَن": "🥛",
  "تُفَّاحَة": "🍎",
  "مَوْز": "🍌",
  "جُبْن": "🧀",
  "بَيْض": "🥚",
  "عَسَل": "🍯",
  "عِنَب": "🍇",
  "رُمَّان": "🥭",
  "تِين": "🫐",
  "زَيْت": "🫗",
  "مِلْح": "🧂",
  "سُكَّر": "🍬",
  "طَعَام": "🍽️",
  "لَيْمُون": "🍋",

  // Propheten - Symbol aus der Geschichte, keine Figur
  "آدَم": "🌍",
  "نُوح": "🚢",
  "إِبْرَاهِيم": "🕋",
  "مُوسَى": "🌊",
  "عِيسَى": "🕊️",
  "مُحَمَّد": "🕌",
  "يُوسُف": "🌙",
  "دَاوُد": "📜",

  // Natur und Umgebung
  "جَبَل": "⛰️",
  "قَمَر": "🌙",
  "هِلَال": "🌙",
  "شَمْس": "☀️",
  "نُور": "💡",
  "بَحْر": "🌊",
  "نَهْر": "🏞️",
  "سَمَاء": "☁️",
  "غَيْم": "☁️",
  "أَرْض": "🌍",
  "رِيح": "🌬️",
  "مَطَر": "🌧️",
  "ثَلْج": "❄️",
  "نَار": "🔥",
  "زَهْرَة": "🌸",
  "وَرْدَة": "🌹",
  "نَجْمَة": "⭐",
  "ظِلّ": "⛱️",
  "ذَهَب": "🥇",

  // Haus, Schule, Gebet
  "بَيْت": "🏠",
  "بَاب": "🚪",
  "كِتَاب": "📖",
  "قَلَم": "✏️",
  "كُرْسِيّ": "🪑",
  "سَرِير": "🛏️",
  "مَسْجِد": "🕌",
  "صَلَاة": "🤲",
  "دُعَاء": "🤲",
};

// Wo es kein Bild gibt (Funktionswoerter wie "hal", "min", "inna"), bleibt es
// leer - der Aufrufer zeigt dann das Emoji seiner Kategorie oder Lernstufe.
export function pictureFor(ar: string): string | undefined {
  return PICTURES[ar];
}

// Setzt das Bild auf eine Wortliste, ohne bereits gesetzte Bilder zu ueberschreiben.
export function withPictures(words: Word[]): Word[] {
  return words.map((word) => (word.pic ? word : { ...word, pic: pictureFor(word.ar) }));
}
