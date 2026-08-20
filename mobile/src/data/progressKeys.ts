// Schluessel im Progress-Store. Liegen bewusst in der Datenschicht, damit
// Datenmodule (Wortquellen) und Store-Selektoren dieselben Namen benutzen.
// Die beiden bestehenden Konventionen bleiben unveraendert:
//   Kategoriewort  ->  `${categoryId}:${ar}`
//   Quranwort      ->  `quran:${surah}:${ayah}:${ar}`

export const letterKey = (id: string) => `letter:${id}`;
export const letterFormKey = (id: string) => `form:${id}`;
export const soundPairKey = (id: string) => `pair:${id}`;
export const harakaKey = (id: string) => `haraka:${id}`;
export const syllableKey = (ar: string) => `syl:${ar}`;
export const maddKey = (ar: string) => `madd:${ar}`;
export const shortWordKey = (ar: string) => `word:${ar}`;
export const coreWordKey = (ar: string) => `core:${ar}`;
export const tajweedKey = (id: string) => `tajweed:${id}`;
export const wordKey = (categoryId: string, ar: string) => `${categoryId}:${ar}`;
export const quranWordKey = (surah: number, ayah: number, ar: string) =>
  `quran:${surah}:${ayah}:${ar}`;
export const surahKey = (surah: number) => `surah:${surah}`;
export const ayahKey = (surah: number, ayah: number) => `ayah:${surah}:${ayah}`;
