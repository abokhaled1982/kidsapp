"""A/B-Messung: INT8-ONNX gegen FP32 — auf denselben Audiodaten, mit derselben
Scoring-Logik. Nur der Modell-Forward wird getauscht.

Hintergrund: docs/backend-cpu-migration-und-scoring.md, Abschnitt 3.3 fordert die
Abnahme "ueber Score-Korrelation und Flip-Rate, nicht ueber WER". Genau das macht
dieses Skript. Es laeuft als ephemere App (modal run) und laesst das Deployment
unberuehrt; das Image ist aus livekit_agent importiert, damit der Modell-Layer aus
dem Cache kommt und nicht neu gebaut wird.

Usage:
    cd backend && .venv/bin/modal run scripts/ab_int8_vs_fp32.py --wav /tmp/test16k.wav
"""

from __future__ import annotations

import pathlib
import sys

import modal

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from livekit_agent import MODEL_DIR, N_THREADS, image  # noqa: E402

MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"

app = modal.App("quran-asr-ab-check")


@app.function(image=image, cpu=(2.0, 8.0), memory=8192, timeout=1800)
def compare(wav_bytes: bytes, include_onnx_fp32: bool = True) -> dict:
    import io
    import time
    import wave

    import numpy as np
    import torch

    sys.path.insert(0, "/root")
    from scoring_engine import ScoringEngine

    # --- Audio (16 kHz mono PCM16, wie es LiveKit liefert) ------------------
    with wave.open(io.BytesIO(wav_bytes)) as wf:
        assert wf.getframerate() == 16000 and wf.getnchannels() == 1
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
    pcm = pcm.astype(np.float32) / 32768.0

    engine = ScoringEngine(MODEL_DIR, N_THREADS)
    audio = engine.preprocess(pcm)
    inputs = engine.asr_processor(audio, sampling_rate=16000, return_tensors="np",
                                  padding=True)
    values = inputs.input_values.astype(np.float32, copy=False)

    def bench(fn, n=3):
        fn()  # warm
        ts = []
        for _ in range(n):
            t = time.perf_counter()
            fn()
            ts.append((time.perf_counter() - t) * 1000)
        return min(ts), float(np.median(ts))

    out: dict = {"audio_ms": int(audio.size * 1000 / 16000)}

    # --- INT8 (Produktionsstand) -------------------------------------------
    lp_int8, tr_int8 = engine.run_asr(audio)
    out["lat_int8_ms"] = bench(lambda: engine.run_asr(audio))

    # --- FP32 Referenz (torch — numerisch das, was OpenVINO FP32 rechnete) --
    from transformers import Wav2Vec2ForCTC

    torch.set_num_threads(N_THREADS)
    m32 = Wav2Vec2ForCTC.from_pretrained(MODEL_ID).eval()
    iv = torch.from_numpy(values)

    def fwd32():
        with torch.no_grad():
            return m32(iv).logits

    lp_fp32 = torch.log_softmax(fwd32().float(), dim=-1)
    tr_fp32 = engine.asr_processor.batch_decode(lp_fp32.argmax(dim=-1))[0]
    out["lat_torch_fp32_ms"] = bench(fwd32)

    # --- ONNX FP32 (der eigentliche Fix-Kandidat) --------------------------
    if include_onnx_fp32:
        import onnxruntime as ort
        from optimum.onnxruntime import ORTModelForCTC

        t = time.perf_counter()
        ORTModelForCTC.from_pretrained(MODEL_ID, export=True).save_pretrained(
            "/tmp/ort32")
        out["onnx_fp32_export_s"] = round(time.perf_counter() - t, 1)
        so = ort.SessionOptions()
        so.intra_op_num_threads = N_THREADS
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        s32 = ort.InferenceSession("/tmp/ort32/model.onnx",
                                   providers=["CPUExecutionProvider"],
                                   sess_options=so)
        i_name, o_name = s32.get_inputs()[0].name, s32.get_outputs()[0].name
        out["lat_onnx_fp32_ms"] = bench(
            lambda: s32.run([o_name], {i_name: values}))
        lp_onnx32 = torch.log_softmax(
            torch.from_numpy(s32.run([o_name], {i_name: values})[0]).float(), dim=-1)
        out["onnx32_vs_torch32_max_abs_lp"] = float(
            (lp_onnx32 - lp_fp32).abs().max())

    # --- Rohe Logit-Abweichung ---------------------------------------------
    d = (lp_int8 - lp_fp32).abs()
    out["logprob_delta"] = {
        "mean_nat": float(d.mean()), "p95_nat": float(d.flatten().kthvalue(
            int(0.95 * d.numel()))[0]), "max_nat": float(d.max()),
    }
    out["transcription"] = {"fp32": tr_fp32, "int8": tr_int8,
                            "identisch": tr_fp32 == tr_int8}

    # --- Score-Vergleich: identische Scoring-Logik, nur andere Log-Probs ----
    # Ziel = was FP32 gehoert hat, also der Fall "Kind spricht korrekt".
    target_text = tr_fp32.strip()
    if not target_text:
        out["error"] = "FP32 lieferte leere Transkription — kein Score-Vergleich."
        return out

    def score_with(lp, tr):
        engine.run_asr = lambda _a: (lp, tr)   # noqa: ARG005
        return list(engine.score_ayah(pcm, target_text))

    f32, f8 = score_with(lp_fp32, tr_fp32), score_with(lp_int8, tr_int8)
    u32 = [u for fr in f32 if fr["kind"] == "word" for u in fr["units"]]
    u8 = [u for fr in f8 if fr["kind"] == "word" for u in fr["units"]]
    out["total"] = {"fp32": round(f32[-1]["total"], 1),
                    "int8": round(f8[-1]["total"], 1),
                    "delta": round(f8[-1]["total"] - f32[-1]["total"], 1)}

    n = min(len(u32), len(u8))
    ds = [abs(u8[i]["score"] - u32[i]["score"]) for i in range(n)]
    dl = [abs(u8[i]["llr"] - u32[i]["llr"]) for i in range(n)]
    dd = [u8[i]["duration_ms"] != u32[i]["duration_ms"] for i in range(n)]
    # Flip = FP32 sagt "ok", INT8 meldet einen Fehler (oder umgekehrt).
    false_alarm = sum(1 for i in range(n)
                      if not u32[i]["error_hint"] and u8[i]["error_hint"])
    missed = sum(1 for i in range(n)
                 if u32[i]["error_hint"] and not u8[i]["error_hint"])
    out["per_letter"] = {
        "n": n,
        "score_delta_mean": round(float(np.mean(ds)), 1),
        "score_delta_max": round(float(np.max(ds)), 1),
        "score_delta_gt10_pct": round(100 * sum(x > 10 for x in ds) / n, 1),
        "score_delta_gt20_pct": round(100 * sum(x > 20 for x in ds) / n, 1),
        "llr_delta_mean_nat": round(float(np.mean(dl)), 3),
        "llr_delta_max_nat": round(float(np.max(dl)), 3),
        "alignment_drift_pct": round(100 * sum(dd) / n, 1),
        "false_alarm_letters": false_alarm,
        "missed_error_letters": missed,
    }
    out["worst_letters"] = sorted(
        ({"letter": u32[i]["label"], "fp32": round(u32[i]["score"]),
          "int8": round(u8[i]["score"]),
          "hint_fp32": u32[i]["error_hint"], "hint_int8": u8[i]["error_hint"],
          "ms_fp32": u32[i]["duration_ms"], "ms_int8": u8[i]["duration_ms"]}
         for i in range(n)), key=lambda r: -abs(r["int8"] - r["fp32"]))[:12]
    return out


@app.function(image=image, cpu=(2.0, 8.0), memory=8192, timeout=1800)
def probe_decision_region(wav_bytes: bytes) -> dict:
    """Der Score-Vergleich auf korrekter Aussprache clippt bei 100 und verdeckt
    die Stoerung. Interessant ist der Bereich, in dem die App "richtig" von
    "falsch" trennt. Zwei Sonden:

    1. Verwechsler-Ziele: jeden Buchstaben durch einen Confusable ersetzen. Die
       Scores landen mittig, wo die Sigmoid am steilsten ist.
    2. Pegel: dieselbe Aufnahme leiser/lauter. Zeigt, was das fehlende
       _normalize_level aus der WebSocket-Version kostet.
    """
    import io
    import wave

    import numpy as np
    import torch

    sys.path.insert(0, "/root")
    from scoring_engine import ScoringEngine
    from transformers import Wav2Vec2ForCTC

    with wave.open(io.BytesIO(wav_bytes)) as wf:
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
    pcm = pcm.astype(np.float32) / 32768.0

    engine = ScoringEngine(MODEL_DIR, N_THREADS)
    torch.set_num_threads(N_THREADS)
    m32 = Wav2Vec2ForCTC.from_pretrained(MODEL_ID).eval()

    def asr_both(audio):
        inp = engine.asr_processor(audio, sampling_rate=16000, return_tensors="np",
                                   padding=True).input_values.astype(np.float32)
        lp8 = engine.run_asr(audio)[0]
        with torch.no_grad():
            lp32 = torch.log_softmax(m32(torch.from_numpy(inp)).logits.float(), dim=-1)
        tr32 = engine.asr_processor.batch_decode(lp32.argmax(dim=-1))[0]
        return lp32, tr32, lp8

    def letters(lp, tr, target):
        engine.run_asr = lambda _a: (lp, tr)   # noqa: ARG005
        return [u for fr in engine.score_ayah(pcm, target)
                if fr["kind"] == "word" for u in fr["units"]]

    audio = engine.preprocess(pcm)
    lp32, tr32, lp8 = asr_both(audio)
    base = tr32.strip()

    # --- 1. Verwechsler-Ziele ---------------------------------------------
    variants = []
    for i, ch in enumerate(base):
        for alt in engine._CONFUSABLES.get(ch, "")[:2]:
            variants.append(base[:i] + alt + base[i + 1:])
    rows, deltas, flips = [], [], 0
    for v in variants:
        try:
            a32, a8 = letters(lp32, tr32, v), letters(lp8, tr32, v)
        except Exception as exc:  # Ziel nicht alignbar
            rows.append({"target": v, "error": str(exc)[:60]})
            continue
        for i in range(min(len(a32), len(a8))):
            d = a8[i]["score"] - a32[i]["score"]
            deltas.append(abs(d))
            # Flip = die 70-Punkte-Grenze wird ueberschritten (Feedback kippt).
            if (a32[i]["score"] >= 70) != (a8[i]["score"] >= 70):
                flips += 1
        rows.append({
            "target": v,
            "fp32": [round(u["score"]) for u in a32],
            "int8": [round(u["score"]) for u in a8],
            "hint_fp32": [u["error_hint"] for u in a32],
            "hint_int8": [u["error_hint"] for u in a8],
        })
    n = max(1, len(deltas))
    out = {
        "basis_ziel": base,
        "verwechsler": {
            "n_buchstaben": len(deltas),
            "score_delta_mean": round(float(np.mean(deltas)), 1) if deltas else None,
            "score_delta_max": round(float(np.max(deltas)), 1) if deltas else None,
            "score_delta_gt10_pct": round(100 * sum(x > 10 for x in deltas) / n, 1),
            "flips_um_70er_grenze": flips,
            "flip_rate_pct": round(100 * flips / n, 1),
            "beispiele": rows[:8],
        },
    }

    # --- 2. Pegel-Empfindlichkeit (fehlendes _normalize_level) -------------
    def norm(a, target_dbfs=-20.0):
        rms = float(np.sqrt(np.mean(a ** 2)))
        if rms < 1e-6:
            return a
        o = a * 10.0 ** ((target_dbfs - 20.0 * np.log10(rms)) / 20.0)
        pk = float(np.max(np.abs(o)))
        return (o / pk * 0.99 if pk > 0.99 else o).astype(np.float32)

    probe_target = variants[0] if variants else base
    pegel = {}
    for label, g in (("original", 1.0), ("-20dB", 0.1), ("-32dB", 0.025),
                     ("+10dB", 3.16)):
        row = {}
        for mode in ("ohne_norm", "mit_norm"):
            a = pcm * g
            a = norm(a) if mode == "mit_norm" else a
            au = engine.preprocess(a)
            l32, t32, _ = asr_both(au)
            try:
                sc = [round(u["score"]) for u in letters(l32, t32, probe_target)]
            except Exception as exc:
                sc = f"err: {str(exc)[:40]}"
            row[mode] = {"transkription": t32, "scores": sc}
        pegel[label] = row
    out["pegel"] = {"ziel": probe_target, "messung": pegel}
    return out


@app.function(image=image, cpu=(2.0, 8.0), memory=8192, timeout=1800)
def probe_transport(wavs: dict, targets: list) -> dict:
    """Was der Transportweg kostet.

    Die WebSocket-Version schickte verlustfreies 16-kHz-PCM-WAV. LiveKit schickt
    Opus. Zusaetzlich prueft diese Sonde das Energy-Gate aus livekit_agent.py:
    Frames unterhalb ENERGY_GATE werden dort *verworfen*, solange noch nicht
    gesprochen wurde — ein Wortanlaut mit leisem Frikativ (س ث ف ه) faellt damit
    weg, bevor das Modell ihn sieht.
    """
    import io
    import wave

    import numpy as np

    sys.path.insert(0, "/root")
    from scoring_engine import ScoringEngine

    engine = ScoringEngine(MODEL_DIR, N_THREADS)

    def load(b):
        with wave.open(io.BytesIO(b)) as wf:
            return (np.frombuffer(wf.readframes(wf.getnframes()),
                                  dtype=np.int16).astype(np.float32) / 32768.0)

    def scores(pcm, target):
        try:
            return {"scores": [round(u["score"]) for fr in engine.score_ayah(pcm, target)
                               if fr["kind"] == "word" for u in fr["units"]],
                    "hints": [u["error_hint"] for fr in engine.score_ayah(pcm, target)
                              if fr["kind"] == "word" for u in fr["units"]]}
        except Exception as exc:
            return {"error": str(exc)[:60]}

    out: dict = {"transport": {}}
    ref = load(wavs["original"])
    for name, b in wavs.items():
        pcm = load(b)
        row = {"transkription": engine.run_asr(engine.preprocess(pcm))[1]}
        n = min(len(pcm), len(ref))
        if name != "original":
            # SNR der Codec-Verzerrung gegen das Original.
            noise = pcm[:n] - ref[:n]
            row["codec_snr_db"] = round(float(
                10 * np.log10(np.mean(ref[:n] ** 2) / max(np.mean(noise ** 2), 1e-12))), 1)
        for t in targets:
            row[t] = scores(pcm, t)
        out["transport"][name] = row

    # --- Energy-Gate: was der Anlaut verliert -------------------------------
    FRAME = 320                                    # 20 ms bei 16 kHz
    GATE = 200 / 32768.0                           # ENERGY_GATE auf float-Skala
    gate_rows = {}
    for name, b in wavs.items():
        pcm = load(b)
        frames = [pcm[i:i + FRAME] for i in range(0, len(pcm) - FRAME + 1, FRAME)]
        rms = [float(np.sqrt(np.mean(f ** 2))) for f in frames]
        first = next((i for i, r in enumerate(rms) if r > GATE), None)
        if first is None:
            gate_rows[name] = {"error": "kein Frame ueber dem Gate"}
            continue
        kept = np.concatenate(frames[first:]) if first < len(frames) else pcm
        gate_rows[name] = {
            "verworfen_ms": first * 20,
            "frames_unter_gate_im_signal": sum(1 for r in rms if r <= GATE),
            "frames_total": len(rms),
            "transkription_nach_gate": engine.run_asr(engine.preprocess(kept))[1],
        }
        for t in targets:
            gate_rows[name][t] = scores(kept, t)
    out["energy_gate"] = gate_rows
    return out


@app.local_entrypoint()
def main(wav: str = "/tmp/test16k.wav", onnx_fp32: bool = True, mode: str = "compare",
         targets: str = ""):
    import json

    data = pathlib.Path(wav).read_bytes()
    if mode == "transport":
        wavs = {"original": data}
        for br in (64, 32, 24):
            p = pathlib.Path(f"/tmp/test16k_opus{br}.wav")
            if p.exists():
                wavs[f"opus{br}k"] = p.read_bytes()
        tl = [t for t in targets.split(",") if t.strip()] or ["بسم", "بصم"]
        print(json.dumps(probe_transport.remote(wavs, tl), ensure_ascii=False, indent=2))
        return
    fn = probe_decision_region if mode == "probe" else compare
    args = (data,) if mode == "probe" else (data, onnx_fp32)
    print(json.dumps(fn.remote(*args), ensure_ascii=False, indent=2))
