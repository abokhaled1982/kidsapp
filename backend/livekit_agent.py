"""Arabic Pronunciation Assessment — LiveKit Agent on Modal CPU.

Architektur (siehe docs/backend-cpu-migration-und-scoring.md, Abschnitt 14):
  - LiveKit Agent verbindet sich zu LiveKit Cloud Room
  - Empfaengt Audio als 16 kHz PCM-Frames (kein Decode noetig)
  - Energy-VAD erkennt End-of-Speech
  - OpenVINO FP32 wav2vec2 Forward (dasselbe Modell wie asr_app.py)
  - GOP-Scoring + Alignment (unveraenderte Logik)
  - Ergebnis via LiveKit DataChannel zurueck

Deploy:
    modal deploy backend/livekit_agent.py
Dev:
    modal serve backend/livekit_agent.py
"""

from __future__ import annotations

import os
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

APP_NAME = os.environ.get("ASR_APP_NAME", "quran-asr-livekit")
MIN_CONTAINERS = int(os.environ.get("ASR_MIN_CONTAINERS", "0"))
MAX_CONTAINERS = int(os.environ.get("ASR_MAX_CONTAINERS", "5"))

# Lebensdauer eines Worker-Starts. Der Worker laeuft (asyncio.Future) bis zum
# Timeout, d.h. das Fenster ist gleichzeitig die Obergrenze fuer eine
# Uebungssitzung UND fuer die Abrechnung. 30 min: lange genug, dass keinem Kind
# mitten in der Sure der Agent wegstirbt, kurz genug fuer scale-to-zero.
WORKER_TIMEOUT = int(os.environ.get("ASR_WORKER_TIMEOUT", "1800"))

MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
MODEL_DIR = "/opt/models/wav2vec2_ar_fp32"
HF_CACHE = "/root/.cache/huggingface"
LIVEKIT_SECRET = "livekit-credentials"
# Haelt die Call-ID des laufenden Workers, damit ein Redeploy den alten Worker
# (der noch mit dem alten Code laeuft) gezielt beenden kann — siehe deploy.sh.
WORKER_STATE_DICT = "quran-asr-worker-state"

CPU_REQUEST, CPU_LIMIT = 2.0, 8.0
MEMORY_MB = 4096
N_THREADS = 8


def _preload_model() -> None:
    """OpenVINO IR (FP32) waehrend des Image-Builds exportieren.

    Bewusst FP32, nicht INT8. Gemessen im selben Container mit 8 Threads war die
    dynamische INT8-Quantisierung sogar *langsamer* als dasselbe Modell
    unquantisiert (~304 ms pro Forward gegen ~250-271 ms, beide ONNX) und
    verschob die Log-Probs im Mittel um 0.579 nat (p95 1.740).
    Das GOP-Scoring liest absolute Log-Wahrscheinlichkeiten - `post_score` skaliert
    (target_lp + 3) / 3, `llr_score` sigmoidet die Differenz zum Konfusionslaut -
    also nicht bloss das argmax. Die Abweichung schlug deshalb mit 11-34 Punkten
    in die Buchstaben-Scores durch. Siehe docs/backend-cpu-migration-und-scoring.md,
    Abschnitt 3.3 ("Den CTC-Kopf nicht quantisieren").

    Identischer Export wie `_preload_models` in asr_app.py, damit beide Backends
    dasselbe Modell rechnen und Scores vergleichbar bleiben.
    """
    import os as _os
    _os.environ["HF_HOME"] = HF_CACHE
    _os.environ["TRANSFORMERS_CACHE"] = HF_CACHE

    if Path(f"{MODEL_DIR}/openvino_model.xml").exists():
        print("Modell vorhanden.")
        return

    from optimum.intel import OVModelForCTC
    from transformers import Wav2Vec2Processor

    print(f"Export OpenVINO FP32 IR -> {MODEL_DIR}")
    processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
    # compile=False: der Build-Container braucht das Modell nicht auszufuehren,
    # nur zu serialisieren. Kompiliert wird zur Laufzeit in der ScoringEngine.
    model = OVModelForCTC.from_pretrained(MODEL_ID, export=True, compile=False)
    model.save_pretrained(MODEL_DIR)
    processor.save_pretrained(MODEL_DIR)
    print(f"Modell bereit: {MODEL_DIR}")


_SCORING_ENGINE_PATH = Path(__file__).resolve().parent / "scoring_engine.py"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "livekit-agents>=1.0", "livekit-plugins-silero",
        "optimum-intel[openvino]", "transformers",
        "torch", "torchaudio", "numpy", "scipy",
    )
    .env({"HF_HOME": HF_CACHE, "TRANSFORMERS_CACHE": HF_CACHE,
          "OMP_NUM_THREADS": str(N_THREADS), "OV_THREADS": str(N_THREADS)})
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
    timeout=WORKER_TIMEOUT,
)
def run_agent():
    """LiveKit Agent — empfaengt Audio, scored, sendet Ergebnis."""
    import asyncio
    import json
    import logging
    import sys
    import time

    _t_boot = time.monotonic()

    import numpy as np
    from livekit import rtc, agents
    from livekit.agents import AutoSubscribe, JobContext, JobExecutorType, WorkerOptions

    # ScoringEngine aus dem ins Image kopierten Modul laden
    sys.path.insert(0, "/root")
    from scoring_engine import ScoringEngine

    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("quran-asr")

    engine = ScoringEngine(MODEL_DIR, N_THREADS)
    # Boot-Dauer mitloggen: sie ist das Budget, das der Client beim Cold Start
    # ueberbruecken muss (AGENT_WAIT_MS in mobile/src/lib/livekit-stream.ts).
    logger.info("ScoringEngine geladen (OpenVINO FP32) — Boot %.1fs.",
                time.monotonic() - _t_boot)

    # AudioStream liefert 20ms-Frames -> Frame-Zahl == Millisekunden / 20.
    FRAME_MS = 20
    # Stille bis "fertig gesprochen": Ayat brauchen mehr Geduld als Einzelwoerter,
    # weil Kinder Tajweed-Pausen halten.
    SILENCE_FRAMES = {"word": 480 // FRAME_MS, "ayah": 700 // FRAME_MS}
    MAX_FRAMES = {"word": 3500 // FRAME_MS, "ayah": 20000 // FRAME_MS}
    ENERGY_GATE = 200                              # RMS auf int16-Skala

    async def _stream_frames(make_generator):
        """Blockierenden Scoring-Generator im Thread laufen lassen und die Frames
        im Event-Loop ausgeben, sobald sie fertig sind. Ohne das wuerde der
        OpenVINO-Forward die Audio-Ingestion des Rooms anhalten."""
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        sentinel = object()

        def produce():
            try:
                for item in make_generator():
                    loop.call_soon_threadsafe(queue.put_nowait, item)
            except Exception as exc:  # noqa: BLE001 - an den Caller weiterreichen
                loop.call_soon_threadsafe(queue.put_nowait, exc)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, sentinel)

        worker = loop.run_in_executor(None, produce)
        try:
            while True:
                item = await queue.get()
                if item is sentinel:
                    break
                if isinstance(item, Exception):
                    raise item
                yield item
        finally:
            await worker

    async def entrypoint(ctx: JobContext):
        logger.info(f"Room: {ctx.room.name}")
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

        audio_buffer: list[rtc.AudioFrame] = []
        current_target: str | None = None
        current_mode = "word"
        is_speaking = False
        silence_frames = 0
        flush_requested = False
        scoring = False

        def frames_to_pcm(frames):
            data = b"".join(f.data for f in frames)
            return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

        async def publish(payload: dict):
            await ctx.room.local_participant.publish_data(
                json.dumps(payload).encode(), reliable=True)

        @ctx.room.on("data_received")
        def on_data(data: rtc.DataPacket):
            nonlocal current_target, current_mode, audio_buffer
            nonlocal is_speaking, silence_frames, flush_requested
            try:
                msg = json.loads(data.data.decode())
            except Exception as e:
                logger.warning(f"DataChannel error: {e}")
                return

            # "Fertig"-Knopf: sofort bewerten, ohne auf die Stille zu warten.
            if msg.get("cmd") == "flush":
                flush_requested = True
                return

            # {"target": "..."} = Wortmodus, {"mode":"ayah","ayah":"..."} = Ayah.
            mode = msg.get("mode") or ("ayah" if "ayah" in msg else "word")
            target = msg.get("ayah") if mode == "ayah" else msg.get("target")
            if not target:
                return

            current_mode = mode if mode in SILENCE_FRAMES else "word"
            current_target = target
            audio_buffer = []
            is_speaking = False
            silence_frames = 0
            flush_requested = False
            logger.info(f"Target ({current_mode}): {current_target}")
            # Ack: die App weiss erst dadurch, dass der Agent im Room ist und
            # zuhoert - vorher darf sie das Mikrofon nicht oeffnen.
            asyncio.ensure_future(publish({"kind": "ready", "mode": current_mode}))

        async def score_and_publish(pcm, target: str, mode: str):
            """Scoren und Ergebnis(se) senden. Wortmodus = ein Paket,
            Ayah-Modus = start/word/done progressiv."""
            if mode == "ayah":
                async for frame in _stream_frames(
                    lambda: engine.score_ayah(pcm, target)
                ):
                    await publish(frame)
                    if frame.get("kind") == "done":
                        logger.info(f"  -> {frame['total']:.0f}pts "
                                    f"asr={frame['timings']['asr_ms']}ms")
                return
            result = await asyncio.to_thread(engine.score_word, pcm, target)
            await publish(result)
            logger.info(f"  -> {result['total']:.0f}pts "
                        f"asr={result['timings']['asr_ms']}ms")

        @ctx.room.on("track_subscribed")
        def on_track(track: rtc.Track, pub: rtc.TrackPublication,
                     participant: rtc.RemoteParticipant):
            if track.kind != rtc.TrackKind.KIND_AUDIO:
                return
            logger.info(f"Audio von {participant.identity}")

            async def process():
                nonlocal audio_buffer, current_target, is_speaking
                nonlocal silence_frames, flush_requested, scoring
                stream = rtc.AudioStream(track, sample_rate=16000, num_channels=1)
                async for ev in stream:
                    if not isinstance(ev, rtc.AudioFrameEvent):
                        continue
                    if current_target is None or scoring:
                        continue
                    frame = ev.frame
                    samples = np.frombuffer(frame.data, dtype=np.int16)
                    energy = float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))

                    if energy > ENERGY_GATE:
                        is_speaking = True
                        silence_frames = 0
                        audio_buffer.append(frame)
                    elif is_speaking:
                        silence_frames += 1
                        audio_buffer.append(frame)

                    # Ende der Aeusserung: genug Stille, Obergrenze erreicht,
                    # oder die App hat "Fertig" gedrueckt.
                    enough_silence = (is_speaking
                                      and silence_frames >= SILENCE_FRAMES[current_mode])
                    too_long = len(audio_buffer) >= MAX_FRAMES[current_mode]
                    if not (flush_requested or enough_silence or too_long):
                        continue

                    frames, target, mode = audio_buffer, current_target, current_mode
                    forced = flush_requested
                    # Target verbrauchen: Streu-Audio bis zum naechsten Target
                    # (z.B. TTS-Ausklang) darf nicht mitbewertet werden.
                    current_target = None
                    audio_buffer = []
                    is_speaking = False
                    silence_frames = 0
                    flush_requested = False

                    if not frames:
                        await publish({"error": "Keine Aufnahme erkannt."})
                        continue

                    scoring = True
                    pcm = frames_to_pcm(frames)
                    reason = "flush" if forced else ("max" if too_long else "silence")
                    logger.info(
                        f"Score '{target}' ({mode}) {len(pcm)/16000:.2f}s [{reason}]")
                    # Der Client kann das VAD-Ende nicht sehen. Ohne dieses Paket
                    # wuerde die App weiter "hoere zu" zeigen, waehrend hier
                    # schon gerechnet wird.
                    await publish({"kind": "scoring", "reason": reason})
                    try:
                        await score_and_publish(pcm, target, mode)
                    except Exception as e:  # noqa: BLE001 - Fehler an die App
                        await publish({"error": str(e)})
                        logger.error(f"  Fehler: {e}")
                    finally:
                        scoring = False

            asyncio.ensure_future(process())

        await asyncio.Future()

    # livekit-agents 1.7 hat `Worker` in `AgentServer` umbenannt; `WorkerOptions`
    # ist nur noch ein Alias auf `ServerOptions`.
    #
    # THREAD statt des Default PROCESS ist hier Pflicht, nicht Geschmack:
    # `entrypoint` ist eine Closure ueber `engine` und laesst sich nicht in einen
    # Forkserver-Child picklen. Ausserdem wuerde der Prozess-Executor in prod
    # 17 Idle-Prozesse vorwaermen — jeder mit eigener Modellkopie, in einem
    # Modal-Container mit 4 GB. Im Thread bleibt die eine geladene Engine, und
    # der Forward-Pass blockiert den Loop ohnehin nicht (siehe _stream_frames).
    options = WorkerOptions(
        entrypoint_fnc=entrypoint,
        job_executor_type=JobExecutorType.THREAD,
        num_idle_processes=0,
    )
    asyncio.run(agents.AgentServer.from_server_options(options).run())


# ---------------------------------------------------------------------------
# Token-Endpoint (FastAPI) — Mobile App holt sich hier den JWT
# ---------------------------------------------------------------------------

token_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("livekit-api>=1.0", "fastapi", "uvicorn[standard]")
)


async def _ensure_worker() -> str:
    """Startet den Agent-Worker, falls gerade keiner laeuft.

    `modal deploy` *registriert* run_agent nur — gestartet wird die Funktion
    dadurch nicht, und `min_containers` waermt bloss einen leeren Container vor,
    ohne den Body auszufuehren. Ein LiveKit-Worker muss aber bei LiveKit Cloud
    registriert sein, *bevor* dort ein Job in den Room dispatcht werden kann;
    sonst sitzt die App in einem Room ohne Agent ("LK: 0/1").

    Der Token-Abruf ist der natuerliche Trigger: die App holt den JWT
    unmittelbar vor dem Room-Join. So bleibt es bei scale-to-zero im Idle
    (Kostenziel aus docs/backend-cpu-migration-und-scoring.md) und der Worker
    steht trotzdem ohne manuellen Eingriff.
    """
    try:
        stats = await run_agent.get_current_stats.aio()
        # num_running_inputs = tatsaechlich laufende Worker-Invocations.
        # num_total_runners waere falsch: das zaehlt auch den leeren
        # buffer_container mit, der noch keinen Worker ausfuehrt.
        if stats.num_running_inputs > 0 or stats.backlog > 0:
            return "running"
        call = await run_agent.spawn.aio()
        # Call-ID ablegen, damit deploy.sh den Worker beim naechsten Deploy
        # gezielt ersetzen kann (sonst laeuft er mit altem Code weiter).
        state = modal.Dict.from_name(WORKER_STATE_DICT, create_if_missing=True)
        await state.put.aio("call_id", call.object_id)
        return "spawned"
    except Exception as exc:
        # Der Token darf nie an der Worker-Logik scheitern — ohne Token kaeme
        # die App nicht mal in den Room, und ein bereits laufender Worker
        # wuerde unerreichbar.
        print(f"_ensure_worker fehlgeschlagen: {exc!r}")
        return "unknown"


@app.function(image=token_image, secrets=_SECRETS, cpu=0.25, memory=256)
@modal.fastapi_endpoint(method="POST")
async def get_token(request: dict):
    """Generiert einen LiveKit JWT fuer die Mobile App.

    POST /get_token
    Body: {"identity": "user_123"}
    Response: {"token": "eyJ...", "url": "wss://...", "room": "quran-user_123"}

    Der Room wird aus der Identity abgeleitet: jedes Kind bekommt einen eigenen
    Room. Ein gemeinsamer Room wuerde die Mikrofone mischen und die Scores an
    alle Teilnehmer senden.
    """
    import re

    from livekit.api import AccessToken, VideoGrants

    identity = str(request.get("identity") or "anonymous")
    # LiveKit-Room-Namen: nur unverfaengliche Zeichen durchlassen.
    slug = re.sub(r"[^A-Za-z0-9_-]", "", identity)[:48] or "anonymous"
    room_name = request.get("room") or f"quran-{slug}"

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
    worker = await _ensure_worker()
    return {"token": jwt, "url": lk_url, "room": room_name, "worker": worker}


@app.local_entrypoint()
def main():
    """Startet den LiveKit Agent Worker auf Modal."""
    run_agent.remote()

