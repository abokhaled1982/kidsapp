"""ONNX INT8 Scoring Engine — unveraenderte GOP-Logik, ohne Audio-Decode.

Wird von livekit_agent.py importiert. Keine Modal-Abhaengigkeit hier.
"""

from __future__ import annotations


class ScoringEngine:
    """ONNX INT8 wav2vec2 + GOP-Scoring.

    Identische Scoring-Logik wie ASR-Klasse in asr_app.py, aber:
    - Kein _decode_audio (LiveKit liefert PCM)
    - Kein _normalize_level (LiveKit Signal ist clean)
    - ONNX Runtime statt OpenVINO
    """

    def __init__(self, model_dir: str, n_threads: int = 8):
        import numpy as np
        import onnxruntime as ort
        import torch
        import torchaudio.functional as AF
        from scipy.signal import butter, sosfiltfilt
        from transformers import Wav2Vec2Processor

        self.np = np
        self.torch = torch
        self.AF = AF
        self.SR = 16000

        # --- ONNX Session (INT8) ---
        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = n_threads
        sess_opts.inter_op_num_threads = 1
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        int8_path = f"{model_dir}/model_int8.onnx"
        self._session = ort.InferenceSession(
            int8_path, providers=["CPUExecutionProvider"], sess_options=sess_opts,
        )
        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name

        # --- Processor ---
        self.asr_processor = Wav2Vec2Processor.from_pretrained(model_dir)
        self.ASR_VOCAB = self.asr_processor.tokenizer.get_vocab()
        self.ASR_BLANK_ID = self.asr_processor.tokenizer.pad_token_id
        self._ID_TO_CHAR = {tid: c for c, tid in self.ASR_VOCAB.items()}

        # --- Warm-up ---
        dummy = np.zeros((1, 2 * self.SR), dtype=np.float32)
        self._session.run([self._output_name], {self._input_name: dummy})

        # --- Signalkette ---
        self._HPF_SOS = butter(2, 80.0, btype="highpass", fs=self.SR, output="sos")
        self._sosfiltfilt = sosfiltfilt

        # --- Linguistische Tabellen ---
        self._TASHKEEL = set("\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652\u0670")
        self._START_EQUIV = {ch: "\u0627\u0623\u0625\u0622" for ch in "\u0627\u0623\u0625\u0622"}
        self._END_EQUIV = {
            "\u0629": "\u0629\u0647", "\u0647": "\u0647\u0629",
            "\u0649": "\u0649\u064a\u0627", "\u064a": "\u064a\u0649",
        }
        self._CONFUSABLES = {
            "\u062a": "\u0637\u062b\u062f", "\u062b": "\u062a\u0633\u0630\u0641",
            "\u062d": "\u0647\u062e\u0639", "\u062e": "\u062d\u063a\u0643",
            "\u062f": "\u062a\u0636\u0630", "\u0630": "\u062f\u0632\u062b\u0638",
            "\u0631": "\u0644\u063a", "\u0632": "\u0630\u0633\u0638",
            "\u0633": "\u0635\u062b\u0632\u0634", "\u0634": "\u0633\u062c",
            "\u0635": "\u0633\u0636", "\u0636": "\u062f\u0638\u0635",
            "\u0637": "\u062a\u0636\u062f", "\u0638": "\u0632\u0630\u0636",
            "\u0639": "\u0621\u0623\u0627\u0647", "\u063a": "\u062e\u0642\u0631",
            "\u0642": "\u0643\u063a\u062e", "\u0643": "\u0642\u062e\u062c",
            "\u0644": "\u0631", "\u0647": "\u062d\u0629",
            "\u0621": "\u0639", "\u062c": "\u0634\u0643",
        }
        self._LLR_K = 2.0
        self.MIN_SAMPLES = int(0.15 * self.SR)
        self.PAD_CONTEXT_MS = 100

    # --- Audio-Vorverarbeitung (minimal: nur HPF + Pad) ---

    def _highpass(self, audio):
        return self._sosfiltfilt(self._HPF_SOS, audio).astype(self.np.float32)

    def _pad_context(self, audio, ms=None):
        ms = self.PAD_CONTEXT_MS if ms is None else int(ms)
        if ms <= 0:
            return audio
        pad = self.np.zeros(int(ms * self.SR / 1000), dtype=self.np.float32)
        return self.np.concatenate([pad, audio, pad])

    def preprocess(self, pcm_samples):
        """Minimale Vorverarbeitung: HPF + Pad. Kein Decode, kein Normalize."""
        audio = self._highpass(pcm_samples)
        return self._pad_context(audio)

    # --- ASR Inferenz (ONNX INT8) ---

    def run_asr(self, audio):
        """ONNX INT8 Forward -> (log_probs, transcription)."""
        inputs = self.asr_processor(
            audio, sampling_rate=self.SR, return_tensors="np", padding=True
        )
        values = inputs.input_values.astype(self.np.float32, copy=False)
        logits = self._session.run(
            [self._output_name], {self._input_name: values})[0]
        logits_t = self.torch.from_numpy(logits)
        log_probs = self.torch.log_softmax(logits_t.float(), dim=-1).cpu()
        transcription = self.asr_processor.batch_decode(
            log_probs.argmax(dim=-1))[0]
        return log_probs, transcription

    # --- Hilfsfunktionen (identisch zu asr_app.py) ---

    def _strip_diacritics(self, text: str) -> str:
        import unicodedata
        nfd = unicodedata.normalize("NFD", text)
        return unicodedata.normalize(
            "NFC", "".join(c for c in nfd if c not in self._TASHKEEL))

    def _analyze_target(self, word: str):
        import unicodedata
        nfd = unicodedata.normalize("NFD", word)
        meta, i = [], 0
        while i < len(nfd):
            ch = nfd[i]
            if ch in self._TASHKEEL:
                i += 1; continue
            info = {"char": ch, "shadda": False, "sukun": False, "madd": False}
            j = i + 1
            while j < len(nfd) and nfd[j] in self._TASHKEEL:
                if nfd[j] == "\u0651": info["shadda"] = True
                elif nfd[j] == "\u0652": info["sukun"] = True
                elif nfd[j] == "\u0670": info["madd"] = True
                j += 1
            meta.append(info); i = j
        return meta

    def _tajweed_for_letter(self, run_len, mean_len, meta: dict):
        np = self.np
        if run_len <= 0: return 0.0, None
        ratio = run_len / max(mean_len, 1.0)
        if meta.get("shadda"):
            if run_len >= 6 and ratio >= 1.6: return 100.0, None
            fs = float(np.clip(run_len / 6.0 * 100.0, 0, 100))
            rs = float(np.clip((ratio - 0.8) / 0.8 * 100.0, 0, 100))
            s = min(fs, rs)
            return s, ("shadda_fehlt" if s < 70 else None)
        if meta.get("sukun"):
            if run_len <= 3 and ratio <= 0.7: return 100.0, None
            fs = float(np.clip((6 - run_len) / 3.0 * 100.0, 0, 100))
            rs = float(np.clip((1.2 - ratio) / 0.5 * 100.0, 0, 100))
            s = min(fs, rs)
            return s, ("sukun_ignoriert" if s < 70 else None)
        if meta.get("madd"):
            if run_len >= 6: return 100.0, None
            s = float(np.clip(run_len / 6.0 * 100.0, 0, 100))
            return s, ("madd_zu_kurz" if s < 70 else None)
        return 100.0, None

    def _equiv_ids(self, ch, pos, total):
        if pos == 0 and ch in self._START_EQUIV: alts = self._START_EQUIV[ch]
        elif pos == total - 1 and ch in self._END_EQUIV: alts = self._END_EQUIV[ch]
        else: alts = ch
        ids = [self.ASR_VOCAB[c] for c in alts if c in self.ASR_VOCAB]
        return ids or [self.ASR_VOCAB[ch]]

    def _confuse_ids(self, ch):
        alts = self._CONFUSABLES.get(ch, "")
        return [self.ASR_VOCAB[c] for c in alts if c in self.ASR_VOCAB]

    def _encode_target(self, word):
        ids = []
        for ch in word:
            tid = self.ASR_VOCAB.get(ch)
            if tid is None:
                raise ValueError(f"Zeichen {ch!r} nicht im ASR-Vokabular.")
            ids.append(tid)
        return ids

    def _runs_of_non_blank(self, tokens):
        runs, current, last = [], [], -1
        for t, tok in enumerate(tokens):
            if tok == self.ASR_BLANK_ID:
                if current: runs.append(current); current = []
                last = -1
            elif tok != last:
                if current: runs.append(current)
                current = [t]; last = tok
            else: current.append(t)
        if current: runs.append(current)
        return runs

    def _sigmoid(self, x: float) -> float:
        return 1.0 / (1.0 + float(self.np.exp(-x)))

    def _edit_ratio(self, expected, recognized):
        row = list(range(len(recognized) + 1))
        for ec in expected:
            previous, row = row, [0]
            for idx, rc in enumerate(recognized, 1):
                row.append(min(row[-1] + 1, previous[idx] + 1,
                               previous[idx - 1] + (ec != rc)))
        return row[-1] / max(1, len(expected))


    # --- Haupt-Scoring ---

    def score_word(self, pcm, target: str) -> dict:
        """Bewerte ein Wort: PCM float32 16kHz + Zielwort -> Score-Dict."""
        import time
        np = self.np
        if pcm.size < self.MIN_SAMPLES:
            raise ValueError("Aufnahme zu kurz.")
        t_pre = time.perf_counter()
        audio = self.preprocess(pcm)
        dt_pre = int((time.perf_counter() - t_pre) * 1000)
        target_clean = self._strip_diacritics(target)
        phon_meta = self._analyze_target(target)
        t_asr = time.perf_counter()
        log_probs, transcription = self.run_asr(audio)
        dt_asr = int((time.perf_counter() - t_asr) * 1000)
        t_score = time.perf_counter()
        units = self._gop_score(log_probs, target_clean, phon_meta)
        rec_clean = self._strip_diacritics(transcription.replace(" ", ""))
        penalty = max(0.15, 1.0 - 0.75 * self._edit_ratio(target_clean, rec_clean))
        units = [{**u, "score": float(u["score"] * penalty)} for u in units]
        total = float(np.mean([u["score"] for u in units])) if units else 0.0
        dt_score = int((time.perf_counter() - t_score) * 1000)
        return {
            "target": target_clean, "transcription": transcription,
            "units": units, "total": total,
            "duration_ms": dt_pre + dt_asr + dt_score,
            "timings": {"audio_samples": int(audio.size),
                        "audio_ms": int(audio.size * 1000 / self.SR),
                        "preprocess_ms": dt_pre, "asr_ms": dt_asr,
                        "score_ms": dt_score},
        }

    def _gop_score(self, log_probs, target_word, phon_meta=None):
        np = self.np
        target_ids = self._encode_target(target_word)
        if not target_ids: return []
        if log_probs.shape[1] < len(target_ids):
            raise ValueError("Aufnahme zu kurz fuer dieses Wort.")
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
                results.append({"label": ch, "recognized": None, "match": False,
                                "score": 0.0, "confidence": 0.0, "llr": -5.0,
                                "error_hint": None, "articulation": 0.0,
                                "tajweed": 0.0, "duration_ms": 0})
                continue
            frames = runs[i]
            lp_frame = log_probs[0, frames]
            rec_id = int(predictions[frames].bincount(
                minlength=log_probs.shape[-1]).argmax())
            recognized = self._ID_TO_CHAR.get(rec_id)
            equiv_ids = self._equiv_ids(ch, i, total_len)
            target_lp = lp_frame[:, equiv_ids].max(dim=-1).values.mean().item()
            post_score = float(np.clip((target_lp + 3.0) / 3.0 * 100, 0, 100))
            conf = float(np.exp(target_lp))
            confuse_ids = self._confuse_ids(ch)
            if confuse_ids:
                pfc = lp_frame[:, confuse_ids]
                best_conf_lp = pfc.max(dim=-1).values.mean().item()
                llr = target_lp - best_conf_lp
                llr_score = self._sigmoid(self._LLR_K * llr) * 100.0
                error_hint = (self._ID_TO_CHAR.get(confuse_ids[
                    int(pfc.mean(dim=0).argmax().item())]) if llr < 0 else None)
            else:
                llr, llr_score, error_hint = 5.0, 100.0, None
            articulation = 0.4 * post_score + 0.6 * llr_score
            meta_i = phon_meta[i] if (phon_meta and i < len(phon_meta)) else {}
            tajweed_score, tajweed_hint = self._tajweed_for_letter(
                len(frames), mean_len, meta_i)
            hint_final = error_hint or tajweed_hint
            final = 0.75 * articulation + 0.25 * tajweed_score
            equiv_chars = {self._ID_TO_CHAR.get(tid) for tid in equiv_ids}
            match = recognized in equiv_chars
            results.append({
                "label": ch, "recognized": recognized, "match": match,
                "score": float(np.clip(final, 0, 100)),
                "confidence": conf, "llr": float(llr),
                "error_hint": hint_final or (
                    recognized if recognized and not match else None),
                "articulation": float(np.clip(articulation, 0, 100)),
                "tajweed": float(np.clip(tajweed_score, 0, 100)),
                "duration_ms": int(len(frames) * 20),
            })
        return results

