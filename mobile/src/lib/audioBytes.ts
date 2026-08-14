// Kleine Utility, die von api.ts UND stream.ts gemeinsam gebraucht wird.
// Ausgelagert, damit kein Runtime-Require-Cycle zwischen den beiden entsteht.
//
// Primaerpfad: expo-file-system v19 - File(uri).arrayBuffer() ist auf iOS UND
// Android robust. XHR gegen file:// scheitert auf Android (SDK 54 + Expo Go)
// mit onerror -> "Audio-Lesefehler." und war die Ursache fuer den Bug.
// XHR bleibt nur als letzter Fallback (z.B. remote https:// URIs).

import { File } from "expo-file-system";

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
