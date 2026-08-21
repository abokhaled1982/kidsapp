"""Arabic Pronunciation Assessment — LiveKit Agent on Modal CPU.

Architektur (siehe docs/backend-cpu-migration-und-scoring.md, Abschnitt 14):
  - LiveKit Agent verbindet sich zu LiveKit Cloud Room
  - Empfaengt Audio als 16 kHz PCM-Frames (kein Decode noetig)
  - Energy-VAD erkennt End-of-Speech
  - ONNX Runtime INT8 wav2vec2 Forward (~80-150 ms)
  - GOP-Scoring + Alignment (unveraenderte Logik)
  - Ergebnis via LiveKit DataChannel zurueck

Deploy:
    modal deploy backend/livekit_agent.py
Dev:
    modal serve backend/livekit_agent.py
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

APP_NAME = os.environ.get("ASR_APP_NAME", "quran-asr-livekit")
MIN_CONTAINERS = int(os.environ.get("ASR_MIN_CONTAINERS", "0"))
MAX_CONTAINERS = int(os.environ.get("ASR_MAX_CONTAINERS", "5"))

MODEL_DIR = "/opt/models/wav2vec2_int8"
HF_CACHE = "/root/.cache/huggingface"
LIVEKIT_SECRET = "livekit-credentials"

CPU_REQUEST, CPU_LIMIT = 2.0, 8.0
MEMORY_MB = 4096
N_THREADS = 8


def _preload_model() -> None:
    """ONNX INT8 Modell waehrend Image-Build exportieren."""
    import os as _os
    _os.environ["HF_HOME"] = HF_CACHE
    _os.environ["TRANSFORMERS_CACHE"] = HF_CACHE

    if Path(f"{MODEL_DIR}/model_int8.onnx").exists():
        print("Modell vorhanden.")
        return

    from optimum.onnxruntime import ORTModelForCTC
    from transformers import Wav2Vec2Processor
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.shape_inference import quant_pre_process
    import onnx

    MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
    fp32 = "/tmp/wav2vec2_fp32"

    print("Export ONNX FP32...")
    model = ORTModelForCTC.from_pretrained(MODEL_ID, export=True)
    proc = Wav2Vec2Processor.from_pretrained(MODEL_ID)
    _os.makedirs(fp32, exist_ok=True)
    model.save_pretrained(fp32)
    proc.save_pretrained(fp32)

    onnx_path = f"{fp32}/model.onnx"
    preprocessed_path = f"{fp32}/model_preprocessed.onnx"

    # Step 1: Shape inference
    print("Running quant_pre_process (shape inference)...")
    try:
        quant_pre_process(
            input_model_path=onnx_path,
            output_model_path=preprocessed_path,
        )
        print("quant_pre_process succeeded.")
    except Exception as e:
        print(f"quant_pre_process failed ({e}), using original model.")
        preprocessed_path = onnx_path

    # Step 2: Analyse des Modells
    print("\n" + "=" * 70)
    print("MODELL-ANALYSE")
    print("=" * 70)

    m = onnx.load(preprocessed_path)

    # Alle Initializer (statische Gewichte) sammeln
    initializer_names = {init.name for init in m.graph.initializer}
    total_nodes = len(m.graph.node)

    print(f"\nTotal Nodes: {total_nodes}")
    print(f"Total Initializers (statische Gewichte): {len(initializer_names)}")

    # Nodes kategorisieren
    nodes_to_exclude = []
    excluded_reasons = {}

    for node in m.graph.node:
        reason = None

        if "pos_conv_embed" in node.name:
            reason = "pos_conv_embed (Weight Normalization — dynamische Gewichte)"
        elif "feature_projection" in node.name:
            reason = "feature_projection (dynamische MatMul Outputs)"
        elif "lm_head" in node.name.lower() or "final_proj" in node.name.lower():
            reason = "CTC Head (Präzision für finale Wahrscheinlichkeiten)"

        if reason:
            nodes_to_exclude.append(node.name)
            excluded_reasons[node.name] = reason

    # Letzten MatMul als CTC-Fallback
    ctc_found = any("lm_head" in n or "final_proj" in n for n in nodes_to_exclude)
    if not ctc_found:
        mats = [n.name for n in m.graph.node if n.op_type == "MatMul"]
        if mats:
            nodes_to_exclude.append(mats[-1])
            excluded_reasons[mats[-1]] = "CTC Head Fallback (letzter MatMul)"

    # Detailliertes Logging
    print(f"\n{'=' * 70}")
    print(f"EXCLUDED NODES: {len(nodes_to_exclude)} von {total_nodes} "
          f"({len(nodes_to_exclude)/total_nodes*100:.1f}%)")
    print(f"QUANTIZED NODES: {total_nodes - len(nodes_to_exclude)} "
          f"({(total_nodes - len(nodes_to_exclude))/total_nodes*100:.1f}%)")
    print(f"{'=' * 70}\n")

    # Nach Kategorie gruppieren
    categories = {}
    for name, reason in excluded_reasons.items():
        cat = reason.split("(")[0].strip()
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(name)

    for cat, names in categories.items():
        print(f"\n📌 {cat} ({len(names)} Nodes):")
        print(f"   Grund: {excluded_reasons[names[0]]}")
        for name in names:
            # Finde den Node und zeige Op-Type
            for node in m.graph.node:
                if node.name == name:
                    print(f"   - {name} (Op: {node.op_type})")
                    break

    # Zusätzlich: Zeige welche Nodes NICHT quantisierbar wären
    # (MatMul/Gemm mit nicht-initializer Inputs)
    print(f"\n{'=' * 70}")
    print("ANALYSE: Nodes die technisch NICHT quantisierbar sind")
    print("(MatMul/Gemm deren Gewichte KEINE statischen Initializer sind)")
    print(f"{'=' * 70}\n")

    problematic_count = 0
    for node in m.graph.node:
        if node.op_type in ("MatMul", "Gemm", "Conv"):
            for inp in node.input:
                if inp and inp not in initializer_names and inp not in {
                    i.name for i in m.graph.input
                }:
                    # Input ist weder Initializer noch Graph-Input
                    # → wird dynamisch berechnet
                    is_excluded = node.name in nodes_to_exclude
                    status = "✅ EXCLUDED" if is_excluded else "⚠️  NICHT EXCLUDED"
                    print(f"  {status}: {node.name}")
                    print(f"     Op: {node.op_type}")
                    print(f"     Dynamischer Input: {inp}")
                    print()
                    problematic_count += 1
                    break

    print(f"Gesamt problematische Nodes: {problematic_count}")

    # Zusammenfassung
    print(f"\n{'=' * 70}")
    print("ZUSAMMENFASSUNG")
    print(f"{'=' * 70}")
    print(f"  Modell:              {MODEL_ID}")
    print(f"  Total Nodes:         {total_nodes}")
    print(f"  Quantisiert (INT8):  {total_nodes - len(nodes_to_exclude)}")
    print(f"  Excluded (FP32):     {len(nodes_to_exclude)}")
    print(f"  Davon technisch nötig: {problematic_count}")
    print(f"  Davon für Präzision:   {len(nodes_to_exclude) - problematic_count}")
    print(f"{'=' * 70}\n")

    del m  # free memory

    # Step 3: Quantisierung
    print("INT8-Quantisierung...")
    _os.makedirs(MODEL_DIR, exist_ok=True)
    try:
        quantize_dynamic(
            model_input=preprocessed_path,
            model_output=f"{MODEL_DIR}/model_int8.onnx",
            weight_type=QuantType.QInt8,
            reduce_range=True,
            nodes_to_exclude=nodes_to_exclude,
            extra_options={"DefaultTensorType": 1},
        )
        print("✅ INT8 Quantisierung erfolgreich!")
    except Exception as e:
        print(f"❌ Quantisierung fehlgeschlagen: {e}")
        print("Fallback: Verwende FP32 Modell...")
        shutil.copy2(preprocessed_path, f"{MODEL_DIR}/model_int8.onnx")

    # Copy tokenizer/processor files
    for f in Path(fp32).iterdir():
        if f.suffix in (".json", ".txt") and not f.name.startswith("model"):
            shutil.copy2(f, f"{MODEL_DIR}/{f.name}")
    shutil.rmtree(fp32, ignore_errors=True)
    print(f"\n✅ Modell bereit: {MODEL_DIR}")
_SCORING_ENGINE_PATH = Path(__file__).resolve().parent / "scoring_engine.py"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "livekit-agents>=1.0", "livekit-plugins-silero",
        "onnxruntime>=1.18", "onnx",
        "optimum[onnxruntime]", "transformers",
        "torch", "torchaudio", "numpy", "scipy",
    )
    .env({"HF_HOME": HF_CACHE, "TRANSFORMERS_CACHE": HF_CACHE,
          "OMP_NUM_THREADS": str(N_THREADS)})
    .run_function(_preload_model)
    .add_local_file(str(_SCORING_ENGINE_PATH), "/root/scoring_engine.py", copy=True)
)

app = modal.App(APP_NAME)
_SECRETS = [modal.Secret.from_name(LIVEKIT_SECRET)]


# ---------------------------------------------------------------------------
# LiveKit Agent Worker
# ---------------------------------------------------------------------------

@app.function(
    image=image,
    secrets=_SECRETS,
    cpu=(CPU_REQUEST, CPU_LIMIT),
    memory=MEMORY_MB,
    min_containers=MIN_CONTAINERS,
    max_containers=MAX_CONTAINERS,
    buffer_containers=1,
    scaledown_window=300,
    timeout=600,
)
def run_agent():
    """LiveKit Agent — empfaengt Audio, scored, sendet Ergebnis."""
    import asyncio
    import json
    import logging
    import sys

    import numpy as np
    from livekit import rtc, agents
    from livekit.agents import AutoSubscribe, JobContext, WorkerOptions

    # ScoringEngine aus dem ins Image kopierten Modul laden
    sys.path.insert(0, "/root")
    from scoring_engine import ScoringEngine

    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("quran-asr")

    engine = ScoringEngine(MODEL_DIR, N_THREADS)
    logger.info("ScoringEngine geladen (ONNX INT8).")

    async def entrypoint(ctx: JobContext):
        logger.info(f"Room: {ctx.room.name}")
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

        audio_buffer: list[rtc.AudioFrame] = []
        current_target: str | None = None
        is_speaking = False
        silence_frames = 0
        SILENCE_THRESHOLD = 24  # ~480ms Stille = Ende

        def frames_to_pcm(frames):
            data = b"".join(f.data for f in frames)
            return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

        @ctx.room.on("data_received")
        def on_data(data: rtc.DataPacket):
            nonlocal current_target, audio_buffer, is_speaking, silence_frames
            try:
                msg = json.loads(data.data.decode())
                if "target" in msg:
                    current_target = msg["target"]
                    audio_buffer = []
                    is_speaking = False
                    silence_frames = 0
                    logger.info(f"Target: {current_target}")
            except Exception as e:
                logger.warning(f"DataChannel error: {e}")

        @ctx.room.on("track_subscribed")
        def on_track(track: rtc.Track, pub: rtc.TrackPublication,
                     participant: rtc.RemoteParticipant):
            if track.kind != rtc.TrackKind.KIND_AUDIO:
                return
            logger.info(f"Audio von {participant.identity}")

            async def process():
                nonlocal audio_buffer, current_target, is_speaking, silence_frames
                stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
                async for ev in stream:
                    if not isinstance(ev, rtc.AudioFrameEvent):
                        continue
                    if current_target is None:
                        continue
                    frame = ev.frame
                    samples = np.frombuffer(frame.data, dtype=np.int16)
                    energy = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))
                    if energy > 200:
                        is_speaking = True
                        silence_frames = 0
                        audio_buffer.append(frame)
                    elif is_speaking:
                        silence_frames += 1
                        audio_buffer.append(frame)
                        if silence_frames >= SILENCE_THRESHOLD and current_target:
                            pcm = frames_to_pcm(audio_buffer)
                            target = current_target
                            logger.info(f"Score '{target}' {len(pcm)/16000:.2f}s")
                            try:
                                result = engine.score_word(pcm, target)
                                await ctx.room.local_participant.publish_data(
                                    json.dumps(result).encode(), reliable=True)
                                logger.info(
                                    f"  -> {result['total']:.0f}pts "
                                    f"asr={result['timings']['asr_ms']}ms")
                            except Exception as e:
                                await ctx.room.local_participant.publish_data(
                                    json.dumps({"error": str(e)}).encode(),
                                    reliable=True)
                                logger.error(f"  Fehler: {e}")
                            audio_buffer = []
                            is_speaking = False
                            silence_frames = 0

            asyncio.ensure_future(process())

        await asyncio.Future()

    worker = agents.Worker(WorkerOptions(entrypoint_fnc=entrypoint))
    asyncio.get_event_loop().run_until_complete(worker.run())


# ---------------------------------------------------------------------------
# Token-Endpoint (FastAPI) — Mobile App holt sich hier den JWT
# ---------------------------------------------------------------------------

token_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("livekit-api>=1.0", "fastapi", "uvicorn[standard]")
)


@app.function(image=token_image, secrets=_SECRETS, cpu=0.25, memory=256)
@modal.fastapi_endpoint(method="POST")
async def get_token(request: dict):
    """Generiert einen LiveKit JWT fuer die Mobile App.

    POST /get_token
    Body: {"identity": "user_123", "room": "quran-room"}
    Response: {"token": "eyJ...", "url": "wss://..."}
    """
    from livekit.api import AccessToken, VideoGrants

    identity = request.get("identity", "anonymous")
    room_name = request.get("room", "quran-pronunciation")

    lk_url = os.environ["LIVEKIT_URL"]
    lk_key = os.environ["LIVEKIT_API_KEY"]
    lk_secret = os.environ["LIVEKIT_API_SECRET"]

    token = AccessToken(lk_key, lk_secret) \
        .with_identity(identity) \
        .with_grants(VideoGrants(
            room_join=True,
            room=room_name,
            can_publish=True,
            can_subscribe=True,
        ))

    jwt = token.to_jwt()
    return {"token": jwt, "url": lk_url, "room": room_name}


@app.local_entrypoint()
def main():
    """Startet den LiveKit Agent Worker auf Modal."""
    run_agent.remote()

