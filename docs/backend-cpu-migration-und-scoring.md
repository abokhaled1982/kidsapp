# Backend-Migration GPU → CPU: Techniken, Modelle, Scoring & Kosten

> Entscheidungsgrundlage für das Deployment des Arabic-Pronunciation-Backends
> (`backend/asr_app.py`). Beantwortet drei Fragen:
>
> 1. **Kostet CPU-Hosting Qualität?** — Nein, nicht der Gerätewechsel. Nur Quantisierung
>    und Modellwechsel kosten etwas, und beides ist messbar.
> 2. **Wo geht das Geld hin?** — Zu ~99 % in Idle-Zeit reservierter GPUs, nicht in Inferenz.
> 3. **Welche Techniken gibt es, wie heißen sie, wie werden sie bewertet?** — Abschnitte 4–7.
>
> Schwesterdokument: [`muaalem-quran-optimierung.md`](./muaalem-quran-optimierung.md)
> (Zusammenfassung der GPU-Optimierungsarbeit an Muaalem El Quran).

---

## Inhalt

| # | Abschnitt |
|---|---|
| 0 | [Kurzfassung](#0-kurzfassung) |
| 1 | [Ausgangslage — was heute läuft](#1-ausgangslage--was-heute-läuft) |
| 2 | [Kostenanalyse](#2-kostenanalyse) |
| 3 | [Was CPU-Inferenz mit der Qualität macht](#3-was-cpu-inferenz-mit-der-qualität-macht) |
| 4 | [Runtime- und Kompressionstechniken im Einzelnen](#4-runtime--und-kompressionstechniken-im-einzelnen) |
| 5 | [Scoring-Techniken — Namen, Formeln, Bewertung](#5-scoring-techniken--namen-formeln-bewertung) |
| 6 | [Metriken — wie diese Verfahren bewertet werden](#6-metriken--wie-diese-verfahren-bewertet-werden) |
| 7 | [Modelle im Zusammenhang mit den Scoring-Techniken](#7-modelle-im-zusammenhang-mit-den-scoring-techniken) |
| 8 | [Das Kinder-Problem — größter Qualitätshebel](#8-das-kinder-problem--größter-qualitätshebel) |
| 9 | [Benchmarks und Datensätze](#9-benchmarks-und-datensätze) |
| 10 | [Messprotokoll & Abnahmekriterien](#10-messprotokoll--abnahmekriterien) |
| 11 | [Gestaffelter Umsetzungsplan](#11-gestaffelter-umsetzungsplan) |
| 12 | [Risiken und Fallstricke](#12-risiken-und-fallstricke) |
| 13 | [Quellenverzeichnis](#13-quellenverzeichnis) |

---

## 0. Kurzfassung

| Maßnahme | Kostenwirkung | Qualitätsrisiko | Aufwand |
|---|---|---|---|
| `min_containers=2` → `0` + Memory-Snapshot | **−91 %** | **keine** | Minuten |
| `region="eu"` entfernen | **−33 %** | keine (nur Latenz +~50–100 ms) | Minuten |
| `A10G` → `T4` | −46 % GPU-Rate | keine | Minuten |
| Device GPU → CPU, FP32 | −70 % gegenüber GPU-Rate | **keine** (FP32 > dein heutiges FP16) | Tage |
| INT8-Quantisierung Encoder | zusätzlich ~2–3× schneller | **klein, messbar** (~0.1 % WER belegt) | Tage |
| Modellwechsel (Muaalem / AraS2P) | variabel | **groß, in beide Richtungen** | Wochen |
| Feintuning auf Kinderstimmen | keine | **großer Gewinn** (bis 46 % rel. WER) | Wochen |

**Die zentrale Erkenntnis:** Der Sprung von ~$2.750/Monat auf ~$70/Monat kommt zu ~91 %
aus **Scale-to-Zero**, nicht aus CPU. CPU ist danach der zweite Faktor 3 — und, wichtiger,
sie macht Scale-to-Zero überhaupt praktikabel, weil CPU-Container sich zuverlässig
per Memory-Snapshot vorwärmen lassen.

**Der zentrale Fallstrick:** Alle publizierten Quantisierungszahlen sind **WER**.
Dieses Backend bewertet nicht per WER, sondern liest Log-Probabilities direkt aus.
WER ist robust gegen Logit-Rauschen, GOP-Scores sind es nicht. → Abschnitt 3.3.

---

## 1. Ausgangslage — was heute läuft

### 1.1 Modell

| Eigenschaft | Wert |
|---|---|
| Modell-ID | `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` |
| Architektur | `Wav2Vec2ForCTC` (wav2vec 2.0 large, XLSR-53) |
| Parameter | ~315 Mio. |
| Ausgabe-Ebene | **Grapheme** (arabische Buchstaben), nicht Phoneme |
| Trainingsdomäne | Common Voice Arabisch — **Erwachsene**, MSA, Lesesprache |
| Frame-Rate | 50 Hz → 1 Frame ≈ 20 ms (Stride 320 Samples @ 16 kHz) |
| Präzision im Betrieb | **FP16** (`asr_app.py:110–111`) |

**Drei Domänenlücken zur Zielanwendung:**

1. **Erwachsene → Kinder.** Anderer Vokaltrakt, andere Formanten, höhere Variabilität.
2. **MSA-Lesesprache → Tajweed-Rezitation.** Andere Dauermuster, Nasalierung, Emphatik.
3. **Grapheme → Phoneme.** Der Code benennt die Folge selbst (`asr_app.py:286–288`):
   > „Fatha/Kasra/Damma sind vom ASR-Modell nicht unterscheidbar."

Das ist keine Hardware-Frage. Es ist die wichtigste offene Qualitätsfrage im System.

### 1.2 Deployment-Konfiguration

```python
# backend/asr_app.py:72–83
@app.cls(
    gpu="A10G",
    min_containers=2,      # ← 2 GPUs laufen 24/7
    max_containers=50,
    buffer_containers=1,   # ← +1 vorgeheizt während Aktivität
    scaledown_window=600,
    timeout=600,
    region="eu",           # ← Preis-Multiplikator 1.5×
)
@modal.concurrent(max_inputs=1)
```

### 1.3 Scoring-Pipeline (Signalfluss)

```
Audio (m4a/wav)
  └─ _decode_audio        torchaudio, Fallback pydub          → float32 @16 kHz
  └─ _highpass            Butterworth 2. Ordnung, 80 Hz
  └─ _normalize_level     RMS → −20 dBFS, Peak-Limiter 0.99
  └─ _pad_context         250 ms Null-Samples vorn UND hinten
  └─ _run_asr             wav2vec2 Forward → logits
                          → log_softmax(logits.float())        → log_probs  [1, T, V]
  └─ forced_align         torchaudio.functional, CTC-Viterbi   → Frame→Zeichen
  └─ _runs_of_non_blank   Frame-Läufe pro Zeichen
  └─ pro Buchstabe:
       post_score  = clip((target_lp + 3.0) / 3.0 × 100, 0, 100)
       llr         = target_lp − best_confusable_lp
       llr_score   = sigmoid(2.0 × llr) × 100
       articulation= 0.4 × post_score + 0.6 × llr_score
       tajweed     = _tajweed_for_letter(run_len, median_run_len, marks)
       final       = 0.75 × articulation + 0.25 × tajweed
  └─ Wortscore     = 0.75 × mean(char_scores) + 0.25 × min(char_scores)
```

### 1.4 Latenzbudget

`mobile/src/components/LatencyChip.tsx:9` definiert die Erwartung:

> „Wenn server >> 300ms, liegt sie im Backend (kalte GPU / geteilte T4)."

**Budget: < 300 ms serverseitig.** Das ist die harte Nebenbedingung jeder CPU-Variante.

### 1.5 Zwei konkrete Funde im bestehenden Code

**a) Silero-VAD wird geladen, aber nie benutzt.**
`load_silero_vad()` läuft in `load()` (`asr_app.py:122`), doch beide Scoring-Pfade rufen
`_preprocess(raw, trim=False)` (`asr_app.py:452`, `asr_app.py:525`). `_gentle_trim` — der
einzige VAD-Aufruf — wird damit nie erreicht. Ergebnis: unnötiges Modell im Speicher,
längerer Cold-Start, größeres Image. Auf CPU zählt beides direkt.

**b) 500 ms Padding pro Anfrage sind reine Rechenlast.**
`_pad_context(ms=250)` hängt vorn und hinten je 250 ms Stille an → 25 Frames zusätzlich
pro Anfrage. Bei einem 1.5-s-Wort sind das **+33 % Encoder-Arbeit**. Der Zweck (CTC-Kontext
an den Rändern) ist legitim, aber 250 ms ist ein ungemessener Wert. Kandidat für Reduktion
auf 100–150 ms, mit Score-Vergleich als Gate.

---

## 2. Kostenanalyse

### 2.1 Modal-Preisliste

Verifiziert von <https://modal.com/pricing> (Stand 18. August 2026). Modal listet nur
Sekundenpreise; Stundenwerte sind hier berechnet (× 3600).

| Ressource | pro Sekunde | pro Stunde |
|---|---|---|
| Nvidia A10 *(Seite nennt „A10", Code nutzt Alias `A10G`)* | $0.000306 | $1.1016 |
| Nvidia L4 | $0.000222 | $0.7992 |
| Nvidia T4 | $0.000164 | $0.5904 |
| CPU, **physischer Kern** (= 2 vCPU), min. 0.125 Kerne/Container | $0.0000131 | $0.0472 |
| RAM | $0.00000222 / GiB | $0.0080 / GiB |
| Volume | — | $0.09 / GiB / Monat (1 TiB/Monat frei) |

**Multiplikatoren:**

| Option | Faktor | Quelle |
|---|---|---|
| Broad Region (z. B. `us`, `eu`) | **1.5×** | [Region Selection](https://modal.com/docs/guide/region-selection) |
| Narrow Region (z. B. `eu-west`) | **1.75×** | dito |
| Non-preemptible | 3× | Pricing-Seite |

Der Multiplikator wirkt auf die **Summe** aller Compute-Ressourcen des Containers.
Nützliches Detail: Bei gemischter Liste (`region=["us","us-west"]`) gilt der **kleinere**
Faktor. Und breite Regionen sind nicht nur billiger — Modal empfiehlt sie ausdrücklich,
weil ein größerer Ressourcenpool „improves cold-start time and availability".

### 2.2 Wo das Geld hingeht

Modal ist im [Cold-Start-Guide](https://modal.com/docs/guide/cold-start) explizit:

> „you will be billed for any resources used while the container is idle
> (e.g., GPU reservation or residual memory occupancy)"

und zu den drei Scaling-Knöpfen:

> „All of these strategies can increase the resources consumed by your Function […]
> introduce a trade-off between cold start latencies and cost."

**Rechnung für die aktuelle Konfiguration** (730 h/Monat = 2.628.000 s):

```
GPU-Reservierung:  2 Container × $0.000306/s × 2.628.000 s × 1.5  =  $2.412
CPU+RAM (∼2 Kerne + 8 GiB je Container):                          ≈ $   347
                                                            Summe ≈ $2.759 / Monat
```

**Rechnung für eine einzelne Bewertung** (300 ms Wall-Time, A10G, EU):

```
0.3 s × $0.000306/s × 1.5 = $0.0001377   →  ~7.260 Anfragen pro Dollar
```

Bei 50.000 Anfragen/Tag (1,5 Mio./Monat): **≈ $207/Monat tatsächliche Inferenz.**

> **Das Verhältnis: ~$2.550 Idle zu ~$207 Nutzarbeit. 92 % der Rechnung ist Wartezeit.**

### 2.3 Szenarienvergleich

Annahme durchgehend: 1,5 Mio. Anfragen/Monat.

| # | Szenario | Rechnung | ~$/Monat |
|---|---|---|---|
| 1 | **heute:** 2× A10G warm, EU | $2.412 GPU + $347 | **2.759** |
| 2 | 2× T4 warm, EU | 2 × 0.000164 × 2.628.000 × 1.5 | 1.293 |
| 3 | A10G, `min_containers=0`, EU | 1,5 M × $0.0001377 | 207 |
| 4 | A10G, `min_containers=0`, ohne Region-Pin | 1,5 M × $0.0000918 | 138 |
| 5 | **CPU 4 Kerne + 4 GiB, `min_containers=0`, EU**, 500 ms | 1,5 M × $0.00004596 | **69** |
| 6 | wie 5, ohne Region-Pin | 1,5 M × $0.00003064 | 46 |
| 7 | CPU 4 Kerne + 4 GiB, **1 warm**, EU | (4×0.0000131 + 4×0.00000222) × 2.628.000 × 1.5 | 242 |
| 8 | wie 7, ohne Region-Pin | dito ohne 1.5× | 161 |

Rechenweg zu Szenario 5, pro Anfrage:

```
CPU : 0.5 s × 4 Kerne × $0.0000131 = $0.0000262
RAM : 0.5 s × 4 GiB   × $0.00000222 = $0.00000444
                              Summe = $0.00003064   × 1.5 (EU) = $0.00004596
                                     →  ~21.760 Anfragen pro Dollar
```

**Lesart:** Szenario 3 (nur ein Config-Flag, GPU bleibt) bringt schon 92 % der Ersparnis.
Szenario 5 bringt den Rest — und ist zugleich die robustere Basis für Scale-to-Zero.

### 2.4 Warum CPU trotz Szenario 3 die bessere Wahl ist

Szenario 3 sieht auf dem Papier fast so gut aus wie 5, hat aber ein operatives Problem:
`min_containers=2` stand ja nicht ohne Grund im Code. Es kompensiert Cold-Starts.
Ein GPU-Cold-Start umfasst CUDA-Kontext, 630 MB Gewichte nach VRAM und den Warm-up-Forward
(`asr_app.py:125–128`). [Memory Snapshots](https://modal.com/docs/guide/memory-snapshots)
„captures the state of a container's memory […] and reuses that state in future boots",
was den Cold-Start deutlich senkt — bei CPU-Containern aber sauberer greift, weil kein
GPU-Device-State im Snapshot hängt.

Dazu ein Nebeneffekt aus dem Cold-Start-Guide, der gegen `min_containers` spricht:
Container bleiben ohnehin nicht garantiert die volle Idle-Zeit am Leben, weil der
Autoscaler bei starker Überprovisionierung aggressiver herunterskaliert.

---

## 3. Was CPU-Inferenz mit der Qualität macht

### 3.1 Numerik: FP16 vs. FP32 vs. INT8

| Präzision | Mantisse | Wo im Einsatz | Wirkung auf Logits |
|---|---|---|---|
| FP32 | 24 bit | **CPU-Standard** | Referenz |
| FP16 | 11 bit | **heute auf der A10G** | ~10⁻³ relativer Fehler |
| BF16 | 8 bit | Muaalem-Default | größerer Rundungsfehler, größerer Range |
| INT8 | 8 bit + Skalierung | Ziel der Quantisierung | pro Tensor kalibriert, layerabhängig |

**Der Gerätewechsel allein verbessert die Numerik.** Das Backend läuft heute in FP16
(`USE_FP16 = self.device.type == "cuda"`, `DTYPE = torch.float16`). Auf CPU gibt es
FP32. Ein reiner Device-Wechsel ohne Quantisierung liefert also **präzisere** Log-Probs
als heute — nur langsamer.

Qualität verliert man erst durch zwei *andere*, oft mit „CPU" verwechselte Schritte:

| Maßnahme | belegte Qualitätskosten | Quelle |
|---|---|---|
| Device GPU → CPU, FP32 | 0 | Numerik, s. o. |
| **INT8-Quantisierung** von wav2vec 2.0 | **0.1 % WER**, Modell 3.6× kleiner | [arXiv:2103.15760](https://arxiv.org/abs/2103.15760) |
| **Distillation** auf kleineres Modell | **7 % WER**, 4.8× kleiner, 2× schneller | dieselbe Arbeit |

*Shrinking Bigfoot* (Peng et al., Interspeech 2021) ist die belastbarste Referenz, weil
dort genau diese Modellklasse gemessen wurde: wav2vec 2.0 large mit **317 Mio. Parametern**
— das hier eingesetzte Modell hat ~315 Mio. Einschränkung, die man kennen muss: das
Abstract nennt **keine Bit-Breite** und keine getrennten CPU-/GPU-Latenzen; die 2× beim
destillierten Modell sind ohne Hardware-Angabe.

### 3.2 Warum „CPU" per se nichts kostet

Ein Transformer-Forward ist eine Kette von GEMMs, LayerNorms und Softmaxen. Dieselben
Gewichte, dieselbe Reihenfolge, dasselbe Ergebnis — bis auf Assoziativitätsunterschiede
bei der Reduktionsreihenfolge, die im Bereich 10⁻⁶ relativ liegen. Was sich ändert:
Durchsatz. Eine A10G liefert ~125 TFLOPS FP16, ein 4-Kern-x86 in der Größenordnung
100–200 GFLOPS FP32 für GEMM. Der Faktor ~500 in der Rohleistung ist der Grund, warum
die Frage überhaupt gestellt wird — nicht Genauigkeit.

**Überschlag für das Latenzbudget** (eigene Schätzung, *keine Messung*):

```
Wort à 1.5 s + 0.5 s Padding = 2.0 s Audio  →  ~100 Frames
FLOPs ≈ 2 × 315·10⁶ × 100                   ≈  63 GFLOP
4 Kerne, ~150 GFLOPS effektiv FP32          →  ~0.4 s
mit INT8 (VNNI, Faktor 2–3)                 →  ~0.15–0.2 s
```

Das landet knapp im 300-ms-Budget — **aber nur mit INT8**. Deshalb ist Quantisierung
hier keine Kostenoptimierung, sondern Voraussetzung für die Latenz. Und deshalb muss der
Benchmark aus Abschnitt 10 vor dem Deployment laufen.

### 3.3 Warum WER-Zahlen für dieses Backend irreführend sind

**Das ist der wichtigste Abschnitt dieses Dokuments.**

Alle Zahlen in 3.1 sind **Word Error Rate**. WER misst, ob `argmax` über das Vokabular
dieselbe Zeichenfolge liefert. Das ist eine *diskrete* Größe und deshalb erstaunlich
robust: Ein Logit muss um sehr viel wandern, damit der Sieger kippt.

Dieses Backend bewertet aber nicht per `argmax`. Es liest die Log-Probs **stetig** aus:

```python
# asr_app.py:403–412
target_lp = lp_frame[:, equiv_ids].max(dim=-1).values.mean().item()
post_score = float(np.clip((target_lp + 3.0) / 3.0 * 100, 0, 100))
llr = target_lp - best_conf_lp
llr_score = self._sigmoid(self._LLR_K * llr) * 100.0      # _LLR_K = 2.0
```

Daraus folgen drei Sensitivitäten, die WER nicht abbildet:

**(1) Der Sigmoid-Verstärker.** Bei `K = 2.0` hat die Sigmoid im Nulldurchgang die
Steigung `K/4 = 0.5` pro LLR-Einheit, also **50 Score-Punkte pro 1.0 LLR**. Eine
Quantisierungsstörung von 0.1 nat in der LLR verschiebt den Score um ~5 Punkte, 0.35 nat
um ~17 Punkte. Genau im Grenzbereich, wo „richtig" und „falsch" entschieden wird, ist die
Empfindlichkeit maximal.

**(2) Die lineare Posterior-Rampe.** `post_score` bildet `target_lp ∈ [−3, 0]` auf
`[0, 100]` ab — **33 Score-Punkte pro nat**. Kein Clipping-Schutz innerhalb des Fensters.

**(3) Harte Dauerschwellen nach Forced Alignment.** `_tajweed_for_letter`
(`asr_app.py:280–322`) arbeitet mit diskreten Frame-Grenzen:

```python
if meta.get("shadda"):
    if run_len >= 6 and ratio >= 1.6:   return 100.0, None      # ≥ 120 ms
if meta.get("sukun"):
    if run_len <= 3 and ratio <= 0.7:   return 100.0, None      # ≤ 60 ms
if meta.get("madd"):
    if run_len >= 6:                    return 100.0, None
```

`forced_align` ist ein Viterbi-Pfad über die Log-Probs. Verschieben sich die Logits
leicht, kann der Pfad um **einen Frame** wandern. Bei `run_len = 6 → 5` fällt der
Shadda-Score von 100 auf `min(5/6 × 100, …) ≈ 83`, und ab < 70 kippt zusätzlich der
Hinweis auf `"shadda_fehlt"` — das Kind bekommt eine **inhaltlich falsche Rückmeldung**
bei völlig korrekter Aussprache.

> **Konsequenz: „0.1 % WER-Degradation" ist keine Zusage über den Score.**
> Es ist eine Zusage über `argmax`. Wer nach WER abnimmt, kann eine Bewertung
> deployen, die für Kinder spürbar kippt, während der Report grün bleibt.

Daraus folgen zwei harte Vorgaben, die in Abschnitt 10 und 11 wieder auftauchen:

- **Abnahme über Score-Korrelation und Flip-Rate**, nicht über WER.
- **Den CTC-Kopf nicht quantisieren.** Nur der Encoder geht nach INT8; die letzte
  Projektion auf die ~40 Vokabular-Logits bleibt FP32. Diese Schicht ist winzig
  (1024 × ~40), kostet also praktisch keine Geschwindigkeit — schützt aber genau die
  Zahlen, auf denen GOP, LLR und Alignment sitzen. In ONNX Runtime über
  `nodes_to_exclude` bzw. `op_types_to_quantize`.

---

## 4. Runtime- und Kompressionstechniken im Einzelnen

Jede Technik nach demselben Schema: **Was es ist → Wie es wirkt → Belegte Zahlen →
Eignung hier → Risiko.**

### 4.1 Dynamische INT8-Quantisierung (Post-Training)

**Was es ist.** Gewichte werden offline auf INT8 abgebildet. Die Skalierung der
*Aktivierungen* wird zur Laufzeit für jeden Forward neu bestimmt.

**Wie es wirkt.** Zwei Effekte: 4× weniger Speicherbandbreite für Gewichte, und
INT8-Dot-Product-Instruktionen (VNNI auf x86, DOT auf ARM) rechnen mehrere MACs pro Takt.

**Belegte Aussagen.** [ONNX Runtime](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html):

- Empfehlung ist eindeutig: *„dynamic quantization for RNNs and transformer-based models,
  and static quantization for CNN models"* → **wav2vec2-Encoder = dynamisch.**
- Dynamisch ist genauer als statisch: die Laufzeitberechnung *„increase[s] the cost of
  inference, while usually achieve[s] higher accuracy comparing to static ones"*.
- Keine Speedup-Zahlen in der Doku, mit Warnung: *„it is not rare to get worse performance
  on old devices."*
- *„Quantization is not a loss-less transformation."*

**Hardware-Voraussetzung.** Beste Ergebnisse auf *„x86-64 with VNNI"*. Ohne VNNI nutzt
U8S8 die Instruktion `VPMADDUBSW`, die auf 16 bit saturieren kann — Gegenmittel laut Doku:
`reduce_range=True` (7-bit-Gewichte) oder Format U8U8.

Die lokale Maschine (i7-13800H) hat `avx2` und `avx_vnni`, **kein** `avx512_vnni`:

```
$ grep -o -E 'avx512_vnni|avx_vnni|avx512f|avx2' /proc/cpuinfo | sort -u
avx2
avx_vnni
```

`avx_vnni` liefert die INT8-Beschleunigung, aber auf 256-bit-Vektoren statt 512.
**Welche CPU Modal zuweist, ist nicht garantiert** — deshalb muss der Benchmark aus
Abschnitt 10 auf Modal laufen, nicht nur lokal.

**API.**

```python
python -m onnxruntime.quantization.preprocess --input model.onnx --output model_pre.onnx

from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic(
    "model_pre.onnx", "model_int8.onnx",
    weight_type=QuantType.QInt8,
    reduce_range=True,                    # ohne AVX512-VNNI
    nodes_to_exclude=[...],               # ← CTC-Kopf ausnehmen (Abschnitt 3.3)
)
```

Wichtige Reihenfolge aus der Doku: Graph-Optimierung gehört in das **Preprocessing**,
nicht in den Quantisierungsschritt — sonst wird der Tensor-Vergleich beim Debuggen
unmöglich.

**Debugging-Werkzeug**, das für Abschnitt 10 direkt nützlich ist:
`onnxruntime.quantization.qdq_loss_debug` mit `create_weight_matching()`,
`collect_activations()`, `create_activation_matching()`,
`modify_model_output_intermediate_tensors()` — erlaubt FP32 gegen INT8 **Tensor für Tensor**
zu vergleichen und die schlimmsten Layer selektiv auszunehmen.

**Eignung hier:** hoch. **Risiko:** die Score-Sensitivität aus 3.3 — beherrschbar durch
Ausnahme des CTC-Kopfes plus Messgate.

### 4.2 Statische Quantisierung (Post-Training)

**Was es ist.** Aktivierungs-Skalierungen werden vorab aus **Kalibrierdaten** bestimmt und
als Konstanten eingebrannt. ONNX Runtime unterstützt MinMax, Entropy und Percentile.

**Eignung hier:** eher für den Conv-Feature-Extractor am Eingang als für den Encoder.
Laut ORT-Doku ist statisch die Wahl für CNNs. Der Aufwand (repräsentativer Kalibriersatz
aus Kinderstimmen) ist real, der Gewinn gegenüber dynamisch bei einem Transformer klein.

**Formatdetails, die man kennen muss:** CPU unterstützt U8U8, U8S8, S8S8; Default ist
S8S8 mit QDQ. Ausdrücklich zu vermeiden: S8S8 mit QOperator auf x86-64. GPU-Quantisierung
unterstützt **nur** S8S8 und braucht Tensor-Core-INT8 (T4/A100). Mindestens Opset 10,
für `MaxPool` Opset 12.

**Eignung hier:** niedrig bis mittel. **Risiko:** mittel (Kalibrierdaten-Bias).

### 4.3 Quantization-Aware Training (QAT)

**Was es ist.** Quantisierung wird im Training simuliert (Fake-Quant-Knoten), das Modell
lernt robuste Gewichte. ORT trainiert selbst nicht — QAT passiert im Framework, danach
Re-Export.

**Eignung hier:** die Rückfalloption, *falls* Abschnitt 4.1 das Gate aus Abschnitt 10
verfehlt. Die ORT-Doku nennt genau diesen Pfad: wenn Post-Training-Quantisierung das
Genauigkeitsziel nicht erreicht, QAT im Originalframework. **Aufwand:** hoch (Trainingsloop
+ Daten). **Risiko:** niedrig fürs Ergebnis, hoch für den Zeitplan.

### 4.4 Knowledge Distillation

**Was es ist.** Ein kleines Studentenmodell lernt, die Repräsentationen oder Ausgaben
eines großen Lehrermodells nachzubilden — nicht die harten Labels.

**Belegte Zahlen:**

| Verfahren | Kompression | Geschwindigkeit | Qualität | Quelle |
|---|---|---|---|---|
| wav2vec2-Distillation | 4.8× kleiner | 2× schneller | −7 % WER | [2103.15760](https://arxiv.org/abs/2103.15760) |
| **DistilHuBERT** | −75 % Größe | **73 % schneller** | „retains most performance" über 10 Tasks | [2110.01900](https://arxiv.org/abs/2110.01900) |
| **FitHuBERT** (dünner + tiefer) | 23.8 % der Größe | 35.9 % der Inferenzzeit | 12.1 % WER, 13.3 % PER (SUPERB) | [2207.00555](https://arxiv.org/abs/2207.00555) |
| Fbank statt Waveform-Frontend | −17 % Parameter | **2×** | „marginal degradation" | [2210.15631](https://arxiv.org/abs/2210.15631) |
| STaR (temporale Relationen) | ≤ 27 M Parameter | — | SUPERB 79.8, best in Klasse | [2312.09040](https://arxiv.org/abs/2312.09040) |
| RobustDistiller | 24 M vs. 95 M Lehrer | — | „often matches the teacher" | [2302.09437](https://arxiv.org/abs/2302.09437) |
| **HARNESS** (arabisch-zentriert) | HS/HST-Studenten | — | SOTA o. vergleichbar zu HuBERT/XLS-R | [2509.14689](https://arxiv.org/abs/2509.14689) |
| DiceHuBERT | — | — | **+21 % Phonemerkennung**, +14 % ASR relativ zu früheren Distillationen | [2507.02911](https://arxiv.org/abs/2507.02911) |

Der interessante Ausreißer ist **FitHuBERT**: „thinner and deeper" schlägt „shallower"
bei gleichem Budget. Für Phonemerkennung, wo Tiefe für Kontext zählt, ist das plausibel.

**Eignung hier:** mittelfristig hoch, kurzfristig niedrig — alle diese Modelle sind
englisch bzw. mehrsprachig vortrainiert und bräuchten arabisches Fine-Tuning inklusive
neuem CTC-Kopf. **Ausnahme: HARNESS ist explizit arabisch.** **Risiko:** hoch, das ist
ein Trainingsprojekt, kein Deployment-Schritt.

### 4.5 Structured Pruning und Supernets

**Was es ist.** Ganze Struktureinheiten (Attention-Heads, FFN-Kanäle, Layer) werden
entfernt, nicht einzelne Gewichte. Nur strukturiertes Pruning bringt auf handelsüblicher
Hardware echten Speedup — unstrukturierte Sparsity braucht Spezialkernel.

**Belegte Zahlen.** **LightHuBERT** ([2203.15610](https://arxiv.org/abs/2203.15610)):
Supernet über > 10⁹ Subnetze, Lehrer-Niveau bei **−29 % Parametern**, 3.5×-Kompression
bei Speaker-Verification / Keyword-Spotting / Intent-Classification mit geringem Verlust.

**Wichtige Ergänzung.** *Property Neurons in Self-Supervised Speech Transformers*
([2409.05910](https://arxiv.org/abs/2409.05910)) lokalisiert Neuronen in FFN-Layern, die
**Phone**, Geschlecht und Pitch speichern; entfernt man sie, bricht die Downstream-Genauigkeit
ein — und **sie beim Pruning zu schützen schlägt norm-basiertes Pruning**. Für ein System,
dessen ganzer Zweck Phonemdiskriminierung ist, ist das die richtige Pruning-Strategie.

**Eignung hier:** mittel. **Risiko:** hoch ohne Retraining.

### 4.6 Layer-Truncation / Early Exit

**Was es ist.** Nur die ersten *k* Encoder-Layer rechnen, der Rest wird verworfen —
motiviert durch die Beobachtung, dass phonetische Information nicht in der letzten Schicht
ihr Maximum hat.

**Was die Literatur stützt:**

- Abstrakte suprasegmentale Kategorien sind in 12-Layer-wav2vec2 am stärksten im
  **mittleren Drittel** repräsentiert; sprachspezifische Vorteile kommen aus „enriched
  context in transformer blocks, not local acoustic representation"
  ([2408.13678](https://arxiv.org/abs/2408.13678)).
- Untere Layer behalten akustisch-phonetisches Detail, obere spezialisieren sich auf ASR
  ([2602.13928](https://arxiv.org/abs/2602.13928)).
- Die Probing-Kurve über Layer ist konvex — mittlere Layer können die höchste
  Mutual Information tragen ([2312.10019](https://arxiv.org/abs/2312.10019)).
- Wo Wortinformation sitzt, hängt stark von Pretraining-Ziel und Modellgröße ab
  ([2307.00162](https://arxiv.org/abs/2307.00162)).

**Ehrliche Einschränkung:** In den durchsuchten Arbeiten fand sich **keine**, die
Layer-Truncation oder Early Exit für wav2vec2-CTC-Inferenz sauber vermisst. Die Signale
oben sind Probing-Ergebnisse, keine Deployment-Rezepte. Und für dieses System gibt es
ein konkretes Hindernis: **der CTC-Kopf ist auf die Ausgabe der letzten Schicht trainiert.**
Truncation erfordert zwingend einen neu trainierten Kopf.

**Eignung hier:** nur als Forschungsoption. **Risiko:** hoch, schlecht belegt.

### 4.7 ONNX Runtime

**Was es ist.** Ein Inferenz-Runtime, der einen exportierten statischen Graphen ausführt,
mit Graph-Optimierungen (Operator-Fusion, Konstanten-Folding) und austauschbaren
Execution Providern.

**Belegte Zahlen aus dem Schwesterdokument** (GTX 1660 Ti, Muaalem, 605 M Parameter):

| Runtime | RTF | Speedup |
|---|---|---|
| PyTorch Baseline | 0.0303 | 1.00× |
| ONNX CUDA | 0.0263 | 1.15× |
| ONNX + Graph-Fusion (97 × `SkipLayerNormalization`) | 0.0258 | 1.17× |
| **ONNX FP16** | **0.1170** | **0.26× — 4× langsamer** |

Die FP16-Zeile ist die wichtigste Lehre des ganzen Dokuments: **ohne Tensor Cores fielen
die FP16-Ops auf die CPU zurück** und machten alles vierfach langsamer. Verallgemeinert:
*keine dieser Zahlen gilt, bis sie auf der Ziel-Hardware gemessen ist.*

Für die CPU-Variante relevante Session-Optionen: `intra_op_num_threads`,
`inter_op_num_threads`, `OMP_NUM_THREADS`. Da Modal **pro Kern** abrechnet, ist die
Kern-Zahl gleichzeitig Latenz- und Kostenparameter — den Knick in der Kurve
(Latenz vs. Kerne) muss man messen und dort einstellen, statt Kerne pauschal hochzudrehen.

**Eignung hier:** hoch, das ist der Hauptpfad. **Risiko:** niedrig-mittel
(Dependency-Konflikte, s. 12.3).

### 4.8 OpenVINO / Optimum Intel

**Was es ist.** Intels Inferenz-Stack, über [HF Optimum](https://huggingface.co/docs/optimum/index)
nutzbar. Auf Intel-CPUs oft schneller als ONNX Runtime, mit eigenem
Post-Training-Quantisierungsweg.

**Eignung hier:** ernsthafte Alternative zu 4.7 und wert, im Benchmark als zweiter
Kandidat mitzulaufen — der Aufwand ist gering, wenn der ONNX-Export ohnehin existiert.
Entscheidend ist, welchen CPU-Typ Modal tatsächlich zuweist: auf AMD EPYC spielt OpenVINO
seine Intel-Vorteile nicht aus.

**Risiko:** niedrig. Kein zusätzliches Qualitätsrisiko gegenüber 4.1, dieselbe
INT8-Mathematik.

### 4.9 CTranslate2

**Was es ist.** C++-Inferenz-Engine für Transformer mit nativem INT8-Support.

**Belegte Zahlen** (Schwesterdokument, Muaalem auf GTX 1660 Ti): **RTF 0.0189, 1.60×** —
und das, obwohl nur der **Base-Teil** konvertiert werden konnte, weil das automatische
Konvertierungsskript an der modifizierten Architektur scheiterte:

```python
TransformersConverter("wav2vec2bert_base")
converter.convert("ct2_model", quantization="int8")
ctranslate2.models.Wav2Vec2Bert("ct2_model", device="cuda", compute_type="int8")
```

**Eignung hier:** begrenzt. CT2 hat eine `Wav2Vec2Bert`-Klasse — das passt zu Muaalem
(w2v-BERT 2.0), **nicht** zum aktuellen `Wav2Vec2ForCTC`. Wird erst relevant, wenn ein
Modellwechsel auf die w2v-BERT-Familie ansteht. **Risiko:** mittel (Architektur-Support).

### 4.10 TensorRT und `torch.compile` — warum hier irrelevant

Beide sind GPU-Techniken und fallen mit der GPU weg. Für die Akte, aus dem
Schwesterdokument:

- **TensorRT FP16** war das beste GPU-Ergebnis: RTF 0.0178, **1.70×** — mit
  `trt_fp16_enable`, `trt_engine_cache_enable`, `trt_cuda_graph_enable`.
  Engine-Caching ist Pflicht, weil der erste Build langsam ist.
- **`torch.compile`** brachte **nichts** (RTF unverändert 0.0303), weil die GTX 1660 Ti
  die nötige Unterstützung nicht bot.

Beides bleibt der Fallback, falls das CPU-Latenzbudget reißt: GPU behalten,
aber `min_containers=0` (Szenario 3/4).

### 4.11 Scale-to-Zero und Memory Snapshots

**Was es ist.** Kein Modell-, sondern ein Plattform-Hebel — und mit Abstand der größte.

Die drei Knöpfe laut [Cold-Start-Guide](https://modal.com/docs/guide/cold-start):

| Parameter | Bedeutung | Aktuell | Empfehlung |
|---|---|---|---|
| `scaledown_window` | Idle-Zeit bis Shutdown; Default 60 s, Bereich 2 s – 20 min | 600 | 600 behalten |
| `min_containers` | Untergrenze, hält Container „at all times" | **2** | **0** (oder 1 in Peak-Zeiten) |
| `buffer_containers` | zusätzliche Idle-Container **während** Aktivität | 1 | 1–2 (billig auf CPU) |

`buffer_containers` ist auf CPU der elegantere Ersatz für `min_containers`: Es hält nur
Reserve, *während* Traffic läuft — also genau dann, wenn ein Kind gerade übt und der
nächste Request wahrscheinlich ist. Nachts kostet es nichts.

**Memory Snapshots** ([Guide](https://modal.com/docs/guide/memory-snapshots)) friert den
Speicherzustand nach dem Warm-up ein und stellt ihn bei künftigen Boots wieder her —
inklusive importierter Bibliotheken. Im Unterschied zu `@modal.enter()` wird die Arbeit
nicht nur verschoben, sondern **über alle künftigen Cold-Starts geteilt**.

**Eignung hier:** höchste Priorität. **Risiko:** null für die Qualität.

---

## 5. Scoring-Techniken — Namen, Formeln, Bewertung

Dieser Abschnitt erklärt, wie die Verfahren heißen, wie sie rechnen und wie man sie bewertet
— jeweils mit Bezug auf den vorhandenen Code.

### 5.1 CTC und Forced Alignment

**Prinzip.** Connectionist Temporal Classification erlaubt Training ohne Frame-Labels über
ein Blank-Symbol und Summation über alle Alignments. Bei der *Inferenz* kann man den Weg
umdrehen: gegeben Zieltext, finde den wahrscheinlichsten Frame-zu-Symbol-Pfad — Viterbi
über die Log-Probs. Das ist **Forced Alignment**.

**Im Code.** `torchaudio.functional.forced_align(log_probs, targets, blank=…)`
(`asr_app.py:387`, `asr_app.py:540`), gefolgt von `_runs_of_non_blank`, das die Frames zu
Läufen pro Zielzeichen gruppiert.

**Was es liefert.** Zwei Dinge: die **Segmentierung** (welche Frames gehören zu welchem
Buchstaben — Grundlage für alle Dauerbewertung) und die **Frame-Auswahl** für GOP.

**Bewertung.** Alignment-Genauigkeit gegen manuelle Grenzen, üblich in ms mittlerer
Abweichung bzw. % Grenzen innerhalb 20 ms.

### 5.2 Goodness of Pronunciation (GOP) — Posterior-Variante

**Prinzip.** Der klassische Maßstab der computergestützten Aussprachebewertung: Wie
wahrscheinlich hält das akustische Modell das *erwartete* Phonem in genau diesem
Zeitfenster? Ursprünglich als log-posterior-ratio formuliert:

```
GOP(p) = log P(p | O)  −  max_q log P(q | O)
```

Über Frames eines Segments gemittelt. Hoher Wert = passt. Niedriger = Abweichung.

**Im Code.** `post_score` implementiert den ersten Term, mit einer linearen Rampe:

```python
target_lp  = lp_frame[:, equiv_ids].max(dim=-1).values.mean().item()
post_score = clip((target_lp + 3.0) / 3.0 * 100, 0, 100)
```

Die `equiv_ids` sind eine anwendungsspezifische Erweiterung: an Wortanfang gelten
`ا أ إ آ` als äquivalent, am Wortende `ة/ه`, `ى/ي/ا` (`_START_EQUIV`, `_END_EQUIV`).
Orthographisch sinnvoll — es bestraft keine Rechtschreibvarianten als Aussprachefehler.

**Bewertung.** Pearson-Korrelation zum Experten-Score; F1 bei binärem Falsch/Richtig.

### 5.3 Logit-basiertes GOP

**Prinzip.** Statt Softmax-Posterioren die **rohen Logits** verwenden. Motivation: die
Softmax normalisiert über das gesamte Vokabular und komprimiert damit Information — bei
sehr sicheren Frames sättigt sie.

**Belegte Aussage.** *Evaluating Logit-Based GOP Scores for Mispronunciation Detection*
([2506.12067](https://arxiv.org/abs/2506.12067), Interspeech 2025): logit-basierte Scores
**schlagen** Softmax-Posterior-GOP bei der Klassifikation; **Maximum-Logit-GOP korreliert
am besten mit menschlichen Bewertungen**; Kombination beider Score-Typen balanciert
Wahrscheinlichkeits- und Logit-Information. Einschränkung, die die Arbeit selbst nennt:
die Gewinne sind **datensatzabhängig** (getestet auf L2-Englisch niederländischer und
mandarin-sprachiger Lernender — nicht auf Arabisch).

**Bezug zum Code.** `_run_asr` wirft die Logits weg:

```python
logits    = self.asr_model(input_values).logits
log_probs = torch.log_softmax(logits.float(), dim=-1).cpu()   # ← Logits verworfen
```

Beide Tensoren zurückzugeben kostet nichts. Damit ließen sich beide Score-Varianten
parallel berechnen und gegeneinander evaluieren. **Das ist die billigste
Qualitätsverbesserung im ganzen Dokument** — keine Modelländerung, kein Trainingslauf.

### 5.4 LLR / Confusion-GOP — Diskriminierung gegen Verwechslungspartner

**Prinzip.** Nicht „passt das Phonem?", sondern „passt es **besser als der plausible
Verwechslungspartner**?" Log-Likelihood-Ratio gegen eine kuratierte Konfusionsmenge.

**Im Code** — der eigentliche Kern der Bewertung, mit 60 % Gewicht:

```python
confuse_ids  = self._confuse_ids(ch)              # _CONFUSABLES, asr_app.py:138–145
per_frame_conf = lp_frame[:, confuse_ids]
best_conf_lp = per_frame_conf.max(dim=-1).values.mean().item()
llr          = target_lp - best_conf_lp
llr_score    = sigmoid(2.0 * llr) * 100.0
articulation = 0.4 * post_score + 0.6 * llr_score
```

Die `_CONFUSABLES`-Tabelle ist phonetisch informiert und trifft genau die klassischen
Makhraj-Verwechslungen: `ت→طثد`, `ص→سض`, `ض→دظص`, `ق→كغخ`, `ح→هخع`, `ع→ءأاه`.
Zusätzlich liefert `argmax` über die Konfusionsspalten den **Diagnosehinweis** `error_hint`
— also nicht nur „falsch", sondern „klang wie **ط**". Das ist Mispronunciation
*Diagnosis*, nicht nur Detection.

**Literaturbezug.** Genau diese Idee ist als **Confusion-GOP** publiziert. *Ordinal
Regression with Anchored Reference Samples* ([2010.13339](https://arxiv.org/abs/2010.13339))
führt „average GOP and confusion GOP features" ein und berichtet **+26.9 % relative
Pearson-Korrelation** auf Microsoft-mTutor-ESL-Daten, auf oder über Niveau menschlicher
Bewerter. Der Ansatz im Code ist also gut gewählt und literaturgedeckt.

**Was fehlt:** `_LLR_K = 2.0` ist ein ungemessener Hyperparameter, der laut Abschnitt 3.3
die Empfindlichkeit bestimmt. Er gehört auf einem echten Datensatz kalibriert — nicht
geraten.

### 5.5 Context-aware GOP (CaGOP)

**Prinzip.** Frame-weises GOP ignoriert zwei Dinge: Koartikulation (Nachbarphoneme) und
dass Phoneme unterschiedliche Erwartungsdauern haben.

**Belegte Zahlen.** *Context-aware Goodness of Pronunciation for CAPT*
([2008.08647](https://arxiv.org/abs/2008.08647)): ein **Übergangsfaktor** plus
Self-Attention-**Dauermodellierung** ergibt **20 % relative Verbesserung auf Phonemebene
und 12 % auf Satzebene** gegenüber dem GOP-Modell.

**Bezug zum Code.** `_tajweed_for_letter` ist eine handgebaute, einfachere Variante der
Dauerkomponente — feste Frame-Schwellen statt gelerntem Dauermodell. CaGOP liefert die
saubere Formulierung derselben Intuition und ersetzt harte Schwellen durch stetige
Erwartungswerte, was zugleich das Frame-Kipp-Problem aus 3.3 mildern würde.

### 5.6 Dauerbasierte Tashkeel-/Tajweed-Bewertung

**Prinzip.** Wenn das Modell Vokalqualität nicht auflöst, nutze das, was es auflöst:
**Dauer**. Shadda verdoppelt den Konsonanten (lang), Sukun bedeutet keinen Vokal (kurz),
Madd verlängert den Vokal (lang).

**Im Code.** `_analyze_target` (`asr_app.py:239–278`) parst die Diakritika über
NFD-Normalisierung und leitet pro Konsonant `{shadda, sukun, madd}` ab; Madd wird korrekt
kontextabhängig erkannt (Fatha→`ا`, Kasra→`ي`, Damma→`و`). `_tajweed_for_letter` vergleicht
dann Lauflänge gegen absolute Frame-Schwellen **und** gegen den Median aller Läufe —
die Median-Normalisierung macht es robust gegen Sprechtempo. Das ist gut durchdacht.

**Literaturbezug.** *IntraVerbalPA* ([2309.07739](https://arxiv.org/abs/2309.07739))
führt genau dafür eine Metrik ein: **„Goodness of phonemic-duration"**, kombiniert mit
frame- und äußerungsweisen nonverbalen Hinweisen. Wer diese Achse ernsthaft verbessern
will, findet hier den Anschluss an die Literatur.

**Bewertung.** Korrelation zu Experten-Urteilen speziell auf Tajweed-Attributen — dafür
gibt es mit QuranMB.v1 (Abschnitt 9) inzwischen ein öffentliches Testset.

### 5.7 Anti-Phone Modeling

**Prinzip.** Das Phonem-Inventar wird um explizite **„Anti-Phone"**-Einheiten erweitert,
die Fehlaussprachen modellieren — statt Fehler nur als „niedriger Score des Zielphonems"
zu behandeln. Deckt auch **Distortion** ab, nicht nur kategoriale Substitution.

**Belegte Zahlen.** [2005.11950](https://arxiv.org/abs/2005.11950): auf L2-ARCTIC
**F1 +11.05 %** gegenüber E2E-Baseline und **+27.71 % gegenüber GOP-Scoring**.

**Relevanz.** Die +27.71 % gegenüber GOP sind der stärkste publizierte Hinweis darauf,
dass das aktuelle Paradigma (GOP + LLR) eine Obergrenze hat. Der Preis: annotierte
Fehlerdaten fürs Training der Anti-Phone.

### 5.8 Multi-Level CTC (Muaalem)

**Prinzip.** Ein gemeinsamer Encoder, **11 parallele CTC-Köpfe** — einer für Phoneme,
je einer für Ghonna, Qalqala, Tafkheem/Tarqeeq und weitere Tajweed-Attribute. Die
Attribute werden *direkt vom Modell vorhergesagt*, nicht aus Dauer erschlossen.

**Belegte Zahlen.** `Wav2Vec2BertForMultilevelCTC`, 605 M Parameter,
**0.16 % durchschnittliche Phoneme Error Rate** auf dem Testset
([arXiv:2509.00094](https://arxiv.org/abs/2509.00094), Details im Schwesterdokument).
Grundlage ist ein eigenes **Quran Phonetic Script (QPS)** mit zwei Ebenen: Phonem-Ebene
(Buchstaben mit kurzen/langen Vokalen) und **Sifa-Ebene** (Artikulationseigenschaften).

**Relevanz.** Das ist die direkte Antwort auf die dokumentierte Grenze in `asr_app.py:286–288`.
QPS kodiert Kurzvokale explizit — Fatha/Kasra/Damma sind damit **nicht** mehr
ununterscheidbar. Der Preis: 605 M statt 315 M Parameter, also ~2× Rechenlast auf CPU.
Gegenmittel: die kleineren Varianten `muaalem-model-v3-mini`,
`muaalem-model-w2v2-384`, `muaalem-streaming-rnn-v0`.

### 5.9 Transformer-Regressoren auf GOP-Features (GOPT und Nachfolger)

**Prinzip.** Zweistufig: GOP-Features berechnen, dann ein **gelernter** Regressor
darüber statt handgeschriebener Gewichte.

**GOPT** ([2205.03432](https://arxiv.org/abs/2205.03432), ICASSP 2022) trainiert einen
„Goodness Of Pronunciation feature-based Transformer" mit Multi-Task-Learning und bewertet
mehrere **Aspekte** (Accuracy, Fluency, Completeness, Prosody) auf mehreren
**Granularitäten** (Phonem, Wort, Äußerung) gleichzeitig statt einen Aspekt auf einer
Ebene. Code: <https://github.com/YuanGongND/gopt>.

**Die Nachfolgelinie:**

| Modell | arXiv | Beitrag |
|---|---|---|
| 3M | [2208.09110](https://arxiv.org/abs/2208.09110) | prosodische + SSL-Features, Vokal/Konsonant-Positions-Embedding; größte Gewinne bei Fluency/Prosody |
| HiPAMA | [2211.08102](https://arxiv.org/abs/2211.08102) | hierarchische Layer + Cross-Aspect-Attention entlang Phonem→Wort→Äußerung |
| HIA | [2601.01745](https://arxiv.org/abs/2601.01745) | bidirektionale Interaktion zwischen Granularitäten, SOTA auf speechocean762 |
| HiPPO | [2512.04964](https://arxiv.org/abs/2512.04964) | freie Sprache statt Vorlesen; kontrastiver Ordinal-Regularisierer + Curriculum |
| MultiPA | [2308.12490](https://arxiv.org/abs/2308.12490) | offene Antworten, generalisiert out-of-domain |
| Acoustic Feature Mixup | [2406.15723](https://arxiv.org/abs/2406.15723) | Mixup gegen Datenknappheit und Score-Ungleichverteilung |
| JCAPT | [2506.19315](https://arxiv.org/abs/2506.19315) | **Mamba**-SSM + phonologische Features + Think-Token; besonders stark bei MDD |

**Bezug zum Code.** Die Gewichte `0.4/0.6`, `0.75/0.25` und `0.75·mean + 0.25·min` sind
handgesetzt. Genau diese Abbildung würde ein GOPT-artiger Regressor **lernen** — der
Übergang ist inkrementell, weil die GOP-Features schon berechnet werden. Voraussetzung:
Trainingsdaten mit Expertenlabels.

### 5.10 Weitere Ansätze im Überblick

| Ansatz | arXiv | Kernidee & Zahl |
|---|---|---|
| **Retrieval-basierte MDD** | [2511.20107](https://arxiv.org/abs/2511.20107) | **ohne Training**, Retrieval über vortrainiertes ASR; F1 69.60 % L2-ARCTIC |
| **CROTTC / prompt-frei** | [2604.22133](https://arxiv.org/abs/2604.22133) | CTC-Alignments verpassen transiente Hinweise; frame-weise monotone Alignierung; **F1 71.77 % L2-ARCTIC, 71.70 % Iqra'Eval2** |
| Statistische Konfusionsgraphen | [2606.05569](https://arxiv.org/abs/2606.05569) | L1-spezifische gerichtete Phonem-Konfusionsgraphen; F1 59.52 % |
| Phonologisches Wav2Vec2 (Mandarin) | [2606.22022](https://arxiv.org/abs/2606.22022) | segmentale + tonale Attribute gemeinsam; **FAR −10.1 %, DER −23.6 %** |
| SincNet auf Rohwellenform | [2103.03023](https://arxiv.org/abs/2103.03023) | lernbare Bandpässe, adaptiert schnell über Nationalitäten |
| Pitch-Aware RNN-T | [2406.04595](https://arxiv.org/abs/2406.04595) | HuBERT + Pitch-Embeddings; PER −3 %, aber **FAR +7 %** |
| Phonem-Ähnlichkeitsmodellierung | [2507.14346](https://arxiv.org/abs/2507.14346) | verbatim-Erkennung des *tatsächlich* Gesprochenen statt des Intendierten |
| LoRA auf Speech-Multimodal-LLM | [2509.02915](https://arxiv.org/abs/2509.02915) | ein LoRA-Phi-4-multimodal für Scoring **und** MDD; PCC > 0.7, WER und PER < 0.15 |
| GPT-4o als Bewerter | [2503.11229](https://arxiv.org/abs/2503.11229) | LMM auf speechocean762, inkl. Feedback-Generierung |
| Übersichtsarbeit | [2310.13974](https://arxiv.org/abs/2310.13974) | *Automatic Pronunciation Assessment — A Review*, EMNLP Findings 2023 |

Die **Konfusionsgraphen** ([2606.05569](https://arxiv.org/abs/2606.05569)) sind besonders
naheliegend: Die `_CONFUSABLES`-Tabelle *ist* ein handgeschriebener Konfusionsgraph. Aus
echten Kinderaufnahmen ließe sich derselbe Graph **datengetrieben** und altersabhängig
schätzen, statt ihn zu raten.

Der Warnhinweis aus [2406.04595](https://arxiv.org/abs/2406.04595) gehört ins Lastenheft:
PER sank um 3 %, aber die **False Acceptance Rate stieg um 7 %**. Für eine Kinder-App ist
das die schlechtere Richtung — ein System, das Fehler durchwinkt, lehrt falsche Aussprache.
Siehe Abschnitt 6.

---

## 6. Metriken — wie diese Verfahren bewertet werden

| Metrik | Definition | Wofür | Relevanz hier |
|---|---|---|---|
| **WER** | Word Error Rate, Levenshtein / Wortzahl | ASR-Transkription | **niedrig** — siehe 3.3 |
| **CER** | dasselbe auf Zeichen | ASR, agglutinierende Sprachen | niedrig |
| **PER** | Phoneme Error Rate | Phonemerkennung | mittel (Muaalem: 0.16 %) |
| **F1 (MDD)** | harmonisches Mittel aus Precision/Recall der Fehlererkennung | Mispronunciation Detection | **hoch** |
| **FAR** | False Acceptance Rate — Fehler durchgewunken | MDD | **höchste Priorität** |
| **FRR** | False Rejection Rate — korrekt fälschlich abgelehnt | MDD | hoch (Frustration) |
| **DER** | Diagnostic Error Rate — richtig erkannt, falsch diagnostiziert | MDD-Diagnose | hoch (`error_hint`) |
| **PCC** | Pearson-Korrelation zu Experten-Scores | Aussprachebewertung | **hoch** |
| **Spearman** | Rangkorrelation, robust gegen Monotonie-Verzerrung | Bewertung | hoch |
| **RTF** | Real-Time Factor = Rechenzeit / Audiodauer | Effizienz | **hoch** (Budget 300 ms) |

**Für dieses Projekt richtige Priorisierung:**

1. **FAR zuerst.** Ein Kind, dessen `ط` als `ت` akzeptiert wird, lernt den Fehler ein.
   Das ist der teuerste Fehlertyp — pädagogisch, nicht rechnerisch.
2. **DER dicht dahinter**, weil `error_hint` direkt als Rückmeldung ans Kind geht.
   Ein falscher Hinweis ist schlimmer als kein Hinweis.
3. **PCC/Spearman** für die Gesamtnote.
4. **FRR** als Frustrationsmaß.
5. **WER** nur als Sanity-Check.

**Zusätzlich für die Migration** (Abschnitt 10): FP32 gegen INT8 braucht keine
Ground-Truth-Labels, sondern **Selbstkonsistenz** — Korrelation und Flip-Rate zwischen
alter und neuer Pipeline auf identischem Audio.

---

## 7. Modelle im Zusammenhang mit den Scoring-Techniken

Die zentrale Kopplung: **Die Ausgabe-Ebene des Modells bestimmt, welches Scoring möglich ist.**

| Modell | Params | Ausgabe-Ebene | mögliches Scoring | Domäne | CPU-Eignung |
|---|---|---|---|---|---|
| **`jonatasgrosman/wav2vec2-large-xlsr-53-arabic`** *(aktuell)* | 315 M | Grapheme | GOP, LLR, Dauer-Heuristik | CV-Arabisch, Erwachsene | mittel, INT8 nötig |
| `obadx/muaalem-model-v3_2` | 605 M | **QPS-Phoneme + 10 Tajweed-Attribute** | Multi-Level-CTC, direkte Attribute | Quran-Rezitation | schwach (2× Last) |
| `obadx/muaalem-model-v3-mini` | kleiner | dito | dito | Quran | **prüfen** |
| `obadx/muaalem-model-w2v2-384` | kleiner | dito | dito | Quran | **prüfen** |
| `obadx/muaalem-streaming-rnn-v0` | — | dito, streamingfähig | inkrementelles Scoring | Quran | **prüfen** |
| **AraS2P** ([2509.23504](https://arxiv.org/abs/2509.23504)) | w2v-BERT-Klasse | **MSA-Phoneme** | GOP auf Phonemen, MDD | Arabisch/Quran | schwach–mittel |
| **HARNESS** HS/HST ([2509.14689](https://arxiv.org/abs/2509.14689)) | destilliert | SSL-Features | Feature-Basis, Kopf nötig | **arabisch-zentriert** | **gut** |
| `facebook/w2v-bert-2.0` | 580 M | SSL-Features | Basis für Fine-Tuning | mehrsprachig | schwach |
| DistilHuBERT / FitHuBERT | −75 % / 23.8 % | SSL-Features | Feature-Basis, Kopf nötig | englisch | **sehr gut** |
| Age-aware Kinder-Phonemmodell ([2608.10206](https://arxiv.org/abs/2608.10206)) | **94 M** | Phoneme + Alter | Phonem-Scoring | **Kinder** | **sehr gut, läuft auf Handys** |

### 7.1 Die drei Wege im Vergleich

**Weg A — aktuelles Modell behalten, CPU + INT8.**
Scoring bleibt unverändert. Grenze bleibt: keine Kurzvokale, Tajweed nur über Dauer.
*Risiko niedrig, Aufwand Tage, Kosten −97 %.*

**Weg B — Muaalem-Familie.**
Multi-Level-CTC ersetzt die Dauer-Heuristik durch echte Attributvorhersage; löst
`asr_app.py:286–288`. Aber: `Wav2Vec2BertForMultilevelCTC` ist eine Custom-Architektur —
das Schwesterdokument dokumentiert, dass schon die CT2-Konvertierung daran scheiterte.
Und die gesamte `_gop_score`-Logik müsste auf 11 Köpfe umgebaut werden.
*Risiko hoch, Aufwand Wochen, Qualitätsgewinn potenziell groß.*

**Weg C — auf Kinderstimmen feintunen.**
Modellarchitektur bleibt, Domänenlücke schließt sich. Siehe Abschnitt 8.
*Risiko mittel, Aufwand Wochen, größter belegter Gewinn.*

**Empfehlung: A jetzt, C als Investition, B evaluieren — in dieser Reihenfolge.**
A und C sind orthogonal: der CPU-Port bleibt gültig, wenn später feingetunte Gewichte
kommen, weil sich die Architektur nicht ändert.

### 7.2 Ein wichtiger Datenpunkt gegen die Angst vor kleinen Modellen

[2608.10206](https://arxiv.org/abs/2608.10206) (L@S '26, Demo-Paper): Ein **94-M-Modell**,
trainiert mit **age-aware Multi-Task-Ziel** (Alter *und* Phonemsequenz vorhersagen),
**übertrifft WavLM Large mit 317 M Parametern** auf der DrivenData-Zielverteilung für
Kinder-Phonemerkennung — und liegt ~0.04 CER hinter Ensembles mit ~90× mehr Parametern.
Das Ergebnis läuft als „PhonemeTrainer" **auf normalen Handys**.

Weiterer Belegpunkt: Diskrete Token bringen „nearly equivalent performance with an
approximate **83 % reduction in parameters**" bei Kinder-ASR
([2406.13431](https://arxiv.org/abs/2406.13431), Interspeech 2024).

> **Klein ≠ schlechter. Domänenpassung schlägt Parameterzahl.**
> Das ist die eigentliche Antwort auf die Sorge, CPU-Optimierung koste Qualität:
> Ein passend trainiertes kleines Modell kann ein großes, unpassendes übertreffen.

---

## 8. Das Kinder-Problem — größter Qualitätshebel

Die Zielgruppe sind Kinder. Das eingesetzte Modell ist auf Erwachsenen trainiert. Die
Literatur ist hier einhellig: Kinder-ASR liegt systematisch hinter Erwachsenen-ASR, wegen
entwicklungsbedingter akustischer und artikulatorischer Variabilität und knapper
annotierter Korpora.

**Der stärkste Befund — und die günstigste Maßnahme:**

> **~5 Stunden transkribierte Kindersprache schlagen ein Erwachsenen-SOTA-Modell,
> das auf 960 Stunden feingetunt wurde.**
> Bis zu **46.08 % relative** WER-Reduktion (native), **45.53 %** (non-native);
> absolut 14.70 % bzw. 31.10 %.
> — [arXiv:2211.07769](https://arxiv.org/abs/2211.07769)

Die App produziert genau diese Daten. **Das ist das wertvollste Asset im Projekt** — mehr
als jede Runtime-Entscheidung. Konkret heißt das: Aufnahmen (mit Einwilligung) speichern,
eine Teilmenge von Tajweed-Lehrern labeln lassen, feintunen.

**Falls keine Kinderdaten verfügbar sind — Erwachsenenaudio kindlich machen:**

| Technik | Wirkung | Quelle |
|---|---|---|
| **Source-Filter-Warping** + XLS-R-Transfer | **4.86 % WER** auf PF-STAR, damals SOTA | [2206.09396](https://arxiv.org/abs/2206.09396) |
| Segmentale Spektrum-Warping + Formant-Energie-Perturbation | 6.5 % / 6.1 % rel. WER über VTLP-Baseline | [2203.06600](https://arxiv.org/abs/2203.06600) |
| Senone-aware **adversarielle** Multi-Task-Adaption | 7.7 % rel. ASR-Fehlerreduktion, **bis 25.2 % rel. Gewinn bei Aussprache- und Fluency-Scoring** | [2102.11488](https://arxiv.org/abs/2102.11488) |
| MyST-Preprocessing (Kid-Whisper) | WER 13.93 → **9.11** (Whisper-Small), 13.23 → **8.61** (Medium) | [2309.07927](https://arxiv.org/abs/2309.07927) |
| FASA-Aligner für verrauschte Kinderdaten | Datenqualität **13.6× besser** als menschliche Annotation auf CHILDES | [2406.17926](https://arxiv.org/abs/2406.17926) |

Die Zeile [2102.11488](https://arxiv.org/abs/2102.11488) ist die relevanteste, weil sie
nicht nur ASR, sondern **Aussprache- und Fluency-Scoring** verbessert — also genau die
Aufgabe hier, nicht nur die Vorstufe.

**Weitere Grundlagen:** empirische Studie zu E2E-Systemen für Kinder
([2102.09918](https://arxiv.org/abs/2102.09918)), Transfer-Learning-Empfehlungen inkl.
Altersabhängigkeit ([1805.03322](https://arxiv.org/abs/1805.03322)), In-Context-Learning
ohne Fine-Tuning mit bis zu 53.3 % rel. WER-Reduktion
([2512.18263](https://arxiv.org/abs/2512.18263)).

---

## 9. Benchmarks und Datensätze

Ohne Testset ist jede Qualitätsaussage Meinung. Diese Ressourcen gab es zum Teil noch
nicht, als der aktuelle Code entstand:

| Datensatz | Inhalt | Relevanz |
|---|---|---|
| **QuranMB.v1** ([2506.07722](https://arxiv.org/abs/2506.07722), Interspeech 2025) | **Erstes öffentliches Testset** für arabische Aussprachebewertung; Quran-Rezitation als Case Study; MSA-tauglicher Phonemsatz; Baselines | **direkt einsetzbar** |
| **ASMDD** ([2111.01136](https://arxiv.org/abs/2111.01136)) | 100 häufigste Wörter, **100 Kinder von 2–8 Jahren**, ägyptisches Arabisch, von Experten auf segmentale Fehler annotiert | **exakt die Zielgruppe** |
| **speechocean762** ([2104.01378](https://arxiv.org/abs/2104.01378), Interspeech 2021) | 5.000 Äußerungen, 250 non-native Sprecher, **die Hälfte Kinder**; 5 Experten labeln Satz-/Wort-/Phonemebene; Kaldi-Baseline; **kommerziell frei nutzbar**, OpenSLR | Referenz für Scoring-Methoden |
| **Iqra'Eval** (Leaderboard) | arabische/quranische MDD-Wertung; AraS2P Platz 1 2025, CROTTC 71.70 % F1 | externe Vergleichbarkeit |
| L2-ARCTIC | Standard-MDD-Benchmark (englisch) | Methodenvergleich |
| `obadx/qdat_bench` | Tajweed-Regel-Benchmark + [Leaderboard-Space](https://huggingface.co/spaces/obadx/qdat_bench_leaderboard) | Tajweed-spezifisch |
| `obadx/ood_muaalem_test` | Out-of-Distribution-Testset | Robustheit |
| AraVoiceL2 | arabisches L2-Testset; SpeechBlender **+4.6 % F1** ([2211.00923](https://arxiv.org/abs/2211.00923)) | arabisches MDD |

**Empfehlung:** QuranMB.v1 als primäres Gate, ASMDD als Kinder-Sanity-Check.
speechocean762 ist wertvoll, um Scoring-*Methoden* (5.3, 5.9) zu vergleichen, bevor man
sie auf Arabisch überträgt — es hat labelierte Kinderstimmen und ist frei nutzbar.

---

## 10. Messprotokoll & Abnahmekriterien

Der Kern der Migration. Ohne dieses Protokoll ist der CPU-Port ein Blindflug.

### 10.1 Referenzdatensatz

Mindestens **200 echte Aufnahmen** aus der App, nicht synthetisch:

- gemischte Altersgruppen der Zielgruppe,
- Einzelwörter **und** Ayahs (beide Codepfade),
- explizit **absichtlich falsche** Aussprachen — sonst misst man nur den einfachen Fall,
- Wörter mit Shadda, Sukun und Madd, weil dort die Frame-Schwellen kippen (3.3),
- verrauschte und leise Aufnahmen.

Einmalig durch die **heutige FP16-GPU-Pipeline** schicken und alle
`units[].score`, `articulation`, `tajweed`, `llr`, `error_hint`, `duration_ms` als
Referenz-JSON einfrieren.

### 10.2 Metriken und Gates

| Metrik | Berechnung | **Gate** |
|---|---|---|
| Score-Korrelation | Pearson **und** Spearman über alle `units[].score` | **r > 0.99** |
| Maximale Einzelabweichung | `max abs(score_neu − score_alt)` | **< 5 Punkte** |
| **Verdikt-Flip-Rate** | Anteil Buchstaben, die die 70er-Schwelle in *irgendeine* Richtung überqueren | **< 1 %** |
| **`error_hint`-Stabilität** | Anteil identischer Diagnosehinweise | **> 98 %** |
| Alignment-Drift | `max abs(duration_ms_neu − duration_ms_alt)` | **≤ 20 ms** (= 1 Frame) |
| Tajweed-Score-Flips | Flips bei Shadda/Sukun/Madd getrennt ausgewiesen | **< 1 %** |
| Transkription | CER zwischen alter und neuer `transcription` | < 0.5 % |
| Latenz p50 / p95 | serverseitig, auf Modal, nicht lokal | **p95 < 300 ms** |
| Kosten/1000 Anfragen | aus Modal-Abrechnung | dokumentieren |

**Warum die Flip-Rate das entscheidende Gate ist:** Korrelation kann 0.995 betragen,
während systematisch alle Grenzfälle in eine Richtung kippen. Genau die Grenzfälle sind
die Kinder, die gerade lernen.

**Alignment-Drift und Tajweed-Flips getrennt messen**, weil sie einen anderen Mechanismus
haben (Viterbi-Pfad statt Logit-Wert) und die harten Schwellen aus `_tajweed_for_letter`
treffen.

### 10.3 Vorgehen bei verfehltem Gate

In dieser Reihenfolge, jeweils neu messen:

1. **CTC-Kopf ausnehmen** (`nodes_to_exclude`) — falls noch nicht geschehen.
2. **`qdq_loss_debug`** einsetzen: `create_activation_matching()` zeigt, welche Layer
   den größten Fehler beitragen; diese selektiv in FP32 belassen.
3. **`reduce_range=True`** setzen, falls die Modal-CPU kein AVX512-VNNI hat.
4. **Nur Gewichte quantisieren**, Aktivierungen FP32 lassen.
5. **FP32-CPU ohne INT8** deployen — spart weniger, aber ist numerisch besser als heute.
   Prüfen, ob das Latenzbudget mit mehr Kernen hält (Kosten/Latenz-Knick messen).
6. **Fallback: GPU mit `min_containers=0`** (Szenario 3/4) — bringt bereits 92 % der
   Ersparnis ohne jedes Qualitätsrisiko.

Schritt 6 ist der Grund, warum das Projekt nicht scheitern kann: **Die Hauptersparnis
hängt nicht an der Quantisierung.**

### 10.4 Zusätzlich empfohlen: absolute Qualität

Selbstkonsistenz zeigt nur, dass sich nichts *verändert* — nicht, dass es *gut* ist.
Parallel deshalb einmalig gegen **QuranMB.v1** und **ASMDD** messen (Abschnitt 9), mit
FAR, DER und PCC nach Abschnitt 6. Das liefert die erste absolute Qualitätszahl des
Projekts überhaupt und ist die Baseline für alles Weitere.

---

## 11. Gestaffelter Umsetzungsplan

### Stufe 1 — Kosten sofort, null Qualitätsrisiko

Reine Konfiguration. Kein Modell, kein Scoring, keine Messung nötig.

```python
@app.cls(
    gpu="T4",                    # A10G → T4: $1.10/h → $0.59/h
    image=image,
    secrets=[modal.Secret.from_name(AUTH_SECRET)],
    min_containers=0,            # ← 2 → 0: der 92-%-Hebel
    max_containers=50,
    buffer_containers=1,         # Reserve nur während Aktivität
    scaledown_window=600,
    timeout=600,
    # region="eu",               # ← entfernt: −33 % Multiplikator
    enable_memory_snapshot=True, # Cold-Start abfedern
)
```

Zusätzlich: **Silero-VAD-Ladevorgang entfernen** (Fund 1.5a) — wird nie aufgerufen,
kostet Speicher und Cold-Start.

**Ergebnis: ~$2.759 → ~$140–210/Monat. Aufwand: Minuten.**
Wenn EU-Latenz produktrelevant ist, `region="eu"` behalten und bei ~$207 landen.

### Stufe 2 — CPU-Port mit Messgate

1. Referenzdatensatz nach 10.1 aufnehmen und Referenz-JSON einfrieren
   (**auf der heutigen GPU, vor jeder Änderung** — sonst gibt es keine Baseline mehr).
2. ONNX-Export von `Wav2Vec2ForCTC`, dynamische Achse für die Zeitdimension.
3. `python -m onnxruntime.quantization.preprocess` (Graph-Opt **hier**, nicht später).
4. `quantize_dynamic` mit `QuantType.QInt8`, `reduce_range=True`,
   **CTC-Kopf über `nodes_to_exclude` ausgenommen**.
5. `ASR.load()` auf `onnxruntime.InferenceSession` mit `CPUExecutionProvider` umstellen;
   `intra_op_num_threads` = zugewiesene Kerne.
6. `@app.cls(cpu=4, memory=4096, min_containers=0, enable_memory_snapshot=True)`,
   `gpu` entfernen. `@modal.concurrent(max_inputs=1)` beibehalten — CPU-Inferenz
   parallelisiert intern über Threads, Oversubscription schadet.
7. Benchmark nach 10.2 **auf Modal** laufen lassen, nicht lokal (CPU-Typ unterscheidet sich).
8. Nur mergen, wenn alle Gates halten. Sonst 10.3.

Optional in derselben Stufe, weil billig und messbar:
`_pad_context` von 250 ms auf 100–150 ms senken (Fund 1.5b) — dasselbe Gate anwenden.

**Ergebnis: ~$46–69/Monat, mit belegter Score-Gleichheit. Aufwand: Tage.**

### Stufe 3 — Qualität, unabhängig von der Hardware

Nach Priorität:

1. **Logit-basiertes GOP** (5.3) — `_run_asr` gibt Logits *und* Log-Probs zurück, beide
   Score-Varianten parallel berechnen, gegen QuranMB.v1 vergleichen. Billigste Maßnahme
   mit publizierter Evidenz.
2. **Absolute Baseline** gegen QuranMB.v1 und ASMDD (10.4) — erste echte Qualitätszahl.
3. **`_LLR_K` und die Schwellen kalibrieren** statt raten (5.4, 5.6).
4. **Kinderaufnahmen sammeln** (mit Einwilligung) und feintunen (Abschnitt 8) —
   größter belegter Gewinn, bis 46 % relativ.
5. **Konfusionsgraph datengetrieben** schätzen statt `_CONFUSABLES` zu pflegen (5.10).
6. **CaGOP-Dauermodellierung** statt harter Frame-Schwellen (5.5) — mildert zugleich
   das Kipp-Problem aus 3.3.
7. **Muaalem-Familie evaluieren** (7.1 Weg B) — löst die Kurzvokal-Grenze grundsätzlich.

---

## 12. Risiken und Fallstricke

### 12.1 Cold-Start bei `min_containers=0`

Der erste Nutzer nach einer Idle-Phase wartet auf Container-Boot plus Modellladen.
Gegenmittel: `enable_memory_snapshot=True`, `buffer_containers`, und ein Client-seitig
ehrlicher Ladezustand statt eines scheinbar hängenden Mikrofons. Der Cold-Start-Guide
warnt außerdem, dass Container **nicht garantiert** die volle `scaledown_window` überleben.

### 12.2 CPU-Typ auf Modal ist nicht garantiert

INT8-Speedup hängt an VNNI. Ob Intel mit AVX512-VNNI/AMX oder AMD zugewiesen wird, ist
nicht kontrollierbar. **Konsequenz: Benchmark auf Modal, nicht lokal.** Die lokale
Maschine (i7-13800H, `avx_vnni` ohne `avx512_vnni`) ist eine untere Schranke, kein Beweis.

### 12.3 Dependency-Hell

Das Schwesterdokument dokumentiert das ausführlich, und es gilt hier genauso:
`librosa` zieht `numba` nach → NumPy ≤ 2.0; `onnxruntime-gpu` will NumPy ≥ 2.1;
`ctranslate2` downgradet stillschweigend Pakete. **Empfehlung des Autors dort: getrennte
virtuelle Umgebungen.** Der aktuelle Stack pinnt bereits sauber
(`numpy==1.26.4`, `torch==2.4.1`) — beim Hinzufügen von `onnxruntime` muss dieser Pin
gehalten werden.

Der bestehende Stack braucht `librosa` nicht (Decoding läuft über `torchaudio`/`pydub`) —
ein Vorteil, den man nicht versehentlich aufgeben sollte.

### 12.4 Kein FP16 auf CPU versuchen

Aus dem Schwesterdokument: ONNX FP16 war **4× langsamer**, weil FP16-Ops ohne
Tensor-Core-Unterstützung zurückfielen. Auf CPU gilt dasselbe Prinzip verstärkt.
**Auf CPU: FP32 oder INT8. Nichts dazwischen.**

### 12.5 Regressionen im Ayah-Pfad

`_score_ayah_streamed` nutzt `mean_len_ayah` als globalen Median über die **ganze Ayah**
(`asr_app.py:552–553`), `_score_word` den Median über ein einzelnes Wort. Die
Dauer-Bewertung hat also in beiden Pfaden unterschiedliche Bezugsgrößen. Der Benchmark
muss **beide Pfade** abdecken; ein Gate nur auf Einzelwörtern übersieht die Hälfte.

### 12.6 Metrik-Verwechslung

Die Kernwarnung aus 3.3, weil sie leicht wieder verloren geht: **Nicht nach WER abnehmen.**
Und die Warnung aus [2406.04595](https://arxiv.org/abs/2406.04595): eine PER-Verbesserung
von 3 % ging dort mit **+7 % False Acceptance Rate** einher. Bessere Durchschnittsmetrik
kann schlechtere Pädagogik bedeuten.

---

## 13. Quellenverzeichnis

### 13.1 Infrastruktur und Preise — direkt abgerufen

| Quelle | Link |
|---|---|
| Modal Pricing | <https://modal.com/pricing> |
| Modal — Region Selection (1.5× / 1.75×) | <https://modal.com/docs/guide/region-selection> |
| Modal — Cold Start & Scaling | <https://modal.com/docs/guide/cold-start> |
| Modal — Memory Snapshots | <https://modal.com/docs/guide/memory-snapshots> |

### 13.2 Runtime und Quantisierung — direkt abgerufen

| Quelle | Link |
|---|---|
| ONNX Runtime — Quantization (dyn./stat., VNNI, `qdq_loss_debug`) | <https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html> |
| ONNX Runtime | <https://onnxruntime.ai/> |
| HF Optimum | <https://huggingface.co/docs/optimum/index> |
| CTranslate2 | <https://opennmt.net/CTranslate2/> · <https://github.com/OpenNMT/CTranslate2> |
| NVIDIA TensorRT | <https://developer.nvidia.com/tensorrt> |

### 13.3 Kompression, Distillation, Pruning

| Titel | arXiv |
|---|---|
| **Shrinking Bigfoot: Reducing wav2vec 2.0 footprint** — 3.6× kleiner bei 0.1 % WER; Distillation 4.8×/2×/7 % | [2103.15760](https://arxiv.org/abs/2103.15760) |
| DistilHuBERT — −75 % Größe, 73 % schneller | [2110.01900](https://arxiv.org/abs/2110.01900) |
| FitHuBERT — 23.8 % Größe, 35.9 % Inferenzzeit | [2207.00555](https://arxiv.org/abs/2207.00555) |
| LightHuBERT — Supernet, Lehrer-Niveau bei −29 % Parametern | [2203.15610](https://arxiv.org/abs/2203.15610) |
| Effective Distillation for ASR — Fbank-Frontend, 2× | [2210.15631](https://arxiv.org/abs/2210.15631) |
| STaR — temporale Relationen, best ≤ 27 M | [2312.09040](https://arxiv.org/abs/2312.09040) |
| RobustDistiller — 24 M matcht 95 M | [2302.09437](https://arxiv.org/abs/2302.09437) |
| DiceHuBERT — +21 % Phonemerkennung | [2507.02911](https://arxiv.org/abs/2507.02911) |
| **HARNESS — arabisch-zentrierte destillierte SSL-Familie** | [2509.14689](https://arxiv.org/abs/2509.14689) |
| Property Neurons — Phon-Neuronen beim Pruning schützen | [2409.05910](https://arxiv.org/abs/2409.05910) |
| Impact of Quantization and Pruning of SSL Speech Models | [2309.14462](https://arxiv.org/abs/2309.14462) |

### 13.4 Layer-Analyse

| Titel | arXiv |
|---|---|
| Suprasegmentals in SSL-Modellen — mittleres Drittel am stärksten | [2408.13678](https://arxiv.org/abs/2408.13678) |
| Probe Behaviors durch variationale MI-Schranken — konvexe Layer-Kurve | [2312.10019](https://arxiv.org/abs/2312.10019) |
| What Do Self-Supervised Speech Models Know About Words? | [2307.00162](https://arxiv.org/abs/2307.00162) |
| voice2mode — untere Layer für akustisch-phonetische Aufgaben besser | [2602.13928](https://arxiv.org/abs/2602.13928) |
| Revisiting SSL from a Mutual Information Perspective | [2401.08833](https://arxiv.org/abs/2401.08833) |

### 13.5 Scoring: GOP, Aussprachebewertung, MDD

| Titel | arXiv |
|---|---|
| **Evaluating Logit-Based GOP Scores** (Interspeech 2025) | [2506.12067](https://arxiv.org/abs/2506.12067) |
| **Context-aware GOP for CAPT** — +20 % / +12 % relativ | [2008.08647](https://arxiv.org/abs/2008.08647) |
| **ORARS** — average GOP + confusion GOP, +26.9 % rel. PCC | [2010.13339](https://arxiv.org/abs/2010.13339) |
| **GOPT** (ICASSP 2022) · Code: <https://github.com/YuanGongND/gopt> | [2205.03432](https://arxiv.org/abs/2205.03432) |
| 3M — Multi-view/-granularity/-aspect | [2208.09110](https://arxiv.org/abs/2208.09110) |
| HiPAMA — hierarchisch + Cross-Aspect-Attention | [2211.08102](https://arxiv.org/abs/2211.08102) |
| HIA — bidirektionale Granularitäts-Interaktion (AAAI 2026) | [2601.01745](https://arxiv.org/abs/2601.01745) |
| HiPPO — freie Sprache, Ordinal-Regularisierer | [2512.04964](https://arxiv.org/abs/2512.04964) |
| MultiPA — offene Antworten | [2308.12490](https://arxiv.org/abs/2308.12490) |
| JCAPT — Mamba + phonologische Features | [2506.19315](https://arxiv.org/abs/2506.19315) |
| **IntraVerbalPA — „Goodness of phonemic-duration"** | [2309.07739](https://arxiv.org/abs/2309.07739) |
| SSL für APA — layer-weise Reps + BiLSTM, koreanische ESL-Kinder | [2204.03863](https://arxiv.org/abs/2204.03863) |
| Acoustic Feature Mixup | [2406.15723](https://arxiv.org/abs/2406.15723) |
| **Anti-Phone Modeling** — F1 +27.71 % gegenüber GOP | [2005.11950](https://arxiv.org/abs/2005.11950) |
| **CROTTC / prompt-frei** — F1 71.77 % L2-ARCTIC, 71.70 % Iqra'Eval2 | [2604.22133](https://arxiv.org/abs/2604.22133) |
| Retrieval-basierte MDD ohne Training — F1 69.60 % | [2511.20107](https://arxiv.org/abs/2511.20107) |
| Statistische Konfusionsgraphen — F1 59.52 % | [2606.05569](https://arxiv.org/abs/2606.05569) |
| Phonologisches Wav2Vec2 (Mandarin) — FAR −10.1 %, DER −23.6 % | [2606.22022](https://arxiv.org/abs/2606.22022) |
| Pitch-Aware RNN-T — PER −3 %, **FAR +7 %** | [2406.04595](https://arxiv.org/abs/2406.04595) |
| E2E MDD aus Rohwellenformen (SincNet) | [2103.03023](https://arxiv.org/abs/2103.03023) |
| Phonem-Ähnlichkeitsmodellierung, verbatim | [2507.14346](https://arxiv.org/abs/2507.14346) |
| LoRA-Speech-Multimodal-LLM — PCC > 0.7 | [2509.02915](https://arxiv.org/abs/2509.02915) |
| LMMs als Bewerter (GPT-4o) | [2503.11229](https://arxiv.org/abs/2503.11229) |
| TextPA — Zero-Shot über LLM | [2509.14187](https://arxiv.org/abs/2509.14187) |
| **Automatic Pronunciation Assessment — A Review** | [2310.13974](https://arxiv.org/abs/2310.13974) |
| SpeechBlender — +4.6 % F1 auf AraVoiceL2 | [2211.00923](https://arxiv.org/abs/2211.00923) |
| NOCASA 2025 — CTC-GOP führt Leaderboard, norwegische L2-Kinder | [2509.03256](https://arxiv.org/abs/2509.03256) |
| Rubrik für pathologische Sprache — GOP-Korrelationen | [2404.18851](https://arxiv.org/abs/2404.18851) |

### 13.6 Kinder-ASR

| Titel | arXiv |
|---|---|
| **Fine-tuning SSL Adult Reps für Kinder — 5 h > 960 h, bis 46.08 % rel.** | [2211.07769](https://arxiv.org/abs/2211.07769) |
| **Source-Filter-Warping + XLS-R — 4.86 % WER PF-STAR** | [2206.09396](https://arxiv.org/abs/2206.09396) |
| Spectral Modification Augmentation — 6.5 % / 6.1 % rel. | [2203.06600](https://arxiv.org/abs/2203.06600) |
| **Senone-aware adversarielle Adaption — bis 25.2 % rel. beim Scoring** | [2102.11488](https://arxiv.org/abs/2102.11488) |
| Kid-Whisper — MyST 13.93 → 9.11 | [2309.07927](https://arxiv.org/abs/2309.07927) |
| **Edge Phoneme Recognition, age-aware — 94 M > WavLM Large 317 M** | [2608.10206](https://arxiv.org/abs/2608.10206) |
| Discrete Token Enhancement — −83 % Parameter | [2406.13431](https://arxiv.org/abs/2406.13431) |
| E2E-Systeme für Kinder — empirische Studie | [2102.09918](https://arxiv.org/abs/2102.09918) |
| Transfer Learning Adult → Children | [1805.03322](https://arxiv.org/abs/1805.03322) |
| FASA-Aligner — 13.6× bessere Datenqualität | [2406.17926](https://arxiv.org/abs/2406.17926) |
| TICL+ — bis 53.3 % rel. WER-Reduktion ohne Fine-Tuning | [2512.18263](https://arxiv.org/abs/2512.18263) |
| SLT 2021 Children Speech Recognition Challenge | [2011.06724](https://arxiv.org/abs/2011.06724) |

### 13.7 Arabisch, Quran, Datensätze

| Titel / Ressource | Link |
|---|---|
| **QuranMB.v1 — Unified Benchmark for Arabic Pronunciation Assessment** | [2506.07722](https://arxiv.org/abs/2506.07722) |
| **AraS2P — Platz 1 Iqra'Eval 2025** | [2509.23504](https://arxiv.org/abs/2509.23504) |
| **ASMDD — 100 Kinder, 2–8 Jahre, ägyptisches Arabisch** | [2111.01136](https://arxiv.org/abs/2111.01136) |
| **speechocean762 — 250 Sprecher, halb Kinder, kommerziell frei** | [2104.01378](https://arxiv.org/abs/2104.01378) |
| Muaalem-Paper — Multi-Level CTC, 0.16 % PER | [2509.00094](https://arxiv.org/abs/2509.00094) |
| w2v-BERT — Architekturgrundlage | [2108.06209](https://arxiv.org/abs/2108.06209) |
| wav2vec 2.0 — Originalarbeit | [2006.11477](https://arxiv.org/abs/2006.11477) |
| XLSR — Cross-lingual Representation Learning | [2006.13979](https://arxiv.org/abs/2006.13979) |
| Multimodale Quran-Phonemerkennung (UniSpeech + BERT) | [2511.17477](https://arxiv.org/abs/2511.17477) |
| Muaalem-Repo | <https://github.com/obadx/quran-muaalem> |
| Muaalem v3_2 | <https://huggingface.co/obadx/muaalem-model-v3_2> |
| Muaalem v3-mini | <https://huggingface.co/obadx/muaalem-model-v3-mini> |
| aktuelles Modell | <https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic> |
| qdat_bench | <https://huggingface.co/datasets/obadx/qdat_bench> |

---

## Anhang: Herkunft der Angaben

**Direkt abgerufen und im Volltext geprüft:** die vier Modal-Seiten (13.1), die
ONNX-Runtime-Quantisierungsdoku (13.2), sowie die arXiv-Abstract-Seiten von
2103.15760, 2608.10206 und 2509.14689.

**Über die offizielle arXiv-API abgerufen** (Titel, ID, Jahr und Abstract-Angaben stammen
aus den API-Antworten): alle übrigen Arbeiten in 13.3–13.7. Wo im Dokument eine Zahl
genannt wird, steht sie im jeweiligen Abstract; wo ein Abstract eine Zahl **nicht**
enthielt, ist das im Text vermerkt — etwa die fehlende Bit-Breite bei *Shrinking Bigfoot*
und die fehlenden absoluten CER-Werte bei 2608.10206.

**Eigene Schätzungen, ausdrücklich keine Messungen:** die FLOPs-/Latenzüberschläge in
Abschnitt 3.2 und die Kostenszenarien in 2.3 (Letztere sind exakte Arithmetik auf den
verifizierten Preisen, aber mit *angenommenen* Werten für Anfragevolumen, Wall-Time und
Container-Ressourcen).

**Aus dem Schwesterdokument übernommen:** alle RTF-Werte der GPU-Runtimes
(TensorRT, CTranslate2, ONNX FP16) und die Muaalem-Modellangaben.

**WebSearch war während der Erstellung serverseitig nicht verfügbar**
(`tool type 'web_search_20250305' is not supported for this model`). Die Recherche lief
vollständig über direkte HTTP-Abrufe der oben genannten Seiten und der arXiv-API. Es ist
daher möglich, dass neuere oder besser passende Arbeiten existieren, die über diese
Suchpfade nicht auffindbar waren.

---

*Erstellt am 18. August 2026. Codezeilen-Verweise beziehen sich auf den Stand von
`backend/asr_app.py` zu diesem Datum.*
