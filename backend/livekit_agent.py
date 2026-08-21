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
        print("Modell vorhanden."); return

    from optimum.onnxruntime import ORTModelForCTC
    from transformers import Wav2Vec2Processor
    from onnxruntime.quantization import QuantType, quantize_dynamic
    import onnx

    MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
    fp32 = "/tmp/wav2vec2_fp32"

    print("Export ONNX FP32...")
    model = ORTModelForCTC.from_pretrained(MODEL_ID, export=True)
    proc = Wav2Vec2Processor.from_pretrained(MODEL_ID)
    _os.makedirs(fp32, exist_ok=True)
    model.save_pretrained(fp32)
    proc.save_pretrained(fp32)

    print("INT8-Quantisierung (direkt, ohne Graph-Opt)...")
    onnx_path = f"{fp32}/model.onnx"
    m = onnx.load(onnx_path)
    ctc = [n.name for n in m.graph.node
           if "lm_head" in n.name.lower() or "final_proj" in n.name.lower()]
    if not ctc:
        mats = [n.name for n in m.graph.node if n.op_type == "MatMul"]
        ctc = [mats[-1]] if mats else []

    _os.makedirs(MODEL_DIR, exist_ok=True)
    quantize_dynamic(model_input=onnx_path,
                     model_output=f"{MODEL_DIR}/model_int8.onnx",
                     weight_type=QuantType.QInt8, reduce_range=True,
                     nodes_to_exclude=ctc,
                     extra_options={"DefaultTensorType": 1})  # 1 = FLOAT

    for f in Path(fp32).iterdir():
        if f.suffix in (".json", ".txt") and not f.name.startswith("model"):
            shutil.copy2(f, f"{MODEL_DIR}/{f.name}")
    shutil.rmtree(fp32, ignore_errors=True)
    print(f"INT8-Modell bereit: {MODEL_DIR}")


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

