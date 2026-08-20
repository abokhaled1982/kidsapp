// Kleine Utility, die von api.ts UND stream.ts gemeinsam gebraucht wird.
// Ausgelagert, damit kein Runtime-Require-Cycle zwischen den beiden entsteht.
//
// Primaerpfad: expo-file-system v19 - File(uri).arrayBuffer() ist auf iOS UND
// Android robust. XHR gegen file:// scheitert auf Android (SDK 54 + Expo Go)
// mit onerror -> "Audio-Lesefehler." und war die Ursache fuer den Bug.
// XHR bleibt nur als letzter Fallback (z.B. remote https:// URIs).

import { File } from "expo-file-system";
import { ASR_SAMPLE_RATE, encodeWav16, normalizeLevel, parseWav } from "@/lib/pcm";

/** Aufnahme, fertig fuer den Upload - plus was auf dem Geraet damit passiert ist. */
export type UploadAudio = {
  bytes: ArrayBuffer;
  /** 16-kHz-PCM-WAV: der Server liest das ohne Codec und ohne Umrechnung. */
  wav16: boolean;
  /** Ob der Pegel hier schon angeglichen wurde. */
  normalized: boolean;
  /** Zeit fuer die Aufbereitung auf dem Geraet (ohne das Lesen der Datei). */
  prepare_ms: number;
};

/**
 * Aufnahme lesen und fuer den Upload aufbereiten.
 *
 * Ist es ein PCM-WAV, wird der Pegel hier angeglichen (dieselbe Rechnung wie
 * _normalize_level im Backend) und als 16-bit-mono-WAV neu geschrieben - der
 * Server kann die Bytes dann direkt lesen, statt erst einen Codec zu starten.
 *
 * Alles andere - vor allem m4a/AAC von Android, wo MediaRecorder kein WAV
 * ausgeben kann - geht Byte fuer Byte unveraendert durch. Der Server dekodiert
 * es wie bisher; kein stiller Datenverlust, keine Regression fuer alte
 * App-Versionen im Feld.
 */
export async function readUriForUpload(uri: string): Promise<UploadAudio> {
  const raw = await readUriAsArrayBuffer(uri);
  const t0 = Date.now();
  const pcm = parseWav(raw);
  if (!pcm || pcm.samples.length === 0) {
    return { bytes: raw, wav16: false, normalized: false, prepare_ms: Date.now() - t0 };
  }
  const bytes = encodeWav16(normalizeLevel(pcm.samples), pcm.sampleRate);
  return {
    bytes,
    wav16: pcm.sampleRate === ASR_SAMPLE_RATE,
    normalized: true,
    prepare_ms: Date.now() - t0,
  };
}

export async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  try {
    const buf = await new File(uri).arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch {
    // fallthrough zu XHR-Fallback
  }
  return await xhrArrayBuffer(uri);
}

function xhrArrayBuffer(uri: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", uri, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        resolve(xhr.response as ArrayBuffer);
      } else {
        reject(new Error(`Konnte Audio nicht lesen (status ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Audio-Lesefehler."));
    xhr.send();
  });
}
