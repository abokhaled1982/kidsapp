// Unit-Tests fuer die Tonaufbereitung auf dem Geraet.
//
// Der Punkt dieser Datei: die Lautstaerke-Angleichung im Client muss dieselben
// Zahlen liefern wie _normalize_level im Backend (backend/asr_app.py:272).
// Wandert die Angleichung auf das Geraet und rechnet dort auch nur minimal
// anders, verschieben sich alle Punktzahlen - ein Kind bekaeme fuer dieselbe
// Aussprache eine andere Bewertung als vorher.
//
// Die Erwartungswerte unten sind deshalb keine selbst gewaehlten Zahlen,
// sondern die Ausgabe des Backends fuer dieselbe Eingabe, mit numpy in float32
// gerechnet. Wer sie aendert, aendert die Kalibrierung der Bewertung.

import { describe, expect, it } from "vitest";
import {
  ASR_SAMPLE_RATE,
  PEAK_CEILING,
  TARGET_DBFS,
  encodeWav16,
  floatToInt16,
  int16ToFloat,
  isAsrReadyWav,
  normalizeLevel,
  normalizeWavBytes,
  parseWav,
  rms,
} from "./pcm";

const f32 = (values: number[]) => new Float32Array(values);
const peak = (samples: Float32Array) => Math.max(...Array.from(samples, Math.abs));

/** Zielpegel -20 dBFS heisst genau: Effektivwert 0.1. */
const TARGET_RMS = 0.1;

function expectClose(got: Float32Array, want: number[], places = 6) {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i += 1) {
    expect(got[i], `Wert ${i}`).toBeCloseTo(want[i], places);
  }
}

/** Ein WAV von Hand bauen - so, wie ein Geraet es liefern koennte. */
function wavBytes(
  frames: number[],
  { sampleRate = ASR_SAMPLE_RATE, channels = 1, bits = 16, format = 1 } = {},
): ArrayBuffer {
  const bytesPerSample = bits / 8;
  const dataBytes = frames.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bits, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  frames.forEach((value, i) => {
    if (bits === 16) view.setInt16(44 + i * 2, value, true);
    else view.setUint8(44 + i, value & 0xff);
  });
  return buffer;
}

describe("normalizeLevel gegen das Backend", () => {
  it("hebt eine leise Aufnahme auf genau die Werte des Backends", () => {
    // numpy: _normalize_level([0.01,-0.02,0.03,-0.04,0.05])
    const got = normalizeLevel(f32([0.01, -0.02, 0.03, -0.04, 0.05]));
    expectClose(got, [0.03015113, -0.06030226, 0.0904534, -0.12060453, 0.15075567]);
    expect(rms(got)).toBeCloseTo(TARGET_RMS, 6);
  });

  it("senkt eine laute Aufnahme auf genau die Werte des Backends", () => {
    // numpy: _normalize_level([0.9,-0.95,0.99,-1.0,0.8])
    const got = normalizeLevel(f32([0.9, -0.95, 0.99, -1.0, 0.8]));
    expectClose(got, [0.09668369, -0.10205501, 0.10635206, -0.10742632, 0.08594106]);
    expect(rms(got)).toBeCloseTo(TARGET_RMS, 6);
  });

  it("laesst Stille Stille und verstaerkt kein Rauschen", () => {
    // Ohne diese Schwelle wuerde Zimmerrauschen auf Sprechlautstaerke gezogen
    // und das Modell bekaeme Rauschen als Sprache vorgesetzt.
    const still = f32([0, 0, 0]);
    expect(Array.from(normalizeLevel(still))).toEqual([0, 0, 0]);
    const fastNull = f32([1e-7, -1e-7, 1e-7]);
    expectClose(normalizeLevel(fastNull), [1e-7, -1e-7, 1e-7], 12);
  });

  it("zieht ueber der Grenze herunter statt zu uebersteuern", () => {
    // Eine einzelne Spitze in ansonsten stiller Aufnahme: der Effektivwert
    // liegt schon auf dem Ziel, die Spitze aber bei 1.0.
    const spike = f32([1, ...new Array(99).fill(0)]);
    const got = normalizeLevel(spike);
    expect(got[0]).toBeCloseTo(PEAK_CEILING, 6);
    // float32 speichert 0.99 als 0.99000000953 - dieselbe Rundung wie numpy im Backend.
    expect(peak(got)).toBeLessThanOrEqual(PEAK_CEILING + 1e-6);
    // Der Pegel liegt danach leicht unter dem Ziel - genau das tut das Backend auch.
    expect(rms(got)).toBeCloseTo(0.099, 6);
  });

  it("behandelt eine echte Wellenform wie das Backend", () => {
    // 220 Hz, leise aufgenommen - der Normalfall bei einem Kind, das nicht
    // direkt ins Mikrofon spricht.
    const sine = new Float32Array(400);
    for (let i = 0; i < sine.length; i += 1) {
      sine[i] = 0.05 * Math.sin((2 * Math.PI * 220 * i) / ASR_SAMPLE_RATE);
    }
    const got = normalizeLevel(sine);
    expectClose(got.slice(0, 5), [0.0, 0.01220274, 0.02431445, 0.03624479, 0.04790478]);
    expect(rms(got)).toBeCloseTo(TARGET_RMS, 6);
    expect(peak(got)).toBeCloseTo(0.14142136, 6);
  });

  it("haelt die Konstanten fest, auf die die Bewertung kalibriert ist", () => {
    expect(TARGET_DBFS).toBe(-20.0);
    expect(PEAK_CEILING).toBe(0.99);
    expect(ASR_SAMPLE_RATE).toBe(16000);
  });

  it("bringt jeden Ausgangspegel auf denselben Zielpegel", () => {
    for (const scale of [0.002, 0.02, 0.2, 0.7]) {
      const noisy = new Float32Array(500);
      for (let i = 0; i < noisy.length; i += 1) {
        noisy[i] = scale * Math.sin(i * 0.37) * (1 + 0.3 * Math.cos(i * 0.11));
      }
      expect(rms(normalizeLevel(noisy)), `Pegel ${scale}`).toBeCloseTo(TARGET_RMS, 5);
    }
  });
});

describe("int16-Umwandlung", () => {
  it("nutzt dieselbe Skala wie der Server (/32768)", () => {
    expectClose(int16ToFloat(new Int16Array([0, 16384, -16384, 32767, -32768])),
      [0, 0.5, -0.5, 32767 / 32768, -1]);
  });

  it("begrenzt an den Raendern statt umzuklappen", () => {
    // Ohne Begrenzung wuerde +1.2 zu einem negativen Wert - hoerbar als Knacken.
    const got = floatToInt16(f32([1.2, -1.5, 0, 1, -1]));
    expect(Array.from(got)).toEqual([32767, -32768, 0, 32767, -32768]);
  });

  it("ueberlebt den Weg hin und zurueck", () => {
    const original = f32([0, 0.25, -0.25, 0.5, -0.75]);
    expectClose(int16ToFloat(floatToInt16(original)), Array.from(original), 4);
  });
});

describe("WAV lesen und schreiben", () => {
  it("schreibt einen 44-Byte-Kopf mit 16 kHz, mono, 16 bit", () => {
    const buffer = encodeWav16(f32([0, 0.5, -0.5]));
    expect(buffer.byteLength).toBe(44 + 6);
    const view = new DataView(buffer);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    expect(view.getUint16(20, true)).toBe(1);              // unkomprimiertes PCM
    expect(view.getUint16(22, true)).toBe(1);              // mono
    expect(view.getUint32(24, true)).toBe(ASR_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);             // 16 bit
    expect(view.getUint32(40, true)).toBe(6);              // Datenlaenge
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
  });

  it("liest zurueck, was es geschrieben hat", () => {
    const original = f32([0, 0.5, -0.5, 0.125, -0.125]);
    const back = parseWav(encodeWav16(original));
    expect(back?.sampleRate).toBe(ASR_SAMPLE_RATE);
    expectClose(back!.samples, Array.from(original), 4);
  });

  it("mischt Stereo zu mono", () => {
    // links +0.5, rechts -0.5 -> Mono ist Stille.
    const back = parseWav(wavBytes([16384, -16384, 16384, -16384], { channels: 2 }));
    expect(back?.samples.length).toBe(2);
    expectClose(back!.samples, [0, 0]);
  });

  it("findet die Daten auch hinter einem zusaetzlichen Chunk", () => {
    // iOS schiebt gern einen LIST-Block zwischen fmt und data. Ein Leser, der
    // stur ab Byte 44 liest, bekaeme hier Metadaten als Ton.
    const base = encodeWav16(f32([0.5, -0.5]));
    const extraBody = 6;
    const out = new ArrayBuffer(base.byteLength + 8 + extraBody);
    const src = new Uint8Array(base);
    const dst = new Uint8Array(out);
    dst.set(src.subarray(0, 36), 0);                       // RIFF + fmt
    const view = new DataView(out);
    "LIST".split("").forEach((c, i) => view.setUint8(36 + i, c.charCodeAt(0)));
    view.setUint32(40, extraBody, true);
    dst.set(src.subarray(36), 36 + 8 + extraBody);         // data dahinter
    view.setUint32(4, out.byteLength - 8, true);
    const back = parseWav(out);
    expectClose(back!.samples, [0.5, -0.5], 4);
  });

  it("gibt fremde Formate unangetastet an den Server weiter", () => {
    // Alte App-Versionen im Feld senden m4a/AAC. Der Server kann das - dieser
    // Code darf es nur nicht kaputt machen.
    expect(parseWav(new ArrayBuffer(0))).toBeNull();
    expect(parseWav(wavBytes([1, 2, 3], { bits: 8 }))).toBeNull();
    expect(parseWav(wavBytes([1, 2, 3], { format: 3 }))).toBeNull();
    expect(parseWav(wavBytes([]))).toBeNull();
    const aac = new Uint8Array([0xff, 0xf1, 0x50, 0x80, ...new Array(60).fill(0x11)]);
    expect(parseWav(aac.buffer)).toBeNull();
  });

  it("erkennt Aufnahmen, die der Server ohne Umrechnung liest", () => {
    expect(isAsrReadyWav(encodeWav16(f32([0.1, -0.1])))).toBe(true);
    // 44.1 kHz muesste der Server erst umrechnen - das ist genau die Zeit,
    // die hier gespart werden soll.
    expect(isAsrReadyWav(wavBytes([100, -100], { sampleRate: 44100 }))).toBe(false);
    expect(isAsrReadyWav(new ArrayBuffer(10))).toBe(false);
  });
});

describe("normalizeWavBytes", () => {
  it("liefert eine angeglichene Aufnahme im selben Format", () => {
    const quiet = new Float32Array(320);
    for (let i = 0; i < quiet.length; i += 1) {
      quiet[i] = 0.01 * Math.sin((2 * Math.PI * 300 * i) / ASR_SAMPLE_RATE);
    }
    const out = normalizeWavBytes(encodeWav16(quiet));
    const back = parseWav(out)!;
    expect(back.sampleRate).toBe(ASR_SAMPLE_RATE);
    expect(back.samples.length).toBe(quiet.length);
    // Der Zielpegel wird erreicht; die kleine Abweichung ist die 16-bit-Rasterung.
    expect(rms(back.samples)).toBeCloseTo(TARGET_RMS, 3);
    expect(peak(back.samples)).toBeLessThanOrEqual(PEAK_CEILING + 1e-6);
  });

  it("laesst nicht lesbare Aufnahmen Byte fuer Byte durch", () => {
    // Kein stiller Datenverlust: was hier nicht gelesen werden kann, geht
    // unveraendert an den Server, der es dekodiert wie bisher.
    const aac = new Uint8Array([0xff, 0xf1, 0x50, 0x80, ...new Array(80).fill(0x22)]).buffer;
    const out = normalizeWavBytes(aac);
    expect(out).toBe(aac);
  });

  it("ruehrt Stille nicht an", () => {
    const silent = encodeWav16(new Float32Array(160));
    const back = parseWav(normalizeWavBytes(silent))!;
    expect(Array.from(back.samples).every((v) => v === 0)).toBe(true);
  });
});
