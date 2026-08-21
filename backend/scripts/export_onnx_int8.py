"""Export wav2vec2-large-xlsr-53-arabic to ONNX INT8.

Schritte (siehe docs/backend-cpu-migration-und-scoring.md, Abschnitt 14.4):
  1. HuggingFace → ONNX Export (FP32, dynamische Time-Achse)
  2. Graph-Optimierung (Operator-Fusion)
  3. Dynamische INT8-Quantisierung (CTC-Kopf bleibt FP32)

Ausfuehrung:
    pip install optimum[onnxruntime] onnxruntime transformers
    python backend/scripts/export_onnx_int8.py

Ergebnis in backend/models/wav2vec2_int8/:
    model_int8.onnx   (~350 MB, INT8 Encoder + FP32 CTC-Head)
    preprocessor_config.json, vocab.json, etc.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "models" / "wav2vec2_int8"
ONNX_FP32_DIR = Path(__file__).resolve().parent.parent / "models" / "_wav2vec2_onnx_fp32"


def step1_export_onnx():
    """Export HuggingFace model → ONNX FP32."""
    print("\n=== Schritt 1: ONNX-Export (FP32) ===")
    from optimum.onnxruntime import ORTModelForCTC
    from transformers import Wav2Vec2Processor

    ONNX_FP32_DIR.mkdir(parents=True, exist_ok=True)

    print(f"  Lade Modell: {MODEL_ID}")
    model = ORTModelForCTC.from_pretrained(MODEL_ID, export=True)
    processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)

    print(f"  Speichere nach: {ONNX_FP32_DIR}")
    model.save_pretrained(ONNX_FP32_DIR)
    processor.save_pretrained(ONNX_FP32_DIR)

    onnx_path = ONNX_FP32_DIR / "model.onnx"
    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    print(f"  ✓ model.onnx: {size_mb:.0f} MB")
    return onnx_path


def step2_optimize(onnx_path: Path) -> Path:
    """Graph-Optimierung: Attention-Fusion, Layer-Norm-Fusion."""
    print("\n=== Schritt 2: Graph-Optimierung ===")
    from onnxruntime.transformers.optimizer import optimize_model

    opt_path = onnx_path.parent / "model_opt.onnx"

    optimized = optimize_model(
        str(onnx_path),
        model_type="bert",
        opt_level=2,
        use_gpu=False,
    )
    optimized.save_model_to_file(str(opt_path))

    size_mb = opt_path.stat().st_size / (1024 * 1024)
    print(f"  ✓ model_opt.onnx: {size_mb:.0f} MB")
    return opt_path


def step3_quantize_int8(opt_path: Path) -> Path:
    """Dynamische INT8-Quantisierung, CTC-Kopf bleibt FP32."""
    print("\n=== Schritt 3: INT8-Quantisierung ===")
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    int8_path = OUTPUT_DIR / "model_int8.onnx"

    # CTC-Projektionskopf identifizieren (letzte MatMul-Node vor dem Output).
    # Bei wav2vec2 heisst sie typisch "/lm_head/MatMul" oder "lm_head".
    model = onnx.load(str(opt_path))
    ctc_nodes = []
    for node in model.graph.node:
        if "lm_head" in node.name.lower() or "final_proj" in node.name.lower():
            ctc_nodes.append(node.name)
    # Fallback: letzte MatMul im Graphen
    if not ctc_nodes:
        matmul_nodes = [n.name for n in model.graph.node if n.op_type == "MatMul"]
        if matmul_nodes:
            ctc_nodes = [matmul_nodes[-1]]

    print(f"  CTC-Kopf-Nodes (bleiben FP32): {ctc_nodes}")

    quantize_dynamic(
        model_input=str(opt_path),
        model_output=str(int8_path),
        weight_type=QuantType.QInt8,
        reduce_range=True,
        nodes_to_exclude=ctc_nodes,
    )

    size_mb = int8_path.stat().st_size / (1024 * 1024)
    print(f"  ✓ model_int8.onnx: {size_mb:.0f} MB")

    # Processor-Dateien kopieren (vocab, config, etc.)
    for f in ONNX_FP32_DIR.iterdir():
        if f.suffix in (".json", ".txt") and not f.name.startswith("model"):
            shutil.copy2(f, OUTPUT_DIR / f.name)
    print(f"  ✓ Processor-Dateien kopiert nach {OUTPUT_DIR}")

    return int8_path


def step4_validate(int8_path: Path):
    """Schnell-Check: Modell ladt und produziert Logits."""
    print("\n=== Schritt 4: Schnell-Validierung ===")
    import numpy as np
    import onnxruntime as ort

    sess = ort.InferenceSession(
        str(int8_path),
        providers=["CPUExecutionProvider"],
        sess_options=_session_options(),
    )

    # Dummy-Input: 1 Sekunde Stille
    dummy = np.zeros((1, 16000), dtype=np.float32)
    input_name = sess.get_inputs()[0].name
    output_name = sess.get_outputs()[0].name

    import time
    t0 = time.perf_counter()
    result = sess.run([output_name], {input_name: dummy})
    dt = (time.perf_counter() - t0) * 1000

    logits = result[0]
    print(f"  Input shape:  (1, 16000)")
    print(f"  Output shape: {logits.shape}")
    print(f"  Inferenz-Zeit (1s Audio): {dt:.0f} ms")
    print(f"  ✓ Modell funktioniert!")

    # Zweiter Lauf (warm)
    t0 = time.perf_counter()
    sess.run([output_name], {input_name: dummy})
    dt_warm = (time.perf_counter() - t0) * 1000
    print(f"  Warm-Inferenz (1s Audio): {dt_warm:.0f} ms")


def _session_options():
    import onnxruntime as ort
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 8
    opts.inter_op_num_threads = 1
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return opts


def main():
    print("=" * 60)
    print("  ONNX INT8 Export: wav2vec2-large-xlsr-53-arabic")
    print("=" * 60)

    onnx_path = step1_export_onnx()
    opt_path = step2_optimize(onnx_path)
    int8_path = step3_quantize_int8(opt_path)
    step4_validate(int8_path)

    # Aufraumen: FP32-Zwischenergebnis loeschen
    print(f"\n  Raeume auf: {ONNX_FP32_DIR}")
    shutil.rmtree(ONNX_FP32_DIR, ignore_errors=True)

    print("\n" + "=" * 60)
    print(f"  FERTIG! INT8-Modell: {int8_path}")
    print(f"  Naechster Schritt: GOP-Score-Vergleich mit 20 Testwoertern")
    print("=" * 60)


if __name__ == "__main__":
    main()
