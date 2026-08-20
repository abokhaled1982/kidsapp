// Level 5 - "Buchstabenwelt und Lautdetektive" (docs/mobile-kinder-app-anforderungen.md, 5.1)
// Die 28 arabischen Buchstaben mit Name, Form, Punktmuster, Mundbild-Hinweis und
// einem Bildwort. Die Positionsformen werden aus dem Grundbuchstaben und dem
// Tatweel gebildet - das ist die Schreibweise, die auch Qaida-Buecher nutzen.

export type LetterFamilyId =
  | "alif"
  | "ba"
  | "jim"
  | "dal"
  | "ra"
  | "sin"
  | "sad"
  | "ta"
  | "ayn"
  | "fa"
  | "single";

export type DotPattern = {
  count: 0 | 1 | 2 | 3;
  position: "above" | "below" | "none";
};

export type LetterForms = {
  isolated: string;
  // null = der Buchstabe verbindet nicht nach links, es gibt also keine
  // Anfangs- und keine Mittelform (ا د ذ ر ز و).
  initial: string | null;
  medial: string | null;
  final: string;
};

export type Letter = {
  id: string;
  ar: string;
  name_ar: string;
  translit: string;
  sound: string;
  hint: string;
  dots: DotPattern;
  connects: boolean;
  family: LetterFamilyId;
  forms: LetterForms;
  example: { ar: string; de: string; translit: string };
  // Schreibvarianten desselben Buchstaben (Hamza-Traeger bei Alif).
  variants?: string[];
};

const TATWEEL = "ـ";

const NO_DOTS: DotPattern = { count: 0, position: "none" };
const dotsAbove = (count: 1 | 2 | 3): DotPattern => ({ count, position: "above" });
const dotsBelow = (count: 1 | 2 | 3): DotPattern => ({ count, position: "below" });

function formsFor(ar: string, connects: boolean): LetterForms {
  return {
    isolated: ar,
    initial: connects ? `${ar}${TATWEEL}` : null,
    medial: connects ? `${TATWEEL}${ar}${TATWEEL}` : null,
    final: `${TATWEEL}${ar}`,
  };
}

const RAW: Omit<Letter, "forms">[] = [
  {
    id: "alif", ar: "ا", name_ar: "أَلِف", translit: "alif", sound: "ā",
    hint: "Mund weit auf und ein langes aaa halten.",
    dots: NO_DOTS, connects: false, family: "alif",
    example: { ar: "أَسَد", de: "Löwe", translit: "asad" },
    variants: ["أ", "إ", "آ", "ٱ"],
  },
  {
    id: "ba", ar: "ب", name_ar: "بَاء", translit: "bāʾ", sound: "b",
    hint: "Lippen kurz schließen und dann öffnen: b.",
    dots: dotsBelow(1), connects: true, family: "ba",
    example: { ar: "بَاب", de: "Tür", translit: "bāb" },
  },
  {
    id: "ta", ar: "ت", name_ar: "تَاء", translit: "tāʾ", sound: "t",
    hint: "Zungenspitze hinter die oberen Zähne: helles t.",
    dots: dotsAbove(2), connects: true, family: "ba",
    example: { ar: "تُفَّاحَة", de: "Apfel", translit: "tuffāḥa" },
  },
  {
    id: "tha", ar: "ث", name_ar: "ثَاء", translit: "thāʾ", sound: "ṯ",
    hint: "Zungenspitze zwischen die Zähne, wie englisch think.",
    dots: dotsAbove(3), connects: true, family: "ba",
    example: { ar: "ثَلَاثَة", de: "drei", translit: "thalātha" },
  },
  {
    id: "jim", ar: "ج", name_ar: "جِيم", translit: "jīm", sound: "j",
    hint: "Wie dsch in Dschungel.",
    dots: dotsBelow(1), connects: true, family: "jim",
    example: { ar: "جَمَل", de: "Kamel", translit: "jamal" },
  },
  {
    id: "ha", ar: "ح", name_ar: "حَاء", translit: "ḥāʾ", sound: "ḥ",
    hint: "Warmer Hauch tief aus der Kehle, wie beim Anhauchen einer Brille.",
    dots: NO_DOTS, connects: true, family: "jim",
    example: { ar: "حَلِيب", de: "Milch", translit: "ḥalīb" },
  },
  {
    id: "kha", ar: "خ", name_ar: "خَاء", translit: "khāʾ", sound: "ḵ",
    hint: "Wie ch in Bach.",
    dots: dotsAbove(1), connects: true, family: "jim",
    example: { ar: "خُبْز", de: "Brot", translit: "khubz" },
  },
  {
    id: "dal", ar: "د", name_ar: "دَال", translit: "dāl", sound: "d",
    hint: "Zungenspitze an die oberen Zähne: helles d.",
    dots: NO_DOTS, connects: false, family: "dal",
    example: { ar: "دَجَاجَة", de: "Huhn", translit: "dajāja" },
  },
  {
    id: "dhal", ar: "ذ", name_ar: "ذَال", translit: "dhāl", sound: "ḏ",
    hint: "Zunge zwischen die Zähne und summen, wie englisch this.",
    dots: dotsAbove(1), connects: false, family: "dal",
    example: { ar: "ذَهَب", de: "Gold", translit: "dhahab" },
  },
  {
    id: "ra", ar: "ر", name_ar: "رَاء", translit: "rāʾ", sound: "r",
    hint: "Zungenspitze vorne kurz rollen.",
    dots: NO_DOTS, connects: false, family: "ra",
    example: { ar: "رَأْس", de: "Kopf", translit: "raʾs" },
  },
  {
    id: "zay", ar: "ز", name_ar: "زَاي", translit: "zāy", sound: "z",
    hint: "Summendes s wie in Rose.",
    dots: dotsAbove(1), connects: false, family: "ra",
    example: { ar: "زَهْرَة", de: "Blume", translit: "zahra" },
  },
  {
    id: "sin", ar: "س", name_ar: "سِين", translit: "sīn", sound: "s",
    hint: "Helles, feines s wie in Sonne.",
    dots: NO_DOTS, connects: true, family: "sin",
    example: { ar: "سَمَك", de: "Fisch", translit: "samak" },
  },
  {
    id: "shin", ar: "ش", name_ar: "شِين", translit: "shīn", sound: "š",
    hint: "Wie sch in Schule.",
    dots: dotsAbove(3), connects: true, family: "sin",
    example: { ar: "شَمْس", de: "Sonne", translit: "shams" },
  },
  {
    id: "sad", ar: "ص", name_ar: "صَاد", translit: "ṣād", sound: "ṣ",
    hint: "Dunkles, dickes s. Der Mund wird runder.",
    dots: NO_DOTS, connects: true, family: "sad",
    example: { ar: "صَلَاة", de: "Gebet", translit: "ṣalāh" },
  },
  {
    id: "dad", ar: "ض", name_ar: "ضَاد", translit: "ḍād", sound: "ḍ",
    hint: "Dunkles d, die Zunge liegt breit an den Backenzähnen.",
    dots: dotsAbove(1), connects: true, family: "sad",
    example: { ar: "ضِفْدَع", de: "Frosch", translit: "ḍifdaʿ" },
  },
  {
    id: "ta_emph", ar: "ط", name_ar: "طَاء", translit: "ṭāʾ", sound: "ṭ",
    hint: "Kräftiges, dunkles t. Die Zunge drückt fest nach oben.",
    dots: NO_DOTS, connects: true, family: "ta",
    example: { ar: "طَعَام", de: "Essen", translit: "ṭaʿām" },
  },
  {
    id: "za_emph", ar: "ظ", name_ar: "ظَاء", translit: "ẓāʾ", sound: "ẓ",
    hint: "Dunkles th: Zunge zwischen den Zähnen, Ton tief halten.",
    dots: dotsAbove(1), connects: true, family: "ta",
    example: { ar: "ظِلّ", de: "Schatten", translit: "ẓill" },
  },
  {
    id: "ayn", ar: "ع", name_ar: "عَيْن", translit: "ʿayn", sound: "ʿ",
    hint: "Tief aus der Kehle drücken, als würdest du leicht pressen.",
    dots: NO_DOTS, connects: true, family: "ayn",
    example: { ar: "عَيْن", de: "Auge", translit: "ʿayn" },
  },
  {
    id: "ghayn", ar: "غ", name_ar: "غَيْن", translit: "ghayn", sound: "ġ",
    hint: "Gurgelndes r hinten im Hals.",
    dots: dotsAbove(1), connects: true, family: "ayn",
    example: { ar: "غَيْم", de: "Wolke", translit: "ghaym" },
  },
  {
    id: "fa", ar: "ف", name_ar: "فَاء", translit: "fāʾ", sound: "f",
    hint: "Obere Zähne auf die Unterlippe: f.",
    dots: dotsAbove(1), connects: true, family: "fa",
    example: { ar: "فِيل", de: "Elefant", translit: "fīl" },
  },
  {
    id: "qaf", ar: "ق", name_ar: "قَاف", translit: "qāf", sound: "q",
    hint: "Ganz hinten am Gaumen, ein hartes k.",
    dots: dotsAbove(2), connects: true, family: "fa",
    example: { ar: "قِطّ", de: "Katze", translit: "qiṭṭ" },
  },
  {
    id: "kaf", ar: "ك", name_ar: "كَاف", translit: "kāf", sound: "k",
    hint: "Vorne am Gaumen, wie k in Kind.",
    dots: NO_DOTS, connects: true, family: "single",
    example: { ar: "كَلْب", de: "Hund", translit: "kalb" },
  },
  {
    id: "lam", ar: "ل", name_ar: "لَام", translit: "lām", sound: "l",
    hint: "Zungenspitze an den Zahndamm: l.",
    dots: NO_DOTS, connects: true, family: "single",
    example: { ar: "لَيْمُون", de: "Zitrone", translit: "laymūn" },
  },
  {
    id: "mim", ar: "م", name_ar: "مِيم", translit: "mīm", sound: "m",
    hint: "Lippen zu und summen: mmm.",
    dots: NO_DOTS, connects: true, family: "single",
    example: { ar: "مَاء", de: "Wasser", translit: "māʾ" },
  },
  {
    id: "nun", ar: "ن", name_ar: "نُون", translit: "nūn", sound: "n",
    hint: "Zungenspitze oben, der Ton geht durch die Nase: nnn.",
    dots: dotsAbove(1), connects: true, family: "single",
    example: { ar: "نَجْمَة", de: "Stern", translit: "najma" },
  },
  {
    id: "ha_soft", ar: "ه", name_ar: "هَاء", translit: "hāʾ", sound: "h",
    hint: "Leiser Hauch vorne im Mund, wie h in Hand.",
    dots: NO_DOTS, connects: true, family: "single",
    example: { ar: "هِلَال", de: "Mondsichel", translit: "hilāl" },
  },
  {
    id: "waw", ar: "و", name_ar: "وَاو", translit: "wāw", sound: "w",
    hint: "Lippen runden, wie w in englisch water.",
    dots: NO_DOTS, connects: false, family: "single",
    example: { ar: "وَرْدَة", de: "Rose", translit: "warda" },
  },
  {
    id: "ya", ar: "ي", name_ar: "يَاء", translit: "yāʾ", sound: "y",
    hint: "Wie j in Jahr.",
    dots: dotsBelow(2), connects: true, family: "single",
    example: { ar: "يَد", de: "Hand", translit: "yad" },
  },
];

export const LETTERS: Letter[] = RAW.map((letter) => ({
  ...letter,
  forms: formsFor(letter.ar, letter.connects),
}));

export const LETTERS_BY_ID: Record<string, Letter> = Object.fromEntries(
  LETTERS.map((letter) => [letter.id, letter]),
);

export function letterByChar(ar: string): Letter | undefined {
  return LETTERS.find((letter) => letter.ar === ar);
}

// Formfamilien: gleiches Grundgeruest, unterschiedliche Punkte. Genau die
// Gruppierung aus der Anforderung (5.1, "Formfamilien").
export type LetterFamily = {
  id: LetterFamilyId;
  title: string;
  letters: string[];
  detail: string;
};

export const LETTER_FAMILIES: LetterFamily[] = [
  { id: "alif", title: "Alif steht allein", letters: ["ا"], detail: "Ein gerader Strich ohne Punkte. Verbindet nie nach links." },
  { id: "ba", title: "Die Schüssel", letters: ["ب", "ت", "ث"], detail: "Gleiche Schüssel, nur die Punkte sind anders: 1 unten, 2 oben, 3 oben." },
  { id: "jim", title: "Der Bauch mit Haken", letters: ["ج", "ح", "خ"], detail: "Gleiche Form: 1 Punkt innen, kein Punkt, 1 Punkt oben." },
  { id: "dal", title: "Der Winkel", letters: ["د", "ذ"], detail: "Ohne Punkt und mit einem Punkt oben. Beide verbinden nicht nach links." },
  { id: "ra", title: "Der Bogen", letters: ["ر", "ز"], detail: "Ohne Punkt und mit einem Punkt oben. Beide verbinden nicht nach links." },
  { id: "sin", title: "Die Zähne", letters: ["س", "ش"], detail: "Drei Zacken. Mit drei Punkten oben wird س zu ش." },
  { id: "sad", title: "Das Auge mit Schwanz", letters: ["ص", "ض"], detail: "Gleiche Form, ض hat einen Punkt oben. Beide klingen dunkel." },
  { id: "ta", title: "Der Ring mit Strich", letters: ["ط", "ظ"], detail: "Gleiche Form, ظ hat einen Punkt oben. Beide klingen dunkel." },
  { id: "ayn", title: "Das offene Ohr", letters: ["ع", "غ"], detail: "Gleiche Form, غ hat einen Punkt oben." },
  { id: "fa", title: "Die Schlaufe", letters: ["ف", "ق"], detail: "ف hat 1 Punkt oben, ق hat 2 Punkte oben." },
  {
    id: "single",
    title: "Eigene Formen",
    letters: ["ك", "ل", "م", "ن", "ه", "و", "ي"],
    detail: "Diese Buchstaben haben jeweils ihre eigene Form und keine Zwillinge.",
  },
];

// Zeichen, die zwar unterrichtet werden, aber nicht zu den 28 Buchstaben
// gehoeren. Sie tauchen in Hoerpaaren und beim Lesen auf.
export type ExtraSign = {
  id: string;
  ar: string;
  name_ar: string;
  translit: string;
  detail: string;
};

export const EXTRA_SIGNS: ExtraSign[] = [
  { id: "hamza", ar: "ء", name_ar: "هَمْزَة", translit: "hamza", detail: "Kurzer Stopp im Hals, wie die kleine Pause in „be-achten“." },
  { id: "ta_marbuta", ar: "ة", name_ar: "تَاء مَرْبُوطَة", translit: "tāʾ marbūṭa", detail: "Steht am Wortende. Beim Anhalten klingt sie wie ein leises h." },
  { id: "alif_maqsura", ar: "ى", name_ar: "أَلِف مَقْصُورَة", translit: "alif maqṣūra", detail: "Sieht aus wie ي ohne Punkte, klingt aber wie ein langes a." },
  { id: "lam_alif", ar: "لا", name_ar: "لَام أَلِف", translit: "lām alif", detail: "Die feste Verbindung von ل und ا: ein eigenes Schriftbild." },
];

// Aehnliche Laute (5.1 "aehnliche Laute hoeren" und 5.4 "haeufige
// Buchstabenverwechslungen"). level = wann das Paar zuerst geuebt wird.
export type SoundPair = {
  id: string;
  a: string;
  b: string;
  title: string;
  hint: string;
  listenFor: string;
  level: 5 | 8;
};

export const SOUND_PAIRS: SoundPair[] = [
  {
    id: "sin-sad", a: "س", b: "ص", title: "س oder ص?",
    hint: "س ist hell und fein, ص ist dunkel und dick.",
    listenFor: "Bei ص wird der Mund runder und der Ton tiefer.",
    level: 5,
  },
  {
    id: "ta-ta_emph", a: "ت", b: "ط", title: "ت oder ط?",
    hint: "ت ist leicht und hell, ط ist kräftig und dunkel.",
    listenFor: "ط drückt die Zunge fest nach oben.",
    level: 5,
  },
  {
    id: "dal-dad", a: "د", b: "ض", title: "د oder ض?",
    hint: "د ist ein helles d, ض ist breit und dunkel.",
    listenFor: "Bei ض liegt die Zunge an den Backenzähnen.",
    level: 5,
  },
  {
    id: "ha-ha_soft", a: "ح", b: "ه", title: "ح oder ه?",
    hint: "ح kommt tief aus der Kehle, ه ist ein leiser Hauch vorne.",
    listenFor: "ح fühlt sich warm und eng an, ه ganz leicht.",
    level: 5,
  },
  {
    id: "ayn-hamza", a: "ع", b: "ء", title: "ع oder ء?",
    hint: "ع wird gepresst gehalten, ء ist nur ein kurzer Stopp.",
    listenFor: "ء stoppt sofort, ع klingt weiter.",
    level: 5,
  },
  {
    id: "qaf-kaf", a: "ق", b: "ك", title: "ق oder ك?",
    hint: "ق sitzt ganz hinten, ك weiter vorne am Gaumen.",
    listenFor: "ق klingt tiefer und schwerer als ك.",
    level: 5,
  },
  {
    id: "fa-tha", a: "ف", b: "ث", title: "ف oder ث?",
    hint: "ف mit Zähnen auf der Lippe, ث mit der Zunge zwischen den Zähnen.",
    listenFor: "Schau auf den Mund: Lippe oder Zunge?",
    level: 5,
  },
  {
    id: "dhal-zay", a: "ذ", b: "ز", title: "ذ oder ز?",
    hint: "ذ mit der Zunge zwischen den Zähnen, ز summt hinter den Zähnen.",
    listenFor: "ز zischt, ذ ist weicher.",
    level: 8,
  },
  {
    id: "tha-sin", a: "ث", b: "س", title: "ث oder س?",
    hint: "ث liegt zwischen den Zähnen, س bleibt dahinter.",
    listenFor: "س pfeift ein wenig, ث nicht.",
    level: 8,
  },
];
