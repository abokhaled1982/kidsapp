# Arabische Ausspracheprüfung – Technische Referenz

Stand: 2026-08-12. Diese Datei dokumentiert den **aktuell implementierten** Ansatz, die eingesetzten Techniken und ihre konkreten Parameter. Sie ist die Referenz für Reproduzierbarkeit und wissenschaftliche Einordnung.

---

## 1. Systemüberblick

```
┌─────────────────────────┐         ┌─────────────────────────────────────────┐
│  Client  (index.html)   │         │  Backend  (Colab, wav2vec2_arabic_…ipynb)│
│                         │         │                                         │
│  ▶ MediaRecorder (webm) │  HTTPS  │  ▶ FastAPI  /assess                     │
│  ▶ FormData(audio,      │ ──────► │  ▶ pydub → 16 kHz float32               │
│    target)              │         │  ▶ Silero VAD (gentle trim)             │
│  ▶ Farb-Feedback pro    │ ◄────── │  ▶ wav2vec2 XLSR-53 Arabic (FP32)       │
│    Buchstabe            │  JSON   │  ▶ torchaudio forced_align (CTC)        │
│                         │         │  ▶ GOP (mean log-prob per token)        │
└─────────────────────────┘         └─────────────────────────────────────────┘
```

Öffentliche URL wird per **Cloudflared Quick Tunnel** aus Colab getunnelt.

---

## 2. Wissenschaftliche Verortung

| Komponente | Referenz |
|---|---|
| Selbstüberwachtes Akustik-Backbone | Baevski et al., *wav2vec 2.0*, NeurIPS 2020 (arXiv 2006.11477) |
| XLSR-53 Multilinguales Pretraining | Conneau et al., *Unsupervised Cross-Lingual Representation Learning for Speech Recognition*, INTERSPEECH 2021 |
| Arabisch-Fine-Tuning | `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` (Common Voice AR, CTC) |
| Sprachaktivitätserkennung | Silero VAD 5 (MIT) |
| CTC-Forced-Alignment | Kürzinger et al., *CTC-Segmentation of Large Corpora*, SPECOM 2020 (arXiv 2007.09127) |
| Aussprache-Scoring | Witt & Young, *Phone-level pronunciation scoring …*, Speech Communication 30 (2000) – **nicht-kompetitive GOP-Variante** |
| Serving-Stack | FastAPI + Uvicorn (Threadpool) |

---

## 3. Backend – Pipeline und Parameter

### 3.1 Modelle

| Modell | Rolle | Parameter |
|---|---|---|
| `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` | Akustik-Encoder + CTC-Head | ~317 M Parameter, 32 Zeichen im Vokabular, `pad_token_id` = CTC-Blank |
| `silero_vad` (Version 5) | VAD | ONNX, ~1.5 MB, Fenstergröße 512 Samples @ 16 kHz |

### 3.2 Audio-Decoding

```
pydub.AudioSegment.from_file(...) → set_frame_rate(16000) → set_channels(1) → set_sample_width(2)
```

- **Sample-Rate:** 16 000 Hz (nativ für wav2vec2)
- **Kanäle:** 1 (Mono, links-rechts-Mix bei Stereo)
- **Bit-Tiefe:** 16 bit signed
- **Normalisierung:** `/ 32768.0` → float32 in `[-1, 1]`
- **Formate:** alle von ffmpeg unterstützten (webm/opus, wav, mp3, m4a, ogg)

### 3.3 Sanftes Trimmen (Silero VAD)

Ziel: nur **führende und nachlaufende lange Stille** entfernen. Zwischenpausen bleiben unverändert.

| Parameter | Wert | Bedeutung |
|---|---|---|
| `sampling_rate` | 16000 | Hz |
| `threshold` | **0.35** | Sprach-Wahrscheinlichkeit ab der ein Fenster als „Sprache" gilt (Silero-Default ist 0.5 – niedriger = weniger aggressiv abschneiden) |
| `pad_ms` | **250** | Millisekunden Sicherheitsabstand vor / nach dem ersten / letzten Sprachfenster |
| `min_silence_duration_ms` | Silero-Default (100) | – |
| `speech_pad_ms` | Silero-Default (30) | – |

**Fallback:** wenn Silero **kein** Sprachsegment findet, wird das Roh-Audio unverändert weitergereicht (kein Fehler).

### 3.4 ASR-Inferenz

- **Vorverarbeitung:** `Wav2Vec2Processor` (Feature-Normalisierung)
- **Präzision:** **FP32** (bewusst gewählt, s. Abschnitt 6.1)
- **Device:** CUDA wenn verfügbar, sonst CPU
- **Ausgabe:** Logits (B, T, V=32) → `log_softmax` → Log-Wahrscheinlichkeiten pro Frame
- **Frame-Rate:** 20 ms (Stride 320 Samples)
- **Transkription:** Greedy CTC (`argmax` + `batch_decode`)

### 3.5 CTC-Forced-Alignment

Implementierung: **`torchaudio.functional.forced_align`** (CUDA-optimierter C++-Kern).

| Parameter | Wert |
|---|---|
| Log-Prob-Tensor | (1, T, 32) float32 |
| Target-IDs | Vokabular-Indizes der Zielbuchstaben (int32) |
| `blank` | `asr_model.config.pad_token_id` |

Rückgabe: pro Frame das zugewiesene Token (Blank oder Ziel-Token). Aus der Sequenz werden über eine kleine State-Machine (`_runs_of_non_blank`) die **Frame-Runs pro Zielbuchstaben** extrahiert.

### 3.6 GOP-Scoring

Für jeden Zielbuchstaben $c_i$ mit Token-ID $t_i$ und zugewiesenen Frames $F_i$:

$$
\text{score}(c_i) = \operatorname{clip}\!\left(\frac{\overline{\log P}(t_i \mid F_i) + 3.0}{3.0} \cdot 100,\;0,\;100\right)
$$

- **Rohwert:** mittlere Log-Wahrscheinlichkeit des korrekten Tokens über seine Frames.
- **Mapping in $[0, 100]$:** $\overline{\log P} \geq -0.05 \Rightarrow \sim 100$; $\overline{\log P} \leq -3.0 \Rightarrow 0$.
- **Konfidenz:** $\exp(\overline{\log P})$ als lineare Wahrscheinlichkeit.
- **Gesamtscore:** arithmetisches Mittel über alle Buchstaben.

Das ist die **nicht-kompetitive GOP-Variante** nach Witt & Young (2000). Sie ist die einfachere Baseline; die kompetitive Variante mit Nenner $\max_{q} P(q \mid F)$ ist nicht implementiert.

### 3.7 Diakritika-Normalisierung

```
target = NFD-decompose(target)  →  entferne nur explizite Tashkeel-Codepoints  →  NFC-recompose
```

Explizit entfernt werden:
`U+064B ً`, `U+064C ٌ`, `U+064D ٍ` (Tanwīn),
`U+064E َ`, `U+064F ُ`, `U+0650 ِ` (Kurzvokale),
`U+0651 ّ` (Šadda), `U+0652 ْ` (Sukūn),
`U+0670 ٰ` (Dagger-Alif).

Konsequenz für den Zielwort-Input:

- Alle klassischen Tashkeel-Zeichen → entfernt.
- `أ` `إ` `آ` `ؤ` `ئ` bleiben **erhalten** – sie sind eigene Buchstaben-Tokens im Grosman-XLSR-53-Vokabular. Die NFC-Rekomposition am Ende stellt sicher, dass `ا + hamza-above` (NFD-Zerlegung von `أ`) wieder zu `أ` zusammengeführt wird.
- `ة`, `ى` bleiben.

**Historische Anmerkung**: die frühere Variante hat via `NFD → Kategorie Mn strippen` auch die Hamza-Punkte entfernt, sodass `أ` fälschlich zu `ا` wurde. Bei Wörtern wie `أَنْف` führte das zu falsch niedrigen Scores auf dem ersten Buchstaben, obwohl das Kind es korrekt aussprach. Der jetzige Ansatz behandelt Hamza-Formen als eigene Zeichen.

---

## 4. Serving-Schicht

### 4.1 FastAPI-Endpoints

| Route | Methode | Zweck |
|---|---|---|
| `/health` | GET | Liveness-Check, gibt `device`, `asr_model`, `vad` zurück |
| `/assess` | POST | Ausspracheprüfung, siehe 4.3 |

### 4.2 Limits

| Parameter | Wert | Grund |
|---|---|---|
| `MAX_AUDIO_BYTES` | **3 MB** | Deckt 60 s webm/opus @ 32 kbit/s ab, verhindert DoS |
| `MIN_SAMPLES` | **2400** (= 150 ms bei 16 kHz) | Kürzere Aufnahmen liefern kein sinnvolles ASR-Ergebnis |

### 4.3 Request-/Response-Format

**Request** – `multipart/form-data`:

| Feld | Typ | Beschreibung |
|---|---|---|
| `audio` | File | Beliebiges ffmpeg-lesbares Audio, empfohlen: 16 kHz Mono webm/opus |
| `target` | Text | Zielwort, vokalisiert oder unvokalisiert (Diakritika werden serverseitig entfernt) |

**Response** – Pydantic-validiertes JSON `AssessResponse`:

```json
{
  "target": "كتاب",
  "transcription": "كتاب",
  "units": [
    { "label": "ك", "score": 92.3, "confidence": 0.79 },
    { "label": "ت", "score": 88.1, "confidence": 0.71 },
    { "label": "ا", "score": 76.4, "confidence": 0.61 },
    { "label": "ب", "score": 94.0, "confidence": 0.82 }
  ],
  "total": 87.7,
  "duration_ms": 412
}
```

### 4.4 Uvicorn-Konfiguration

- `host=0.0.0.0`, `port=8000`
- `log_level=warning`, `access_log=False`
- Läuft in Daemon-Thread mit `nest_asyncio` (Colab-Kompatibilität)
- Threadpool: FastAPI führt den `def`-Handler in einem Worker-Thread aus → GPU-Inferenz blockiert nicht den Event-Loop

### 4.5 Öffentliche URL

- **Cloudflared Quick Tunnel** (`cloudflared tunnel --url http://localhost:8000`)
- Kein Login, keine Konfiguration
- URL-Muster: `https://<random>.trycloudflare.com`
- Log-Datei: `/tmp/cf.log`, Retry-Schleife 60 s

---

## 5. Client – `index.html`

### 5.1 Wörterliste

- **100 kindgerechte Wörter**, Kinder 6–12, Anfänger-Arabisch
- 10 Kategorien: Zahlen, Familie, Farben, Tiere, Körper, Essen, Schule, Natur, Alltag, Grüße
- Struktur pro Eintrag: `{ ar: vollvokalisiert, de: deutsche Übersetzung }`
- Anzeige: vokalisierte Form (Amiri-Font, RTL, 84 px)
- Backend erhält denselben String – Diakritika werden serverseitig entfernt

### 5.2 Aufnahme

| Parameter | Wert |
|---|---|
| `channelCount` | 1 |
| `sampleRate` | 16000 (Hinweis an den Browser, faktisch entscheidet das Gerät) |
| `echoCancellation` | true |
| `noiseSuppression` | true |
| `autoGainControl` | true |
| Codec | `audio/webm;codecs=opus` (Fallback `audio/webm`, dann Browser-Default) |
| `MAX_RECORD_MS` | **3500 ms** (automatischer Stopp) |

Nutzer kann jederzeit manuell stoppen (zweiter Tap).

### 5.3 UI-Feedback-Schwellen

| Score | Farbe | Emoji-Label |
|---|---|---|
| ≥ 75 | Grün (#16a34a) | 🌟 Sehr gut! |
| 50 – 74 | Gelb (#eab308) | 🙂 Fast! |
| < 50 | Rot (#dc2626) | 💪 Nochmal versuchen! |

Der Gesamtscore steuert die Farbe des Fortschrittsbalkens; die Einzel-Buchstaben-Farben verwenden dieselben Schwellen auf `units[].score`.

### 5.4 Persistenz

`localStorage["arabicApp.v1"] = { idx: <Wortindex>, apiUrl: <Backend-URL> }`

---

## 6. Bewusste Design-Entscheidungen

### 6.1 Warum FP32 statt FP16

FP16 halbiert Latenz auf T4 (~50 ms statt ~90 ms pro Wort), war aber in Tests korreliert mit sichtbaren Erkennungsabweichungen bei arabischen Emphatika. Bei Wort-Level-Assessment ist die zusätzliche Latenz irrelevant, die Genauigkeit dagegen kritisch → **FP32**.

### 6.2 Warum kein Denoiser (mehr)

Getestet: **SpeechBrain Sepformer DNS-4 (16 kHz)**. Ergebnis: massive Verschlechterung der Erkennung, weil das Modell auf englischem DNS-4-Datenmaterial trainiert ist und arabische Gutturale (ح خ ع غ ق) und Emphatika (ص ض ط ظ) als „Rauschen" wegfiltert.

**Konsequenz:** kein Denoiser im Serverpfad. Die Rauschunterdrückung des Browsers (WebRTC `noiseSuppression`) ist ausreichend und sprachneutral.

### 6.3 Warum sanftes Trim statt aggressives VAD

Aggressives VAD (Silero-Default `threshold=0.5`, `pad_ms=100`) konnte Wortanfänge stumme Konsonanten (z. B. `ك` in `كتاب`) verkürzen. Die aktuellen Werte (`threshold=0.35`, `pad_ms=250`) sind bewusst konservativ.

### 6.4 Warum nicht-kompetitive GOP

Einfachheit für den PoC. Der Preis: **Pearson-Korrelation** zum menschlichen Rater ist ca. 10–15 % niedriger als kompetitives GOP. Dies ist die naheliegendste wissenschaftliche Weiterentwicklung, siehe Abschnitt 8.

### 6.5 Warum grapheme, nicht phoneme

Grapheme-CTC braucht keine G2P-Kette (kein `espeak-ng`, keine Vokabular-Mapping-Kette). Der Preis: Vokal-Fehler (`kitāb` vs. `katab`) sind bei unvokalisierten Zielwörtern nicht unterscheidbar. Für Anfänger-Wörter kaum relevant.

---

## 7. Ende-zu-Ende-Datenfluss (ein Request)

```
1. Kind tippt „🎤 Vorlesen"                                     [T=0 ms]
2. Browser öffnet Mic-Stream mit AGC + NS
3. MediaRecorder puffert bis zu 3500 ms webm/opus
4. Automatischer Stopp oder Nutzer-Tap
5. POST /assess (multipart)                                     [T≈3600 ms]
6. Server: pydub → 16 kHz mono float32                          [+30 ms]
7. Server: Silero VAD → gentle_trim                             [+20 ms]
8. Server: wav2vec2 forward → logits → log_softmax              [+150 ms auf T4]
9. Server: forced_align → runs pro Buchstabe                    [+5 ms]
10. Server: GOP-Score pro Buchstabe + Total                     [+2 ms]
11. Response JSON                                               [T≈3800 ms]
12. Client: Farb-Buchstaben, Balken, Transkription anzeigen
```

Reine Server-Verarbeitungszeit typisch **200–400 ms** auf T4.

---

## 8. Bekannte Grenzen und offene wissenschaftliche Punkte

| Grenze | Bedeutung | Möglicher Weg |
|---|---|---|
| **Modell auf Erwachsenen-Daten trainiert** | Kinderstimmen (höhere F0, breitere Formanten) sind out-of-distribution. Fehlerrate typisch 2–3× höher (Shivakumar & Georgiou, 2020). | Fine-Tuning auf 5–10 h Kinder-Arabisch |
| **Nicht-kompetitive GOP** | Ein „falsch, aber ähnlich klingender" Laut kann zu Unrecht hohe Scores bekommen. | Kompetitive GOP nach Witt & Young 2000 implementieren |
| **Nur Grapheme, keine Phoneme** | Vokal-/Schadda-Fehler bei unvokalisierten Wörtern unerkennbar. | Zweites Modell auf Phonem-Ebene (`facebook/wav2vec2-lv-60-espeak-cv-ft`) + G2P |
| **Keine Human-Rater-Validierung** | Wir kennen die Absolutgenauigkeit unseres Score-Wertes nicht. | 50–100 Aufnahmen von 3 Ratern labeln, **Pearson r** + **Cohen's κ** berichten |
| **Kein A/B-Log** | Keine Möglichkeit, Modell-Updates zu vergleichen. | JSONL-Logging jedes `/assess`-Requests + Score |
| **Cloudflared trycloudflare** | Prototyp-Grade, keine SLA. | Für Produktion: eigenes Docker-Image + Nginx + fester Domain-Name |

---

## 9. Reproduzierbarkeit

- **Modell-Version** (fest im Notebook): `jonatasgrosman/wav2vec2-large-xlsr-53-arabic`
- **Silero-Version**: 5.x (aus PyPI, `silero-vad`)
- **torchaudio-Version**: die von Colab (T4-Image) bereitgestellte, mindestens 2.1 für `forced_align`
- **Konfiguration**: sämtliche Parameter stehen literal im Notebook
- **Wörterliste**: eingebaut in `index.html` (100 Einträge)

Ein voller Reproduktionslauf: Colab öffnen → T4 GPU → *Run all* → URL kopieren → `index.html` öffnen.

---

## 10. Zitierhinweis (falls du das später in einem Text erwähnst)

> „Das System kombiniert einen Arabisch-fine-getuneten wav2vec 2.0 XLSR-53-Encoder (Baevski 2020; Conneau 2021; Grosman 2021) mit CTC-Forced-Alignment (Kürzinger 2020) und nicht-kompetitivem Goodness-of-Pronunciation-Scoring (Witt & Young 2000). Silero VAD 5 wird ausschließlich zum sanften Trimmen von Randstille verwendet. Die Auslieferung erfolgt über FastAPI mit Pydantic-validierten Response-Schemata."
