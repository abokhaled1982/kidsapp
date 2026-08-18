# Muaalem El Quran — Modell-Optimierung & Deployment

> Zusammenfassung und Link-Sammlung zum Artikel
> **„Tarteel & Muaalem El Quran: Optimizing Quranic AI Part 2"**
> von Kareem (عبدالكريم الخطيب), veröffentlicht am 26. Dezember 2025.
>
> Quelle: <https://kareemai.com/blog/posts/speech_recognition/muaalm_quran_chance.html>
> Teil 1: <https://kareemai.com/blog/posts/speech_recognition/my_dream_job_at_tarteel.html>

---

## 1. Worum es geht

Der Autor beschreibt seinen Weg Richtung **Tarteel AI** (Quran-Recitation-App): Nach dem ersten
Blogpost hat sich niemand aus dem Unternehmen gemeldet — sein Fazit: Begeisterung allein reicht
nicht, es zählt die Engineering-Fähigkeit („Talking is easy. Acting is hard."). Stattdessen
arbeitete er bei **xbites** (Real-Estate-AI) an agentischen Systemen und Produktionsmodellen.

Neues Kapitel: Er trägt als Open-Source-Contributor zu **Muaalem El Quran** bei — einem offenen
Modell zur Bewertung von Quran-Rezitation, das als Community-Alternative zu Tarteel gilt.
Sein Aufgabenbereich: **Modelloptimierung, Inferenz-Beschleunigung, Deployment-Infrastruktur**.

Ziel ist die Auslieferung vor Ramadan, u. a. für Partner wie die **Quran Foundation**. Der Plan
besteht aus drei Schritten:

1. Modelloptimierung für schnellere Inferenz
2. Effizientes Preprocessing / Audio-Handling
3. Serving und Batching für eine Produktions-API

> **Hinweis zur Autorenschaft:** Im Artikel wird das Modell „Abdalla Amal" zugeschrieben.
> Im GitHub-Repo bzw. im arXiv-Paper ist der Autor als **obadx / Abdullah Abdelfattah** geführt.

---

## 2. Das Modell (Ausgangslage)

| Metrik | Wert |
|---|---|
| Modell-Klasse | `Wav2Vec2BertForMultilevelCTC` |
| Architektur | Custom Audio-Modell mit **11 Output-Heads** |
| Parameter | 605 Mio. (HF-Modellkarte: 0.6 B) |
| Baseline RTF | 0.0303 |
| Test-GPU | NVIDIA GTX 1660 Ti (6 GB VRAM) |

**RTF (Real-Time Factor)** = Verarbeitungszeit / Audiodauer.
0.03 bedeutet: 1 Sekunde Audio braucht 30 ms. Kleiner ist besser.

Die 11 Heads sagen Tajweed-Attribute voraus, u. a.:

- **Phoneme** (arabische Laute)
- **Ghonna** (Nasalierung)
- **Qalqala** (Echo-Laute)
- **Tafkheem / Tarqeeq** (schwere / leichte Buchstaben)
- … und 7 weitere

---

## 3. Optimierungsschritte

### 3.1 PyTorch `torch.compile`
Einzeiler `model = torch.compile(model)`; verspricht durch Graph-Optimierung und Kernel-Fusion
teils ~2× Speedup. **Ergebnis: RTF 0.0303 — kein Gewinn**, da die GTX 1660 Ti die nötige
Unterstützung nicht bietet.

### 3.2 ONNX Runtime
Export nach ONNX, Test verschiedener Execution Provider:

- **CUDA Execution Provider** — `ort.InferenceSession("model.onnx", providers=["CUDAExecutionProvider"])` → RTF **0.0263** (1.15×)
- **Graph-Optimierungen** — 97 `SkipLayerNormalization`-Ops fusioniert → RTF **0.0258** (1.17×)
- **FP16-Quantisierung** → RTF **0.1170**, also ca. 4× *langsamer*: ohne Tensor Cores fallen die
  FP16-Ops auf die CPU zurück.

### 3.3 NVIDIA TensorRT
Layer-Fusion, Kernel-Auto-Tuning, Präzisions-Kalibrierung (FP16/INT8), Speicheroptimierung.
Verwendete Optionen: `trt_fp16_enable`, `trt_engine_cache_enable`,
`trt_engine_cache_path` (`"trt_cache"`), `trt_cuda_graph_enable` — mit
`TensorrtExecutionProvider` zuerst und `CUDAExecutionProvider` als Fallback.
Engine-Caching macht den ersten Lauf langsam und alle folgenden schnell; CUDA Graphs senken den
CPU-Overhead zwischen Kernel-Launches.
**Ergebnis: RTF 0.0178 (1.70×) — bestes Resultat.**

### 3.4 CTranslate2
C++-Inferenz-Engine für Transformer mit INT8-Support. Nur der **Base-Teil** des Modells wurde
konvertiert (per Custom-Class-Wrapper), weil das automatische Konvertierungsskript an der
modifizierten Architektur scheiterte:

```python
TransformersConverter("wav2vec2bert_base")
converter.convert("ct2_model", quantization="int8")
ctranslate2.models.Wav2Vec2Bert("ct2_model", device="cuda", compute_type="int8")
```

**Ergebnis: RTF 0.0189 (1.60×).**

### 3.5 Gesamtergebnis

| Runtime | RTF | Speedup | Anmerkung |
|---|---|---|---|
| PyTorch (Baseline) | 0.0303 | 1.00× | Referenz |
| PyTorch + `torch.compile` | 0.0303 | 1.00× | kein Gewinn auf GTX 1660 Ti |
| ONNX CUDA | 0.0263 | 1.15× | „Easy win" |
| ONNX optimiert | 0.0258 | 1.17× | Graph-Fusion |
| ONNX FP16 | 0.1170 | 0.26× | ohne Tensor Cores vermeiden |
| CTranslate2 INT8 | 0.0189 | 1.60× | gut fürs Deployment |
| **TensorRT FP16** | **0.0178** | **1.70×** | **bestes Resultat** |

---

## 4. Serving

Gewählt wurde **LitServe** (leichtgewichtiges Python-Serving-Framework) zusammen mit dem
TensorRT-optimierten Modell.

Architektur einer `TensorRTAPI(ls.LitAPI)`-Klasse:

| Methode | Aufgabe |
|---|---|
| `setup(device)` | ONNX-Modell mit TensorRT-Provider laden, Tokenizer für alle 11 Heads initialisieren |
| `decode_request` | Audio-Upload annehmen, mit `librosa` laden/vorverarbeiten, Features über HF-Processor extrahieren |
| `predict` | TensorRT-Inferenz ausführen, Logits für alle Heads zurückgeben |
| `encode_response` | CTC-Decoding pro Head, JSON zurückgeben |

**API-Aufruf:**

```bash
curl -X POST http://localhost:8000/predict -F "audio=@recitation.wav"
```

**Beispiel-Response (Auszug):**

```json
{
  "phonemes": "ءِنَلَاهَبِكُلِشَيءِنعَلِۦمُ",
  "ghonna": "[لا غنة][مغن][لا غنة]",
  "qalqla": "[لا قلقلة]"
}
```

---

## 5. „Dependency Hell" mit ONNX

Laut Autor hat das Auflösen von Versionskonflikten mehr Zeit gekostet als die Optimierung selbst:

- `librosa` zieht `numba` nach → beschränkt NumPy auf **≤ 2.0**
- `onnxruntime-gpu` will NumPy **≥ 2.1** → Downgrade bricht onnxruntime
- `ctranslate2`-Installation downgradet stillschweigend mehrere Pakete

**Das TensorRT-Desaster:** `uv pip install tensorrt` lud nach 12 Stunden noch immer.
Lösung war der NVIDIA-Paketindex — danach ca. 30 Minuten:

```bash
pip install tensorrt --extra-index-url https://pypi.nvidia.com
```

**Empfehlung des Autors:** getrennte virtuelle Umgebungen statt einer gemeinsamen.

---

## 6. Kernaussagen (Key Learnings)

1. **Hardware kennen** — ohne Tensor Cores (GTX 1660 Ti) schadet FP16 außerhalb von TensorRT.
2. **TensorRT bringt** auch auf Consumer-Karten spürbare Speedups.
3. **TensorRT-Engines immer cachen**, da der Build langsam ist.
4. **INT8 via CTranslate2** liefert guten Speedup bei geringem Genauigkeitsverlust.
5. **Messen statt annehmen** — profilieren.

Der Autor merkt abschließend an, dass weitere Optimierungsarbeit noch läuft.

---

## 7. Links zum Modell auf Hugging Face

### Hauptmodell

| Link | Beschreibung |
|---|---|
| <https://huggingface.co/obadx/muaalem-model-v3_2> | **Aktuelles Standardmodell** der API (`model_name_or_path`), ASR, 0.6 B Params, Klasse `Wav2Vec2BertForMultilevelCTC`, Tags: `arabic`, `multi_level_ctc`, `quran`, Lizenz MIT |
| <https://huggingface.co/obadx/muaalem-model-v3_0> | Version, die im README-Badge des Repos verlinkt ist |
| <https://huggingface.co/obadx/muaalem-model-v3_1> | Zwischenversion (0.6 B) |
| <https://huggingface.co/obadx/muaalem-model-v3> | v3-Basisversion (0.6 B) |
| <https://huggingface.co/obadx/muaalem-model-v3-mini> | kleinere Variante |
| <https://huggingface.co/obadx> | Profil des Autors — insgesamt 24 Modelle und 13 Datasets |

### Weitere Modellvarianten (Experimente / Deployment)

- <https://huggingface.co/obadx/muaalem-v3_2-torchscript> — TorchScript-Export
- <https://huggingface.co/obadx/muaalem-v3_2-torchscript-v1> — TorchScript-Export v1
- <https://huggingface.co/obadx/muaalem-streaming-rnn-v0> — Streaming-RNN-Variante
- <https://huggingface.co/obadx/muaalem-model-whisper-encoder-small> — Whisper-Encoder-Variante
- <https://huggingface.co/obadx/muaalem-model-w2v2-384> / <https://huggingface.co/obadx/muaalem-model-w2v2-384-tp> — Wav2Vec2-384-Varianten

### Basismodell

- <https://huggingface.co/facebook/w2v-bert-2.0> — **Basismodell**, auf dem Muaalem feingetunt wurde
- <https://huggingface.co/docs/transformers/model_doc/wav2vec2-bert> — Transformers-Doku zur Wav2Vec2-BERT-Architektur
- <https://huggingface.co/blog/fine-tune-w2v2-bert> — HF-Blog: Fine-Tuning von W2V2-BERT

### Datasets

| Link | Beschreibung |
|---|---|
| <https://huggingface.co/datasets/obadx/muaalem-annotated-v3> | Haupt-Trainingsdataset, ~287 k Zeilen |
| <https://huggingface.co/datasets/obadx/muaalem-annotated-compressed-v3> | komprimierte Variante |
| <https://huggingface.co/datasets/obadx/qdat> | QDAT-Datenbestand |
| <https://huggingface.co/datasets/obadx/qdat_bench> | Benchmark für Tajweed-Regeln |
| <https://huggingface.co/datasets/obadx/ood_muaalem_test> | Out-of-Distribution-Testset |
| <https://huggingface.co/datasets/obadx/recitation-segmentation> | Segmentierung von Rezitationen |
| <https://huggingface.co/datasets/obadx/recitation-segmentation-augmented> | augmentierte Variante |
| <https://huggingface.co/datasets/obadx/freesound-commercial-50k-noise-only> | Noise-Dataset (Augmentation) |

### Spaces (Demos)

- <https://huggingface.co/spaces/obadx/try-quran-muaalem> — „Try Quran Muaalem"
- <https://huggingface.co/spaces/obadx/qdat_bench_leaderboard> — Leaderboard für Tajweed-Benchmark

### Weiteres Modell aus der Datenpipeline

- <https://huggingface.co/tarteel-ai/whisper-base-ar-quran> — Transkriptionsmodell von Tarteel AI, in der Datenpipeline verwendet

---

## 8. Paper / Whitepaper

**Automatic Pronunciation Error Detection and Correction of the Holy Quran's Learners Using Deep Learning**
Abdullah Abdelfattah, Mahmoud I. Khalil, Hazem Abbas — eingereicht 27. August 2025.

- Abstract: <https://arxiv.org/abs/2509.00094>
- PDF: <https://arxiv.org/pdf/2509.00094>

Kernbeiträge des Papers:

1. Eine **zu 98 % automatisierte Pipeline** zum Aufbau von Quran-Datensätzen: Sammeln von
   Experten-Rezitationen, Splitten an Pausenstellen (*waqf*) mittels feingetuntem
   Wav2Vec2-BERT-Modell, Transkription und Verifikation über den **Tasmeea-Algorithmus**.
2. Ein Korpus mit **850+ Stunden Audio (~300 k annotierte Äußerungen)**.
3. Eine ASR-basierte Methode zur Aussprachefehler-Erkennung auf Basis eines eigenen
   **Quran Phonetic Script (QPS)**, das Tajweed-Regeln kodiert (statt IPA für MSA).
   QPS arbeitet zweistufig: **Phonem-Ebene** (arabische Buchstaben mit kurzen/langen Vokalen)
   und **Sifa-Ebene** (Artikulationseigenschaften pro Phonem).
4. Ein **neuartiges Multi-Level-CTC-Modell** mit **0.16 % durchschnittlicher Phoneme Error Rate
   (PER)** auf dem Testset. Code, Daten und Modelle sind Open Source.

**Grundlagen-Paper zur Architektur:**

- **W2v-BERT: Combining Contrastive Learning and Masked Language Modeling for Self-Supervised
  Speech Pre-Training** — Chung, Zhang, Han, Chiu, Qin, Pang, Wu (2021):
  <https://arxiv.org/abs/2108.06209>

---

## 9. Projekt-Seiten & Code

| Link | Beschreibung |
|---|---|
| <https://github.com/obadx/quran-muaalem> | **Haupt-Repo** „AI Teacher for the Holy Quran", MIT-Lizenz, 96 Stars / 33 Forks |
| <https://github.com/obadx/quran-muaalem/blob/main/README_EN.md> | englische README (Haupt-README ist arabisch) |
| <https://obadx.github.io/quran-muaalem/> | Projekt-Homepage / Doku |
| <https://pypi.org/project/quran-muaalem/> | PyPI-Paket |
| <https://www.youtube.com/watch?v=CsFoznO08-Q> | Video zum Projekt |
| <https://discord.gg/hJWW6fCH> | Discord-Community |

**Verwandte Projekte desselben Autors:**

- <https://github.com/obadx/quran-transcript>
- <https://github.com/obadx/prepare-quran-dataset>
- <https://github.com/obadx/recitations-segmenter>

**Installation (laut Repo):**

```bash
# Gradio-UI
pip install uv                      # oder: curl -LsSf https://astral.sh/uv/install.sh | sh
sudo apt-get install -y ffmpeg
uvx quran-muaalem[ui] quran-muaalem-ui

# Python-API
sudo apt-get install -y ffmpeg libsndfile1 portaudio19-dev
pip install quran-muaalem librosa "numba>=0.61.2"

# API-Server
uv add quran-muaalem[engine]
uv run quran-muaalem-engine   # Port 8000: /predict /health /docs /redoc
uv run quran-muaalem-app      # Port 8001: /search /correct-recitation /transcript /health /docs /redoc
```

Modellgröße ~660 M Parameter, ca. 1.5 GB GPU-Speicher, Default-dtype `torch.bfloat16`,
Audio muss **16 000 Hz** sein.

---

## 10. Referenzen aus dem Artikel

Die drei explizit im Artikel gelisteten Referenzen:

1. **TensorRT** — <https://developer.nvidia.com/tensorrt>
2. **Optimum** — <https://huggingface.co/docs/optimum/index>
3. **Muaalem** — <https://github.com/obadx/quran-muaalem>

### Verwendete Tools & Frameworks (mit Doku-Links)

| Tool | Link |
|---|---|
| NVIDIA TensorRT | <https://developer.nvidia.com/tensorrt> |
| ONNX | <https://onnx.ai/> |
| ONNX Runtime | <https://onnxruntime.ai/> |
| ONNX Runtime — CUDA EP | <https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html> |
| ONNX Runtime — TensorRT EP | <https://onnxruntime.ai/docs/execution-providers/TensorRT-ExecutionProvider.html> |
| CTranslate2 (Repo) | <https://github.com/OpenNMT/CTranslate2> |
| CTranslate2 (Doku) | <https://opennmt.net/CTranslate2/> |
| LitServe (Repo) | <https://github.com/Lightning-AI/LitServe> |
| LitServe (Doku) | <https://lightning.ai/docs/litserve/home> |
| `torch.compile` | <https://pytorch.org/docs/stable/generated/torch.compile.html> |
| HF Optimum | <https://huggingface.co/docs/optimum/index> |
| librosa | <https://librosa.org/doc/latest/index.html> |
| NVIDIA PyPI-Index | <https://pypi.nvidia.com> |

### Im Artikel genannte Organisationen

- **Tarteel AI** — <https://www.tarteel.ai/>
- **Quran Foundation** — <https://quran.foundation/>

### Autor des Artikels

- Blog: <https://kareemai.com/>
- GitHub: <https://github.com/abdelkareemkobo>
- YouTube: <https://www.youtube.com/@abdelkareemai>
- Telegram: <https://t.me/+xRY72sYuiwc0ZGY8>
- Upwork: <https://www.upwork.com/freelancers/~016a9fea792423bb9a>
- SoundCloud: <https://soundcloud.com/abdelkareem-elkhateb>
- GPUVec: <https://gpuvec.com>
- E-Mail: <mailto:kareem01095134688@gmail.com>

---

*Erstellt am 18. August 2026. Alle Links wurden zum Zeitpunkt der Erstellung auf Erreichbarkeit
geprüft (HTTP 200).*
