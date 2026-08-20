// Rohton auf dem Geraet: WAV lesen, Lautstaerke angleichen, WAV schreiben.
//
// Warum das hier und nicht im Backend:
// Der Server bekam bisher AAC/m4a und musste es dekodieren und auf 16 kHz
// umrechnen, bevor das Sprachmodell ueberhaupt anfangen konnte. Beides kostet
// Zeit pro Aufnahme - Zeit, in der das Kind auf die Rueckmeldung wartet.
// Nimmt das Geraet gleich 16 kHz, mono, 16 bit auf, liest der Server die Datei
// direkt (siehe read_wav_pcm16 in backend/asr_app.py).
//
// Die Lautstaerke-Angleichung ist absichtlich Zeichen fuer Zeichen dieselbe
// Rechnung wie _normalize_level im Backend, mit denselben Konstanten. Die
// Bewertung ist auf -20 dBFS kalibriert; ein anderer Zielwert hier wuerde alle
// Punktzahlen verschieben, ohne dass jemand die Aussprache geaendert haette.
//
// Kein React, keine Expo-Abhaengigkeit - damit im Test direkt pruefbar.

/** Native Rate des Sprachmodells (wav2vec2). */
export const ASR_SAMPLE_RATE = 16000;
/** Zielpegel, identisch zu _normalize_level im Backend. */
export const TARGET_DBFS = -20.0;
/** Ab hier wird heruntergezogen, damit nichts uebersteuert. */
export const PEAK_CEILING = 0.99;
/** Unter diesem Effektivwert gilt die Aufnahme als Stille. */
export const SILENCE_RMS = 1e-6;

const WAV_HEADER_BYTES = 44;
const PCM_FORMAT = 1;

export type Pcm = {
  /** Werte zwischen -1.0 und 1.0, mono. */
  samples: Float32Array;
  sampleRate: number;
};

/** Effektivwert (RMS) einer Aufnahme. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Pegel auf `targetDbfs` ziehen - 1:1 die Rechnung aus _normalize_level.
 *
 * Stille bleibt Stille (sonst wuerde Rauschen auf Sprechlautstaerke verstaerkt),
 * und ueber PEAK_CEILING wird gleichmaessig heruntergezogen statt geclippt.
 */
export function normalizeLevel(samples: Float32Array, targetDbfs = TARGET_DBFS): Float32Array {
  const level = rms(samples);
  // Auch die leere Aufnahme laeuft hier heraus - ohne Werte gibt es nichts anzugleichen.
  if (!(level >= SILENCE_RMS)) return samples;

  const gain = Math.pow(10, (targetDbfs - 20 * Math.log10(level)) / 20);
  const out = new Float32Array(samples.length);
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i] * gain;
    out[i] = value;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
  }
  if (peak > PEAK_CEILING) {
    const shrink = PEAK_CEILING / peak;
    for (let i = 0; i < out.length; i += 1) out[i] *= shrink;
  }
  return out;
}

/** Float-Werte zu 16-bit-Ganzzahlen, mit Begrenzung an den Raendern. */
export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetrisch wie int16 selbst: -32768 .. 32767.
    out[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }
  return out;
}

/** Gegenrichtung zu floatToInt16 - dieselbe Skala wie im Backend (/32768). */
export function int16ToFloat(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] / 32768;
  return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

/**
 * WAV-Container um die Werte legen: 44 Byte Kopf, danach die Rohdaten.
 * Mono, 16 bit, ohne zusaetzliche Chunks - genau das, was der Server erwartet.
 */
export function encodeWav16(samples: Float32Array, sampleRate = ASR_SAMPLE_RATE): ArrayBuffer {
  const pcm = floatToInt16(samples);
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);     // alles nach diesem Feld
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);                // Laenge des fmt-Blocks
  view.setUint16(20, PCM_FORMAT, true);        // 1 = unkomprimiertes PCM
  view.setUint16(22, 1, true);                 // Kanaele: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);    // Bytes pro Sekunde
  view.setUint16(32, 2, true);                 // Bytes pro Rahmen
  view.setUint16(34, 16, true);                // Bits pro Wert
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(WAV_HEADER_BYTES + i * 2, pcm[i], true);
  }
  return buffer;
}

/**
 * 16-bit-PCM-WAV lesen. Mehrkanaliges wird zu mono gemischt.
 *
 * null heisst "kein WAV oder ein Format, das hier nicht behandelt wird" - dann
 * bleiben die Bytes unangetastet und der Server dekodiert wie bisher. Die
 * Chunks werden durchgelaufen statt auf 44 Byte Kopf zu vertrauen: iOS haengt
 * gern noch einen LIST-Block dazwischen.
 */
export function parseWav(buffer: ArrayBuffer): Pcm | null {
  if (buffer.byteLength < WAV_HEADER_BYTES) return null;
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") return null;

  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let format = 0;
  let dataStart = -1;
  let dataBytes = 0;

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= buffer.byteLength) {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      dataStart = body;
      dataBytes = Math.min(size, buffer.byteLength - body);
    }
    // Chunks stehen auf geraden Grenzen; ungerade Laengen haben ein Fuellbyte.
    offset = body + size + (size % 2);
  }

  if (format !== PCM_FORMAT || bits !== 16 || channels < 1 || sampleRate < 1) return null;
  if (dataStart < 0 || dataBytes < 2) return null;

  const frames = Math.floor(dataBytes / 2 / channels);
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += view.getInt16(dataStart + (frame * channels + channel) * 2, true);
    }
    samples[frame] = sum / channels / 32768;
  }
  return { samples, sampleRate };
}

/** Ist das schon genau das Format, das der Server ohne Umrechnung liest? */
export function isAsrReadyWav(buffer: ArrayBuffer): boolean {
  const pcm = parseWav(buffer);
  return pcm !== null && pcm.sampleRate === ASR_SAMPLE_RATE && pcm.samples.length > 0;
}

/**
 * Aufnahme fuer den Upload vorbereiten: WAV wird auf Zielpegel gebracht und
 * als mono-WAV neu geschrieben. Alles andere (m4a von aelteren Android-Geraeten)
 * geht unveraendert durch - der Server kann es weiterhin dekodieren.
 */
export function normalizeWavBytes(buffer: ArrayBuffer): ArrayBuffer {
  const pcm = parseWav(buffer);
  if (!pcm || pcm.samples.length === 0) return buffer;
  return encodeWav16(normalizeLevel(pcm.samples), pcm.sampleRate);
}
