"""Arabic Pronunciation Assessment — Modal CPU/OpenVINO deployment.

OpenVINO performs the ASR forward on CPU. Torch remains for alignment and scoring.
Colab/ngrok/cloudflared entfernt; ersetzt durch Modal-nativen ASGI-Endpoint.

Deploy:
    modal deploy backend/asr_app.py
Dev-Loop (Auto-Reload, ephemere URL):
    modal serve backend/asr_app.py

Die ausgegebene URL (z. B. https://<org>--quran-asr-web.modal.run) traegst du
im App-Settings-Screen ein. Kein Tunnel, keine Rotation, kein Keepalive-Hack.
"""

from __future__ import annotations

import os

import modal

# ---------------------------------------------------------------------------
# Image / App / Volume
# ---------------------------------------------------------------------------

# Ohne gesetzte Umgebungsvariablen ist das hier exakt die Produktion.
# Mit ihnen laesst sich eine zweite, eigene Instanz daneben stellen, um Latenz
# zu messen, ohne die laufende App anzufassen:
#   ASR_APP_NAME=quran-asr-bench ASR_MIN_CONTAINERS=0 ASR_BENCH=1 \
#       modal deploy backend/asr_app.py
APP_NAME       = os.environ.get("ASR_APP_NAME", "quran-asr")
MIN_CONTAINERS = int(os.environ.get("ASR_MIN_CONTAINERS", "2"))
BENCH_DEPLOY   = os.environ.get("ASR_BENCH", "") == "1"

MODEL_ID      = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
OV_MODEL_DIR  = "/opt/models/wav2vec2_ar_fp32"
HF_CACHE      = "/root/.cache/huggingface"
AUTH_SECRET   = "quran-asr-auth"          # modal.Secret mit key AUTH_TOKEN

# CPU-Reservierung. Ohne cpu= gibt Modal 0.125 Kerne - der OpenVINO-Forward lief
# damit auf einem Achtel Kern, waehrend er mit 8 Threads rechnete. Bewusst ein
# Tupel und kein fester Wert: 1 Kern ist garantiert und wird bezahlt, bis zu 8
# Kerne werden genutzt wenn die Maschine sie frei hat. Ein festes cpu=4.0 wuerde
# bei min_containers=2 rund um die Uhr vier Kerne kosten.
CPU_REQUEST, CPU_LIMIT = 1.0, 8.0
MEMORY_MB = 4096

# Threads fuer den OpenVINO-Forward. Muss explizit in die Container-Umgebung,
# denn das Basis-Image setzt OMP_NUM_THREADS=1: die Kette in load()
# (OV_THREADS -> OMP_NUM_THREADS -> 4) waere sonst schon beim ersten gesetzten
# Wert fertig und der Forward liefe einthreadig, obwohl bis zu CPU_LIMIT Kerne
# bereitstehen. OpenVINO rechnet mit TBB, nicht mit OpenMP - der Wert, der
# zaehlt, ist INFERENCE_NUM_THREADS.
OV_THREADS = 4


def _preload_models() -> None:
    """Exportiert OpenVINO IR waehrend des Image-Builds."""
    import os
    os.environ["HF_HOME"] = HF_CACHE
    os.environ["TRANSFORMERS_CACHE"] = HF_CACHE
    from optimum.intel import OVModelForCTC
    from transformers import Wav2Vec2Processor
    processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
    model = OVModelForCTC.from_pretrained(MODEL_ID, export=True, compile=False)
    model.save_pretrained(OV_MODEL_DIR)
    processor.save_pretrained(OV_MODEL_DIR)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "optimum-intel[openvino]",
        "torch",
        "torchaudio",
        "transformers",
        "silero-vad",
        "pydub",
        "scipy",
        "numpy",
        "fastapi",
        "uvicorn[standard]",
        "python-multipart",
    )
    .env({"HF_HOME": HF_CACHE, "TRANSFORMERS_CACHE": HF_CACHE})
    .run_function(_preload_models)        # Modelle in Image-Layer einbrennen
    # Bewusst NACH run_function: eine Aenderung hier laesst den Modell-Layer
    # unberuehrt, der Export laeuft nicht erneut.
    .env({"OV_THREADS": str(OV_THREADS)})
)

app       = modal.App(APP_NAME)

# Die Mess-Instanz bekommt zusaetzlich ASR_BENCH=1 in die Container-Umgebung.
# Die Produktion kennt die Bench-Endpunkte deshalb gar nicht.
_SECRETS = [modal.Secret.from_name(AUTH_SECRET)]
if BENCH_DEPLOY:
    _SECRETS.append(modal.Secret.from_dict({"ASR_BENCH": "1"}))


def read_wav_pcm16(raw: bytes, sample_rate: int):
    """Liest 16-bit-PCM-WAV direkt - kein Codec, kein Resampling, kein torch.

    Genau das Format, das die App aufnimmt (16 kHz, mono, 16 bit). Trifft es
    nicht zu (falsche Rate, anderes Format, gar kein WAV), kommt None zurueck
    und der normale Decoder uebernimmt - alte App-Versionen im Feld senden
    weiter AAC/m4a und muessen weiter funktionieren.
    """
    import io
    import wave

    import numpy as np
    try:
        with wave.open(io.BytesIO(raw), "rb") as wf:
            if wf.getsampwidth() != 2 or wf.getframerate() != sample_rate:
                return None
            channels = wf.getnchannels()
            frames = wf.readframes(wf.getnframes())
    except Exception:
        return None
    if not frames:
        return None
    samples = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        usable = (samples.size // channels) * channels
        samples = samples[:usable].reshape(-1, channels).mean(axis=1)
    return np.ascontiguousarray(samples, dtype=np.float32)


# ---------------------------------------------------------------------------
# CPU-Container: OpenVINO-Forward, FastAPI HTTP + WebSocket.
# ---------------------------------------------------------------------------

@app.cls(
    image=image,
    secrets=_SECRETS,
    cpu=(CPU_REQUEST, CPU_LIMIT),     # reserviert 1 Kern, darf bis 8 nutzen.
    memory=MEMORY_MB,
    min_containers=MIN_CONTAINERS,    # 2 warm -> Redundanz + kein Single-Point-of-Failure.
    max_containers=50,                # Autoscale-Cap (Kostenbremse).
    buffer_containers=1,              # 1 vorgeheizt fuer Traffic-Spikes.
    scaledown_window=600,             # 10 min idle -> Container darf runterfahren.
    timeout=600,
    region="eu",                      # Latenz-Region: EU. Fuer US-User -> "us-east".
)
@modal.concurrent(max_inputs=1)  # Ein CPU-Forward pro Container vermeidet Request-Races.
class ASR:
    @modal.enter()
    def load(self):
        import io, os, re, threading, time, unicodedata
        from collections import deque
        from typing import Any, Dict, Iterator, List, Optional

        import numpy as np
        import openvino as ov
        import torch
        import torchaudio.functional as AF
        from pydub import AudioSegment
        from scipy.signal import butter, sosfiltfilt
        from silero_vad import load_silero_vad, get_speech_timestamps
        from transformers import Wav2Vec2Processor

        # in self ablegen -> spaeter im ASGI-App / WS-Handler verfuegbar
        self.np = np
        self.torch = torch
        self.AF = AF
        self.AudioSegment = AudioSegment
        self.get_speech_timestamps = get_speech_timestamps
        self.time = time
        self.unicodedata = unicodedata

        self.device = torch.device("cpu")
        self.SR = 16000
        self.USE_FP16 = False
        self.DTYPE = torch.float32

        # Threads bewusst NICHT aus os.cpu_count(): der Host hat viele Kerne, der
        # Container bekommt nur die reservierten (cpu=(1,8)). Mehr Threads als
        # verfuegbare Kerne heisst Kontextwechsel statt Rechenzeit.
        self.N_THREADS = max(
            1, int(os.environ.get("OV_THREADS") or os.environ.get("OMP_NUM_THREADS") or 4)
        )
        ov_config = {
            "PERFORMANCE_HINT": "LATENCY",
            "NUM_STREAMS": "1",
            "INFERENCE_NUM_THREADS": self.N_THREADS,
            "CACHE_DIR": os.environ.get("OV_CACHE_DIR", "/tmp/ov_cache"),
        }

        # --- Modelle laden -----------------------------------------------------
        self.asr_processor = Wav2Vec2Processor.from_pretrained(OV_MODEL_DIR)
        compiled = ov.Core().compile_model(
            f"{OV_MODEL_DIR}/openvino_model.xml", "CPU", ov_config
        )
        self._ov_request = compiled.create_infer_request()
        self._ov_input = compiled.input(0)
        self._ov_output = compiled.output(0)
        self._ov_lock = threading.Lock()
        self.ASR_VOCAB = self.asr_processor.tokenizer.get_vocab()
        self.ASR_BLANK_ID = self.asr_processor.tokenizer.pad_token_id
        self.vad_model = load_silero_vad()

        # Warm-up avoids model/shape compilation on the first child request.
        self._ov_request.infer({self._ov_input: np.zeros((1, 2 * self.SR), dtype=np.float32)})

        # --- Signalkette-Konstanten -------------------------------------------
        self._HPF_SOS = butter(2, 80.0, btype="highpass", fs=self.SR, output="sos")
        self._sosfiltfilt = sosfiltfilt

        # --- Linguistische Tabellen (identisch zum Notebook) ------------------
        self._TASHKEEL = set("ًٌٍَُِّْٰ")
        self._START_EQUIV = {ch: "اأإآ" for ch in "اأإآ"}
        self._END_EQUIV = {"ة": "ةه", "ه": "هة", "ى": "ىيا", "ي": "يى"}
        self._CONFUSABLES: Dict[str, str] = {
            "ت": "طثد", "ث": "تسذف", "ح": "هخع", "خ": "حغك",
            "د": "تضذ", "ذ": "دزثظ", "ر": "لغ", "ز": "ذسظ",
            "س": "صثزش", "ش": "سج", "ص": "سض", "ض": "دظص",
            "ط": "تضد", "ظ": "زذض", "ع": "ءأاه", "غ": "خقر",
            "ق": "كغخ", "ك": "قخج", "ل": "ر", "ه": "حة",
            "ء": "ع", "ج": "شك",
        }
        self._ID_TO_CHAR = {tid: c for c, tid in self.ASR_VOCAB.items()}
        self._LLR_K = 2.0

        # --- Limits / Timing ---------------------------------------------------
        self.MAX_AUDIO_BYTES = 3 * 1024 * 1024
        self.MAX_AYAH_AUDIO_BYTES = 8 * 1024 * 1024
        self.MIN_SAMPLES = int(0.15 * self.SR)
        self.WS_KEEPALIVE_SEC = 20
        self.WORD_STREAM_DELAY_SEC = 0.035
        # Stille vor und hinter der Aufnahme, damit CTC am Wortanfang und
        # Wortende nicht am Rand des Fensters klebt. 250 ms waren 500 ms Audio
        # ohne Inhalt pro Anfrage; 100 ms reichen fuer denselben Zweck.
        self.PAD_CONTEXT_MS = 100

        # In-Memory Log-Ring (fuer /logs).
        self._LOG_BUF = deque(maxlen=200)

    # -------------------- Logging (nur In-Memory, kein File) -----------------
    def _log(self, event: str, **kv):
        from datetime import datetime
        entry = {
            "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
            "event": event,
            **kv,
        }
        self._LOG_BUF.append(entry)
        print(f"[{entry['ts']}] {event}  " + " ".join(f"{k}={v}" for k, v in kv.items()), flush=True)

    # ================== Audio-Preprocessing (1:1 aus Notebook) ================
    def _decode_audio(self, raw: bytes):
        """Drei Wege, vom schnellsten zum langsamsten.

        1. 16-bit-PCM-WAV in 16 kHz -> direkt lesen (stdlib wave + numpy).
           Das schickt die App seit der Umstellung auf PCM-Aufnahme.
        2. torchaudio (libtorio) - nativer Decoder ohne Subprocess, deckt
           m4a/aac/wav ab, die alte App-Versionen senden.
        3. pydub -> startet einen ffmpeg-Prozess. Das kostet pro Anfrage
           mehrere hundert Millisekunden und wird deshalb geloggt
           ("decode_fallback"), damit sichtbar ist wie oft es passiert.
        """
        import io
        fast = read_wav_pcm16(raw, self.SR)
        if fast is not None:
            return fast
        try:
            import torchaudio
            wav_t, sr = torchaudio.load(io.BytesIO(raw))     # (channels, samples) float32
            if wav_t.shape[0] > 1:
                wav_t = wav_t.mean(dim=0, keepdim=True)
            if sr != self.SR:
                wav_t = self.AF.resample(wav_t, sr, self.SR)
            return wav_t.squeeze(0).contiguous().numpy().astype(self.np.float32)
        except Exception as e:
            self._log("decode_fallback", err=type(e).__name__, detail=str(e)[:120])
            seg = self.AudioSegment.from_file(io.BytesIO(raw))
            seg = seg.set_frame_rate(self.SR).set_channels(1).set_sample_width(2)
            return self.np.asarray(seg.get_array_of_samples(), dtype=self.np.float32) / 32768.0

    def _highpass(self, audio):
        return self._sosfiltfilt(self._HPF_SOS, audio).astype(self.np.float32)

    def _normalize_level(self, audio, target_dbfs: float = -20.0):
        np = self.np
        rms = float(np.sqrt(np.mean(audio ** 2)))
        if rms < 1e-6:
            return audio
        gain = 10.0 ** ((target_dbfs - 20.0 * np.log10(rms)) / 20.0)
        out = audio * gain
        peak = float(np.max(np.abs(out)))
        if peak > 0.99:
            out = out / peak * 0.99
        return out.astype(np.float32)

    def _gentle_trim(self, audio, pad_ms: int = 120):
        segs = self.get_speech_timestamps(
            self.torch.from_numpy(audio), self.vad_model,
            sampling_rate=self.SR, threshold=0.35,
        )
        if not segs:
            return audio
        pad = int(pad_ms * self.SR / 1000)
        start = max(0, segs[0]["start"] - pad)
        end = min(len(audio), segs[-1]["end"] + pad)
        return audio[start:end]

    def _pad_context(self, audio, ms: int | None = None):
        ms = self.PAD_CONTEXT_MS if ms is None else int(ms)
        if ms <= 0:
            return audio
        pad = self.np.zeros(int(ms * self.SR / 1000), dtype=self.np.float32)
        return self.np.concatenate([pad, audio, pad])

    def _preprocess(self, raw: bytes, trim: bool = True, pad_ms: int | None = None):
        audio = self._decode_audio(raw)
        audio = self._highpass(audio)
        audio = self._normalize_level(audio)
        if trim:
            audio = self._gentle_trim(audio)
        audio = self._pad_context(audio, pad_ms)
        return audio

    # =================== Scoring-Kern (1:1 aus Notebook) ======================
    def _strip_diacritics(self, text: str) -> str:
        nfd = self.unicodedata.normalize("NFD", text)
        return self.unicodedata.normalize(
            "NFC", "".join(c for c in nfd if c not in self._TASHKEEL)
        )

    def _analyze_target(self, word_original: str):
        """Parst Original-Wort (mit Diakritika) und liefert pro Konsonant seine
        Tashkeel-Marker. Ergebnis-Length == len(_strip_diacritics(word_original)).

        Jeder Eintrag: {char, shadda, sukun, madd}.
        - shadda = Verdopplung des Konsonanten (~2x Frame-Dauer erwartet).
        - sukun  = kein Vokal (~kurze Frame-Dauer erwartet).
        - madd   = Vokal-Verlaengerung: aktuelles Zeichen ist ا/و/ي und der
                   vorherige Konsonant hat den passenden Kurzvokal
                   (Fatha->ا, Kasra->ي, Damma->و). Erwartet lange Dauer.
        """
        # NFC -> NFD damit Kombinationszeichen separat auftauchen
        nfd = self.unicodedata.normalize("NFD", word_original)
        letters = []           # Liste von {char, marks:set}
        for ch in nfd:
            if ch in self._TASHKEEL:
                if letters:
                    letters[-1]["marks"].add(ch)
            else:
                letters.append({"char": ch, "marks": set()})
        result = []
        for i, item in enumerate(letters):
            ch = item["char"]
            marks = item["marks"]
            has_shadda = "ّ" in marks
            has_sukun  = "ْ" in marks
            is_madd    = False
            if i > 0 and ch in "اويٰ":
                prev_marks = letters[i - 1]["marks"]
                if ch in "اٰ" and "َ" in prev_marks:
                    is_madd = True
                elif ch == "ي" and "ِ" in prev_marks:
                    is_madd = True
                elif ch == "و" and "ُ" in prev_marks:
                    is_madd = True
            result.append({
                "char": ch, "shadda": has_shadda,
                "sukun": has_sukun, "madd": is_madd,
            })
        return result

    def _tajweed_for_letter(self, run_len: int, mean_len: float, meta: dict):
        """Duration-basierte Tashkeel/Tajweed-Bewertung fuer 1 Buchstaben.

        Kombiniert absolute Frame-Schwellen (robust gegen Sprechtempo) mit
        relativen Median-Vergleichen. 1 Frame ~ 20ms bei wav2vec2.

        Grenzen (fundamental):
          - Fatha/Kasra/Damma sind vom ASR-Modell nicht unterscheidbar.
          - Nur Duration-Signale (Shadda, Sukun, Madd) sind erkennbar.
        """
        if run_len <= 0:
            return 0.0, None
        ratio = run_len / max(mean_len, 1.0)

        # Shadda: Verdopplung -> lang. Absolut >=6 Frames (120ms) UND ratio>=1.6.
        if meta.get("shadda"):
            if run_len >= 6 and ratio >= 1.6:
                return 100.0, None
            # Kombinierter Penalty: je weiter unter Schwelle, desto niedriger.
            frame_score = float(self.np.clip(run_len / 6.0 * 100.0, 0, 100))
            ratio_score = float(self.np.clip((ratio - 0.8) / 0.8 * 100.0, 0, 100))
            score = min(frame_score, ratio_score)
            return score, ("shadda_fehlt" if score < 70 else None)

        # Sukun: kein Vokal -> kurz. Absolut <=3 Frames (60ms) UND ratio<=0.7.
        if meta.get("sukun"):
            if run_len <= 3 and ratio <= 0.7:
                return 100.0, None
            # Je laenger, desto schlechter (Vokal wurde hinzugefuegt).
            frame_score = float(self.np.clip((6 - run_len) / 3.0 * 100.0, 0, 100))
            ratio_score = float(self.np.clip((1.2 - ratio) / 0.5 * 100.0, 0, 100))
            score = min(frame_score, ratio_score)
            return score, ("sukun_ignoriert" if score < 70 else None)

        # Madd: Vokal-Verlaengerung. Absolut >=6 Frames (120ms).
        if meta.get("madd"):
            if run_len >= 6:
                return 100.0, None
            score = float(self.np.clip(run_len / 6.0 * 100.0, 0, 100))
            return score, ("madd_zu_kurz" if score < 70 else None)

        # Neutral: kein spezielles Zeichen -> voller Tajweed-Score.
        return 100.0, None

    def _equiv_ids(self, ch: str, pos: int, total: int):
        if pos == 0 and ch in self._START_EQUIV:
            alts = self._START_EQUIV[ch]
        elif pos == total - 1 and ch in self._END_EQUIV:
            alts = self._END_EQUIV[ch]
        else:
            alts = ch
        ids = [self.ASR_VOCAB[c] for c in alts if c in self.ASR_VOCAB]
        return ids or [self.ASR_VOCAB[ch]]

    def _confuse_ids(self, ch: str):
        alts = self._CONFUSABLES.get(ch, "")
        return [self.ASR_VOCAB[c] for c in alts if c in self.ASR_VOCAB]

    def _encode_target(self, word: str):
        ids = []
        for ch in word:
            tid = self.ASR_VOCAB.get(ch)
            if tid is None:
                raise ValueError(f"Zeichen {ch!r} nicht im ASR-Vokabular.")
            ids.append(tid)
        return ids

    def _run_asr(self, audio):
        torch = self.torch
        with torch.inference_mode():
            inputs = self.asr_processor(
                audio, sampling_rate=self.SR, return_tensors="np", padding=True
            )
            values = inputs.input_values.astype(self.np.float32, copy=False)
            with self._ov_lock:
                logits = self._ov_request.infer({self._ov_input: values})[self._ov_output].copy()
            logits = torch.from_numpy(logits)
            log_probs = torch.log_softmax(logits.float(), dim=-1).cpu()
            transcription = self.asr_processor.batch_decode(log_probs.argmax(dim=-1))[0]
        return log_probs, transcription

    def _runs_of_non_blank(self, tokens):
        runs, current, last = [], [], -1
        for t, tok in enumerate(tokens):
            if tok == self.ASR_BLANK_ID:
                if current:
                    runs.append(current); current = []
                last = -1
            elif tok != last:
                if current:
                    runs.append(current)
                current = [t]; last = tok
            else:
                current.append(t)
        if current:
            runs.append(current)
        return runs

    def _sigmoid(self, x: float) -> float:
        return 1.0 / (1.0 + float(self.np.exp(-x)))

    def _edit_ratio(self, expected: str, recognized: str) -> float:
        row = list(range(len(recognized) + 1))
        for expected_char in expected:
            previous, row = row, [0]
            for index, recognized_char in enumerate(recognized, 1):
                row.append(min(row[-1] + 1, previous[index] + 1,
                               previous[index - 1] + (expected_char != recognized_char)))
        return row[-1] / max(1, len(expected))

    def _gop_score(self, log_probs, target_word: str, phon_meta=None):
        np = self.np
        target_ids = self._encode_target(target_word)
        if not target_ids:
            return []
        if log_probs.shape[1] < len(target_ids):
            raise ValueError("Aufnahme zu kurz für dieses Wort.")
        targets = self.torch.tensor([target_ids], dtype=self.torch.int32)
        aligned, _ = self.AF.forced_align(log_probs, targets, blank=self.ASR_BLANK_ID)
        runs = self._runs_of_non_blank(aligned[0].tolist())
        predictions = log_probs.argmax(dim=-1)[0]
        total_len = len(target_word)
        run_lens = [len(r) for r in runs] if runs else [1]
        mean_len = float(np.median(run_lens)) if run_lens else 1.0
        results = []
        for i, ch in enumerate(target_word):
            if i >= len(runs):
                results.append({"label": ch, "recognized": None, "match": False, "score": 0.0, "confidence": 0.0,
                                "llr": -5.0, "error_hint": None,
                                "articulation": 0.0, "tajweed": 0.0, "duration_ms": 0})
                continue
            frames = runs[i]
            lp_frame = log_probs[0, frames]
            recognized_id = int(predictions[frames].bincount(minlength=log_probs.shape[-1]).argmax())
            recognized = self._ID_TO_CHAR.get(recognized_id)

            equiv_ids = self._equiv_ids(ch, i, total_len)
            target_lp = lp_frame[:, equiv_ids].max(dim=-1).values.mean().item()
            post_score = float(np.clip((target_lp + 3.0) / 3.0 * 100, 0, 100))
            conf = float(np.exp(target_lp))

            confuse_ids = self._confuse_ids(ch)
            if confuse_ids:
                per_frame_conf = lp_frame[:, confuse_ids]
                best_conf_lp = per_frame_conf.max(dim=-1).values.mean().item()
                llr = target_lp - best_conf_lp
                llr_score = self._sigmoid(self._LLR_K * llr) * 100.0
                if llr < 0:
                    best_col = int(per_frame_conf.mean(dim=0).argmax().item())
                    error_hint = self._ID_TO_CHAR.get(confuse_ids[best_col])
                else:
                    error_hint = None
            else:
                llr, llr_score, error_hint = 5.0, 100.0, None

            articulation = 0.4 * post_score + 0.6 * llr_score

            # Tashkeel / Tajweed via Frame-Dauer
            meta_i = phon_meta[i] if (phon_meta and i < len(phon_meta)) else {}
            tajweed_score, tajweed_hint = self._tajweed_for_letter(
                len(frames), mean_len, meta_i)

            # Konsonant-Fehler-Hint hat Vorrang, sonst Tajweed-Hint
            hint_final = error_hint if error_hint else tajweed_hint

            final = 0.75 * articulation + 0.25 * tajweed_score
            equiv_chars = {self._ID_TO_CHAR.get(tid) for tid in equiv_ids}
            match = recognized in equiv_chars
            results.append({
                "label": ch, "recognized": recognized, "match": match,
                "score": float(np.clip(final, 0, 100)),
                "confidence": conf,
                "llr": float(llr),
                "error_hint": hint_final or (recognized if recognized and not match else None),
                "articulation": float(np.clip(articulation, 0, 100)),
                "tajweed": float(np.clip(tajweed_score, 0, 100)),
                "duration_ms": int(len(frames) * 20),
            })
        return results

    def _score_word(self, raw: bytes, target: str, pad_ms: int | None = None):
        from fastapi import HTTPException
        if len(raw) > self.MAX_AUDIO_BYTES:
            raise HTTPException(413, f"Audio > {self.MAX_AUDIO_BYTES // 1024} KB.")
        if not raw:
            raise HTTPException(400, "Leere Audiodatei.")
        t_pre = self.time.perf_counter()
        try:
            # Client-Recorder endpointed schon via metering -> kein Silero-VAD noetig.
            wav = self._preprocess(raw, trim=False, pad_ms=pad_ms)
        except Exception as e:
            raise HTTPException(400, f"Audio ungültig: {e}")
        if wav.size < self.MIN_SAMPLES:
            raise HTTPException(400, "Aufnahme zu kurz.")
        dt_pre = int((self.time.perf_counter() - t_pre) * 1000)

        target_clean = self._strip_diacritics(target)
        phon_meta = self._analyze_target(target)

        t_asr = self.time.perf_counter()
        log_probs, transcription = self._run_asr(wav)
        dt_asr = int((self.time.perf_counter() - t_asr) * 1000)

        t_score = self.time.perf_counter()
        units = self._gop_score(log_probs, target_clean, phon_meta=phon_meta)
        recognized_clean = self._strip_diacritics(transcription.replace(" ", ""))
        recognition_penalty = max(0.15, 1.0 - 0.75 * self._edit_ratio(target_clean, recognized_clean))
        units = [{**unit, "score": float(unit["score"] * recognition_penalty)} for unit in units]
        total = float(self.np.mean([u["score"] for u in units])) if units else 0.0
        dt_score = int((self.time.perf_counter() - t_score) * 1000)

        return {
            "target": target_clean,
            "transcription": transcription,
            "units": units,
            "total": total,
            "timings": {
                "audio_bytes": len(raw),
                "audio_samples": int(wav.size),
                "audio_ms": int(wav.size * 1000 / self.SR),
                "preprocess_ms": dt_pre,
                "asr_ms": dt_asr,
                "score_ms": dt_score,
            },
        }

    def _score_ayah_streamed(self, raw: bytes, ayah_text: str):
        from fastapi import HTTPException
        np = self.np
        if len(raw) > self.MAX_AYAH_AUDIO_BYTES:
            raise HTTPException(413, f"Audio > {self.MAX_AYAH_AUDIO_BYTES // 1024} KB.")
        if not raw:
            raise HTTPException(400, "Leere Audiodatei.")

        raw_words = [w for w in ayah_text.split() if w.strip()]
        if not raw_words:
            raise HTTPException(400, "Ayah-Text leer.")
        words_clean = [self._strip_diacritics(w) for w in raw_words]
        # Original-Woerter parallel behalten fuer Tashkeel-/Tajweed-Analyse.
        raw_words_kept = [orig for orig, clean in zip(raw_words, words_clean) if clean]
        words_clean = [w for w in words_clean if w]
        if not words_clean:
            raise HTTPException(400, "Ayah-Text enthaelt keine bewertbaren Zeichen.")

        # Tashkeel-Analyse pro Wort (Reihenfolge synchron zu words_clean).
        phon_meta_per_word = [self._analyze_target(w) for w in raw_words_kept]

        all_chars, word_spans = [], []
        for w in words_clean:
            s = len(all_chars)
            all_chars.extend(list(w))
            word_spans.append((s, len(all_chars)))

        target_ids = []
        for ch in all_chars:
            tid = self.ASR_VOCAB.get(ch)
            if tid is None:
                raise HTTPException(400, f"Zeichen {ch!r} nicht im ASR-Vokabular.")
            target_ids.append(tid)

        t_pre = self.time.perf_counter()
        try:
            # Client-Recorder endpointed die Ayah (700ms Silence) -> kein Silero-VAD noetig.
            wav = self._preprocess(raw, trim=False)
        except Exception as e:
            raise HTTPException(400, f"Audio ungueltig: {e}")
        if wav.size < self.MIN_SAMPLES:
            raise HTTPException(400, "Aufnahme zu kurz.")
        dt_pre = int((self.time.perf_counter() - t_pre) * 1000)

        t_asr = self.time.perf_counter()
        log_probs, transcription = self._run_asr(wav)
        dt_asr = int((self.time.perf_counter() - t_asr) * 1000)

        if log_probs.shape[1] < len(target_ids):
            raise HTTPException(400, "Aufnahme zu kurz fuer diese Ayah.")

        t_align = self.time.perf_counter()
        targets = self.torch.tensor([target_ids], dtype=self.torch.int32)
        aligned, _ = self.AF.forced_align(log_probs, targets, blank=self.ASR_BLANK_ID)
        runs = self._runs_of_non_blank(aligned[0].tolist())
        dt_align = int((self.time.perf_counter() - t_align) * 1000)

        yield {
            "kind": "start",
            "words_count": len(words_clean),
            "transcription": transcription,
        }

        t_score = self.time.perf_counter()
        # Median-Framedauer aller Buchstaben als Referenz fuer Tashkeel-Checks.
        run_lens_all = [len(r) for r in runs] if runs else [1]
        mean_len_ayah = float(np.median(run_lens_all)) if run_lens_all else 1.0
        per_word_scores = []
        for wi, (start_c, end_c) in enumerate(word_spans):
            word = words_clean[wi]
            word_len = end_c - start_c
            phon_meta_word = phon_meta_per_word[wi] if wi < len(phon_meta_per_word) else []
            char_units = []
            for local_i, char_global_i in enumerate(range(start_c, end_c)):
                ch = all_chars[char_global_i]
                if char_global_i >= len(runs):
                    char_units.append({"label": ch, "score": 0.0, "confidence": 0.0,
                                       "llr": -5.0, "error_hint": None,
                                       "articulation": 0.0, "tajweed": 0.0, "duration_ms": 0})
                    continue
                frames = runs[char_global_i]
                lp_frame = log_probs[0, frames]
                equiv_ids = self._equiv_ids(ch, local_i, word_len)
                target_lp = lp_frame[:, equiv_ids].max(dim=-1).values.mean().item()
                post_score = float(np.clip((target_lp + 3.0) / 3.0 * 100, 0, 100))
                conf = float(np.exp(target_lp))

                confuse_ids = self._confuse_ids(ch)
                if confuse_ids:
                    per_frame_conf = lp_frame[:, confuse_ids]
                    best_conf_lp = per_frame_conf.max(dim=-1).values.mean().item()
                    llr = target_lp - best_conf_lp
                    llr_score = self._sigmoid(self._LLR_K * llr) * 100.0
                    if llr < 0:
                        best_col = int(per_frame_conf.mean(dim=0).argmax().item())
                        error_hint = self._ID_TO_CHAR.get(confuse_ids[best_col])
                    else:
                        error_hint = None
                else:
                    llr, llr_score, error_hint = 5.0, 100.0, None

                articulation = 0.4 * post_score + 0.6 * llr_score
                meta_i = phon_meta_word[local_i] if local_i < len(phon_meta_word) else {}
                tajweed_score, tajweed_hint = self._tajweed_for_letter(
                    len(frames), mean_len_ayah, meta_i)
                hint_final = error_hint if error_hint else tajweed_hint
                final = 0.75 * articulation + 0.25 * tajweed_score
                char_units.append({
                    "label": ch,
                    "score": float(np.clip(final, 0, 100)),
                    "confidence": conf,
                    "llr": float(llr),
                    "error_hint": hint_final,
                    "articulation": float(np.clip(articulation, 0, 100)),
                    "tajweed": float(np.clip(tajweed_score, 0, 100)),
                    "duration_ms": int(len(frames) * 20),
                })

            char_scores = [u["score"] for u in char_units]
            mean_s = float(np.mean(char_scores)) if char_scores else 0.0
            min_s = float(np.min(char_scores)) if char_scores else 0.0
            word_score = float(np.clip(0.75 * mean_s + 0.25 * min_s, 0, 100))
            per_word_scores.append(word_score)

            yield {
                "kind": "word",
                "word_idx": wi,
                "target": word,
                "score": word_score,
                "units": char_units,
            }

        total = float(np.mean(per_word_scores)) if per_word_scores else 0.0
        dt_score = int((self.time.perf_counter() - t_score) * 1000)
        yield {
            "kind": "done",
            "total": total,
            "words_count": len(words_clean),
            "timings": {
                "audio_bytes": len(raw),
                "audio_samples": int(wav.size),
                "audio_ms": int(wav.size * 1000 / self.SR),
                "preprocess_ms": dt_pre,
                "asr_ms": dt_asr,
                "align_ms": dt_align,
                "score_ms": dt_score,
            },
        }

    # ==================== ASGI-App (HTTP + WebSocket) =========================
    @modal.asgi_app()
    def web(self):
        import asyncio, json, os
        from typing import Dict, List, Optional
        from fastapi import (
            Depends, FastAPI, File, Form, Header, HTTPException, UploadFile,
            WebSocket, WebSocketDisconnect, status,
        )
        from fastapi.middleware.cors import CORSMiddleware
        from pydantic import BaseModel

        # `from __future__ import annotations` (module top) macht Annotationen zu Strings.
        # FastAPI resolved sie via get_type_hints() gegen die MODUL-globals, nicht die
        # lokalen Namen dieser Methode. Deshalb hier UploadFile & Co. in globals() legen.
        globals().update({
            "UploadFile": UploadFile,
            "WebSocket": WebSocket,
            "Optional": Optional,
            "str": str,
        })

        AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "").strip()
        # Nur die Mess-Instanz setzt ASR_BENCH=1 (ueber ein eigenes Secret beim
        # Deploy). In der Produktion ist BENCH False und /bench/* existiert nicht.
        BENCH = os.environ.get("ASR_BENCH", "") == "1"

        def require_bearer(authorization: str = Header(default="")) -> None:
            if not AUTH_TOKEN:                              # Secret leer -> Auth aus.
                return
            if not authorization.startswith("Bearer "):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
            if authorization[len("Bearer "):].strip() != AUTH_TOKEN:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid bearer token")

        class Unit(BaseModel):
            label: str
            recognized: Optional[str] = None
            match: bool = False
            score: float
            confidence: float
            llr: Optional[float] = None
            error_hint: Optional[str] = None

        class AssessResponse(BaseModel):
            target: str
            transcription: str
            units: List[Unit]
            total: float
            duration_ms: int
            timings: Optional[Dict[str, int]] = None

        api = FastAPI(title="Arabic Pronunciation API", version="2.0.0-modal")
        api.add_middleware(
            CORSMiddleware,
            allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
        )

        @api.get("/health")
        def health():
            return {
                "status": "ok",
                "device": str(self.device),
                "asr_model": MODEL_ID,
                "vad": "Silero VAD 5",
                "fp16": self.USE_FP16,
                "openvino_threads": self.N_THREADS,
                # Damit eine Messung belegen kann, gegen welchen Stand sie lief.
                "cpu_visible": os.cpu_count(),
                "pad_context_ms": self.PAD_CONTEXT_MS,
                "bench": BENCH,
                "endpoints": ["/assess (HTTP)", "/stream (WebSocket)", "/logs"],
            }

        @api.get("/logs")
        def get_logs(n: int = 50):
            n = max(1, min(int(n), self._LOG_BUF.maxlen or 200))
            entries = list(self._LOG_BUF)[-n:][::-1]
            return {"count": len(entries), "entries": entries}

        @api.post("/assess", dependencies=[Depends(require_bearer)])
        def assess(audio: UploadFile = File(...), target: str = Form(...)):
            target = target.strip()
            if not target:
                raise HTTPException(400, "Zielwort fehlt.")
            t0 = self.time.perf_counter()
            raw = audio.file.read(self.MAX_AUDIO_BYTES + 1)
            try:
                result = self._score_word(raw, target)
            except ValueError as e:
                raise HTTPException(400, str(e))
            result["duration_ms"] = int((self.time.perf_counter() - t0) * 1000)
            return result

        if BENCH:
            # Messendpunkt, nur auf der Bench-Instanz. Bewertet dieselbe Aufnahme
            # mit mehreren Padding-Laengen, damit belegbar ist, dass die Kuerzung
            # von 250 ms auf 100 ms die Punktzahl nicht verschiebt.
            @api.post("/bench/pad", dependencies=[Depends(require_bearer)])
            def bench_pad(
                audio: UploadFile = File(...),
                target: str = Form(...),
                pads: str = Form("250,100"),
            ):
                target = target.strip()
                if not target:
                    raise HTTPException(400, "Zielwort fehlt.")
                raw = audio.file.read(self.MAX_AUDIO_BYTES + 1)
                runs = []
                for value in [p.strip() for p in pads.split(",") if p.strip()]:
                    pad_ms = int(value)
                    t0 = self.time.perf_counter()
                    try:
                        result = self._score_word(raw, target, pad_ms=pad_ms)
                    except ValueError as e:
                        raise HTTPException(400, str(e))
                    runs.append({
                        "pad_ms": pad_ms,
                        "total": result["total"],
                        "transcription": result["transcription"],
                        "duration_ms": int((self.time.perf_counter() - t0) * 1000),
                        "timings": result["timings"],
                        "units": [
                            {"label": u["label"], "score": u["score"]} for u in result["units"]
                        ],
                    })
                return {"target": target, "bytes": len(raw), "runs": runs}

        @api.websocket("/stream")
        async def stream_ws(ws: WebSocket):
            if AUTH_TOKEN:
                token = ws.query_params.get("token", "")
                if token != AUTH_TOKEN:
                    await ws.close(code=status.WS_1008_POLICY_VIOLATION)
                    return
            await ws.accept()
            self._log("ws_open", client=ws.client.host if ws.client else "?")

            async def keepalive():
                try:
                    while True:
                        await asyncio.sleep(self.WS_KEEPALIVE_SEC)
                        await ws.send_json({"ping": True})
                except Exception:
                    return

            ka_task = asyncio.create_task(keepalive())

            try:
                while True:
                    ctrl = json.loads(await ws.receive_text())
                    mode = str(ctrl.get("mode", "word")).lower()

                    if mode == "ayah":
                        ayah = str(ctrl.get("ayah", "")).strip()
                        if not ayah:
                            await ws.send_json({"error": "Ayah-Text fehlt."})
                            continue
                        t_ctrl = self.time.perf_counter()
                        msg = await ws.receive()
                        if "bytes" not in msg or msg["bytes"] is None:
                            await ws.send_json({"error": "Erwartete Binaerdaten (Audio)."})
                            continue
                        raw: bytes = msg["bytes"]
                        dt_bytes_ms = int((self.time.perf_counter() - t_ctrl) * 1000)
                        t0 = self.time.perf_counter()
                        try:
                            frames = await asyncio.to_thread(
                                lambda: list(self._score_ayah_streamed(raw, ayah))
                            )
                        except HTTPException as e:
                            self._log("ayah_err", detail=e.detail, bytes=len(raw))
                            await ws.send_json({"error": e.detail}); continue
                        except ValueError as e:
                            self._log("ayah_err", detail=str(e), bytes=len(raw))
                            await ws.send_json({"error": str(e)}); continue
                        except Exception as e:
                            self._log("ayah_err", detail=str(e), bytes=len(raw))
                            await ws.send_json({"error": f"Serverfehler: {e}"}); continue

                        dt_compute = int((self.time.perf_counter() - t0) * 1000)
                        t_stream = self.time.perf_counter()
                        for f in frames:
                            if f.get("kind") == "done":
                                f["duration_ms"] = int((self.time.perf_counter() - t0) * 1000)
                                f.setdefault("timings", {})["bytes_recv_ms"] = dt_bytes_ms
                            await ws.send_json(f)
                            if f.get("kind") == "word":
                                await asyncio.sleep(self.WORD_STREAM_DELAY_SEC)
                        dt_stream = int((self.time.perf_counter() - t_stream) * 1000)

                        done = next((f for f in frames if f.get("kind") == "done"), {})
                        t = done.get("timings", {})
                        self._log("ayah",
                                  words=done.get("words_count"),
                                  total=round(done.get("total", 0), 1),
                                  bytes=len(raw),
                                  audio_ms=t.get("audio_ms"),
                                  recv=dt_bytes_ms,
                                  pre=t.get("preprocess_ms"),
                                  asr=t.get("asr_ms"),
                                  align=t.get("align_ms"),
                                  score=t.get("score_ms"),
                                  stream=dt_stream,
                                  compute=dt_compute)
                        continue

                    # ---- Einzelwort-Modus (backwards compatible) ----
                    target = str(ctrl.get("target", "")).strip()
                    if not target:
                        await ws.send_json({"error": "Zielwort fehlt."})
                        continue
                    msg = await ws.receive()
                    if "bytes" not in msg or msg["bytes"] is None:
                        await ws.send_json({"error": "Erwartete Binaerdaten (Audio)."})
                        continue
                    raw: bytes = msg["bytes"]
                    t0 = self.time.perf_counter()
                    try:
                        result = await asyncio.to_thread(self._score_word, raw, target)
                    except HTTPException as e:
                        await ws.send_json({"error": e.detail}); continue
                    except ValueError as e:
                        await ws.send_json({"error": str(e)}); continue
                    except Exception as e:
                        await ws.send_json({"error": f"Serverfehler: {e}"}); continue
                    result["duration_ms"] = int((self.time.perf_counter() - t0) * 1000)
                    await ws.send_json(result)
            except WebSocketDisconnect:
                self._log("ws_close", reason="disconnect")
                return
            except Exception as e:
                self._log("ws_close", reason=f"exception:{e}")
                try:
                    await ws.send_json({"error": f"Serverfehler: {e}"})
                except Exception:
                    pass
            finally:
                ka_task.cancel()

        return api
