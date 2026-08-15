"""Arabic Pronunciation Assessment — Modal-Deployment.

1:1-Port aus wav2vec2_arabic_pronunciation.ipynb.
Scoring-Logik (GOP + LLR + forced_align + Ayah-Streaming) unveraendert.
Colab/ngrok/cloudflared entfernt; ersetzt durch Modal-nativen ASGI-Endpoint.

Deploy:
    modal deploy backend/asr_app.py
Dev-Loop (Auto-Reload, ephemere URL):
    modal serve backend/asr_app.py

Die ausgegebene URL (z. B. https://<org>--quran-asr-web.modal.run) traegst du
im App-Settings-Screen ein. Kein Tunnel, keine Rotation, kein Keepalive-Hack.
"""

from __future__ import annotations

import modal

# ---------------------------------------------------------------------------
# Image / App / Volume
# ---------------------------------------------------------------------------

APP_NAME      = "quran-asr"
MODEL_ID      = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
HF_CACHE      = "/root/.cache/huggingface"
AUTH_SECRET   = "quran-asr-auth"          # modal.Secret mit key AUTH_TOKEN


def _preload_models() -> None:
    """Laedt HF-Modelle waehrend Image-Build in die Layer.

    Ergebnis: `.from_pretrained(...)` bei Container-Start liest nur noch von
    lokaler Disk (kein HF-Hit), Cold-Start faellt ~30-40s -> ~5-8s.
    Silero-VAD ist als Asset im Pip-Wheel enthalten, braucht keinen Preload.
    """
    import os
    os.environ["HF_HOME"] = HF_CACHE
    os.environ["TRANSFORMERS_CACHE"] = HF_CACHE
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
    Wav2Vec2Processor.from_pretrained(MODEL_ID)
    Wav2Vec2ForCTC.from_pretrained(MODEL_ID)


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.4.1",
        "torchaudio==2.4.1",
        "transformers==4.44.2",
        "silero-vad==5.1.2",
        "pydub==0.25.1",
        "scipy==1.14.1",
        "numpy==1.26.4",
        "soundfile==0.12.1",
        "fastapi==0.115.0",
        "uvicorn[standard]==0.30.6",
        "python-multipart==0.0.9",
    )
    .env({"HF_HOME": HF_CACHE, "TRANSFORMERS_CACHE": HF_CACHE})
    .run_function(_preload_models)        # Modelle in Image-Layer einbrennen
)

app       = modal.App(APP_NAME)


# ---------------------------------------------------------------------------
# GPU-Container: laedt Modelle einmal, serviert FastAPI (HTTP + WebSocket).
# ---------------------------------------------------------------------------

@app.cls(
    gpu="A10G",                       # ~60% schneller als L4 bei ~gleichem Preis.
    image=image,
    secrets=[modal.Secret.from_name(AUTH_SECRET)],
    min_containers=2,                 # 2 warm -> Redundanz + kein Single-Point-of-Failure.
    max_containers=50,                # Autoscale-Cap (Kostenbremse).
    buffer_containers=1,              # 1 vorgeheizt fuer Traffic-Spikes.
    scaledown_window=600,             # 10 min idle -> Container darf runterfahren.
    timeout=600,
    region="eu",                      # Latenz-Region: EU. Fuer US-User -> "us-east".
)
@modal.concurrent(max_inputs=1)  # 1 GPU-Forward pro Container -> keine Race auf Model-Weights.
class ASR:
    @modal.enter()
    def load(self):
        import io, os, re, time, unicodedata
        from collections import deque
        from typing import Any, Dict, Iterator, List, Optional

        import numpy as np
        import torch
        import torchaudio.functional as AF
        from pydub import AudioSegment
        from scipy.signal import butter, sosfiltfilt
        from silero_vad import load_silero_vad, get_speech_timestamps
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

        # in self ablegen -> spaeter im ASGI-App / WS-Handler verfuegbar
        self.np = np
        self.torch = torch
        self.AF = AF
        self.AudioSegment = AudioSegment
        self.get_speech_timestamps = get_speech_timestamps
        self.time = time
        self.unicodedata = unicodedata

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.SR = 16000
        self.USE_FP16 = self.device.type == "cuda"
        self.DTYPE = torch.float16 if self.USE_FP16 else torch.float32

        # --- Modelle laden -----------------------------------------------------
        self.asr_processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
        self.asr_model = (
            Wav2Vec2ForCTC.from_pretrained(MODEL_ID)
            .to(device=self.device, dtype=self.DTYPE)
            .eval()
        )
        self.ASR_VOCAB = self.asr_processor.tokenizer.get_vocab()
        self.ASR_BLANK_ID = self.asr_model.config.pad_token_id
        self.vad_model = load_silero_vad()

        # --- Warm-up (2s Null-Audio, damit CUDA-JIT nicht ersten Call bremst) -
        with torch.inference_mode():
            _ = self.asr_model(
                torch.zeros(1, 2 * self.SR, device=self.device, dtype=self.DTYPE)
            ).logits

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
        """Native decode via torchaudio (libtorio) - kein ffmpeg-Subprocess.

        Fallback auf pydub (startet ffmpeg-Prozess) fuer Formate die libtorio
        nicht kennt. Auf typischen Handy-Uploads (m4a/aac/wav) ~10x schneller
        als pydub, weil kein Subprocess-Boot noetig ist.
        """
        import io
        try:
            import torchaudio
            wav_t, sr = torchaudio.load(io.BytesIO(raw))     # (channels, samples) float32
            if wav_t.shape[0] > 1:
                wav_t = wav_t.mean(dim=0, keepdim=True)
            if sr != self.SR:
                wav_t = self.AF.resample(wav_t, sr, self.SR)
            return wav_t.squeeze(0).contiguous().numpy().astype(self.np.float32)
        except Exception:
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

    def _pad_context(self, audio, ms: int = 250):
        pad = self.np.zeros(int(ms * self.SR / 1000), dtype=self.np.float32)
        return self.np.concatenate([pad, audio, pad])

    def _preprocess(self, raw: bytes, trim: bool = True):
        audio = self._decode_audio(raw)
        audio = self._highpass(audio)
        audio = self._normalize_level(audio)
        if trim:
            audio = self._gentle_trim(audio)
        audio = self._pad_context(audio)
        return audio

    # =================== Scoring-Kern (1:1 aus Notebook) ======================
    def _strip_diacritics(self, text: str) -> str:
        nfd = self.unicodedata.normalize("NFD", text)
        return self.unicodedata.normalize(
            "NFC", "".join(c for c in nfd if c not in self._TASHKEEL)
        )

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
                audio, sampling_rate=self.SR, return_tensors="pt", padding=True
            )
            input_values = inputs.input_values.to(device=self.device, dtype=self.DTYPE)
            logits = self.asr_model(input_values).logits
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

    def _gop_score(self, log_probs, target_word: str):
        np = self.np
        target_ids = self._encode_target(target_word)
        if not target_ids:
            return []
        if log_probs.shape[1] < len(target_ids):
            raise ValueError("Aufnahme zu kurz für dieses Wort.")
        targets = self.torch.tensor([target_ids], dtype=self.torch.int32)
        aligned, _ = self.AF.forced_align(log_probs, targets, blank=self.ASR_BLANK_ID)
        runs = self._runs_of_non_blank(aligned[0].tolist())
        total_len = len(target_word)
        results = []
        for i, ch in enumerate(target_word):
            if i >= len(runs):
                results.append({"label": ch, "score": 0.0, "confidence": 0.0,
                                "llr": -5.0, "error_hint": None})
                continue
            frames = runs[i]
            lp_frame = log_probs[0, frames]

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

            final = 0.4 * post_score + 0.6 * llr_score
            results.append({
                "label": ch,
                "score": float(np.clip(final, 0, 100)),
                "confidence": conf,
                "llr": float(llr),
                "error_hint": error_hint,
            })
        return results

    def _score_word(self, raw: bytes, target: str):
        from fastapi import HTTPException
        if len(raw) > self.MAX_AUDIO_BYTES:
            raise HTTPException(413, f"Audio > {self.MAX_AUDIO_BYTES // 1024} KB.")
        if not raw:
            raise HTTPException(400, "Leere Audiodatei.")
        t_pre = self.time.perf_counter()
        try:
            # Client-Recorder endpointed schon via metering -> kein Silero-VAD noetig.
            wav = self._preprocess(raw, trim=False)
        except Exception as e:
            raise HTTPException(400, f"Audio ungültig: {e}")
        if wav.size < self.MIN_SAMPLES:
            raise HTTPException(400, "Aufnahme zu kurz.")
        dt_pre = int((self.time.perf_counter() - t_pre) * 1000)

        target_clean = self._strip_diacritics(target)

        t_asr = self.time.perf_counter()
        log_probs, transcription = self._run_asr(wav)
        dt_asr = int((self.time.perf_counter() - t_asr) * 1000)

        t_score = self.time.perf_counter()
        units = self._gop_score(log_probs, target_clean)
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
        words_clean = [w for w in words_clean if w]
        if not words_clean:
            raise HTTPException(400, "Ayah-Text enthaelt keine bewertbaren Zeichen.")

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
        per_word_scores = []
        for wi, (start_c, end_c) in enumerate(word_spans):
            word = words_clean[wi]
            word_len = end_c - start_c
            char_units = []
            for local_i, char_global_i in enumerate(range(start_c, end_c)):
                ch = all_chars[char_global_i]
                if char_global_i >= len(runs):
                    char_units.append({"label": ch, "score": 0.0, "confidence": 0.0,
                                       "llr": -5.0, "error_hint": None})
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

                final = 0.4 * post_score + 0.6 * llr_score
                char_units.append({
                    "label": ch,
                    "score": float(np.clip(final, 0, 100)),
                    "confidence": conf,
                    "llr": float(llr),
                    "error_hint": error_hint,
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
        from typing import List, Optional
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

        def require_bearer(authorization: str = Header(default="")) -> None:
            if not AUTH_TOKEN:                              # Secret leer -> Auth aus.
                return
            if not authorization.startswith("Bearer "):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
            if authorization[len("Bearer "):].strip() != AUTH_TOKEN:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid bearer token")

        class Unit(BaseModel):
            label: str
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
