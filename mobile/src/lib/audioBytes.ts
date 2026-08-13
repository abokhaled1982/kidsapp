// Kleine Utility, die von api.ts UND stream.ts gemeinsam gebraucht wird.
// Ausgelagert, damit kein Runtime-Require-Cycle zwischen den beiden entsteht.
//
// RN Hermes implementiert Blob.arrayBuffer() nicht - wir muessen die Bytes
// per XHR mit responseType="arraybuffer" holen, sonst kein Weg fuer WS.send(bytes).

export function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
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
