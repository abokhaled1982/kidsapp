"""Unit-Tests fuer die Latenz-Aenderungen in asr_app.py.

Laufen offline, ohne Modal, ohne Netz, ohne Modell - deshalb bei jedem Lauf
bezahlbar. Sie pruefen zwei Dinge:

  * Verhalten, wo es ohne Modell pruefbar ist (read_wav_pcm16).
  * Struktur, wo das Verhalten erst im Container entsteht (CPU-Reservierung,
    Thread-Quelle, Fallback-Log, Padding). Ein AST-Test ist hier kein Ersatz
    fuer eine Messung, sondern die Bremse dagegen, dass eine der vier
    Aenderungen bei einem spaeteren Umbau still verschwindet.

Ausfuehren:
    .venv/bin/python -m unittest discover -s backend/tests -v
"""

from __future__ import annotations

import ast
import io
import os
import struct
import sys
import unittest
import wave
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import asr_app  # noqa: E402  (Pfad muss vorher stehen)

SOURCE = (BACKEND / "asr_app.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


# --- kleine AST-Helfer -------------------------------------------------------

def _class(name: str) -> ast.ClassDef:
    for node in ast.walk(TREE):
        if isinstance(node, ast.ClassDef) and node.name == name:
            return node
    raise AssertionError(f"Klasse {name} nicht gefunden")


def _method(class_name: str, name: str) -> ast.FunctionDef:
    for node in _class(class_name).body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node
    raise AssertionError(f"Methode {class_name}.{name} nicht gefunden")


def _code(class_name: str, name: str) -> str:
    """Quelltext einer Methode OHNE Docstring.

    Sonst findet ein Test seinen Suchbegriff im Kommentar statt im Code - und
    ein Test, der die Doku prueft statt das Verhalten, ist wertlos.
    """
    body = _method(class_name, name).body
    if (
        body
        and isinstance(body[0], ast.Expr)
        and isinstance(body[0].value, ast.Constant)
        and isinstance(body[0].value.value, str)
    ):
        body = body[1:]
    return "\n".join(ast.unparse(stmt) for stmt in body)


def _decorator_kwargs(class_name: str, decorator: str) -> dict[str, ast.expr]:
    """Keyword-Argumente von @app.cls(...) o.ae. an einer Klasse."""
    for deco in _class(class_name).decorator_list:
        if not isinstance(deco, ast.Call):
            continue
        target = deco.func
        rendered = ast.unparse(target)
        if rendered.endswith(decorator):
            return {kw.arg: kw.value for kw in deco.keywords if kw.arg}
    raise AssertionError(f"Dekorator {decorator} an {class_name} nicht gefunden")


def _wav_bytes(samples, sample_rate: int = 16000, channels: int = 1, width: int = 2) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(width)
        wf.setframerate(sample_rate)
        if width == 2:
            wf.writeframes(b"".join(struct.pack("<h", int(s)) for s in samples))
        else:
            wf.writeframes(bytes(int(s) & 0xFF for s in samples))
    return buf.getvalue()


# --- Schritt 3: CPU-Reservierung ---------------------------------------------

class CpuReservierung(unittest.TestCase):
    def test_container_reserviert_kerne_und_speicher(self):
        # Ohne cpu= gibt Modal 0.125 Kerne. Genau das war der Fehler: der
        # Forward rechnete mit mehreren Threads auf einem Achtel Kern.
        kwargs = _decorator_kwargs("ASR", "app.cls")
        self.assertIn("cpu", kwargs, "kein cpu= am Container -> Modal-Default 0.125 Kerne")
        self.assertIn("memory", kwargs, "kein memory= am Container -> Modal-Default 128 MiB")
        self.assertIsInstance(
            kwargs["cpu"], ast.Tuple,
            "cpu soll (Reservierung, Limit) sein - ein fester Wert kostet rund um die Uhr",
        )
        self.assertEqual(asr_app.CPU_REQUEST, 1.0)
        self.assertEqual(asr_app.CPU_LIMIT, 8.0)
        self.assertEqual(asr_app.MEMORY_MB, 4096)
        self.assertLess(
            asr_app.CPU_REQUEST, asr_app.CPU_LIMIT,
            "Reservierung muss unter dem Limit liegen, sonst ist das Tupel sinnlos",
        )

    def test_threads_kommen_nicht_aus_der_hostmaschine(self):
        load = _code("ASR", "load")
        self.assertIn("OV_THREADS", load)
        self.assertIn("OMP_NUM_THREADS", load)
        # os.cpu_count() zaehlt die Kerne der Maschine, nicht die des Containers.
        self.assertNotIn(
            "cpu_count", load,
            "Threadzahl darf nicht aus os.cpu_count() kommen - das ist die Hostmaschine",
        )

    def test_threadzahl_hat_einen_festen_rueckfall(self):
        # Ohne gesetzte Variable muss eine Zahl herauskommen, die zur
        # Reservierung passt - nicht 0 und nicht die Kernzahl des Hosts.
        load = _code("ASR", "load")
        self.assertRegex(load, r"OMP_NUM_THREADS.{0,12}or\s+4")


# --- Schritt 4: Sichtbarkeit auf dem Decoder-Pfad ----------------------------

class DecoderSichtbarkeit(unittest.TestCase):
    def test_langsamer_decoder_wird_protokolliert(self):
        # pydub startet einen ffmpeg-Prozess. Wenn das bei jeder Anfrage
        # passiert, sind es mehrere hundert Millisekunden pro Wort - und
        # ohne Log faellt es nie auf.
        decode = _method("ASR", "_decode_audio")
        handlers = [n for n in ast.walk(decode) if isinstance(n, ast.ExceptHandler)]
        self.assertTrue(handlers, "_decode_audio hat keinen except-Zweig mehr")
        logged = any(
            "decode_fallback" in ast.unparse(node)
            for handler in handlers
            for node in handler.body
        )
        self.assertTrue(logged, "der Fallback auf pydub/ffmpeg wird nicht geloggt")

    def test_fallback_log_nennt_grund_und_fehlerart(self):
        decode = _code("ASR", "_decode_audio")
        self.assertIn("err=type(e).__name__", decode)
        self.assertIn("detail=str(e)[:120]", decode)


# --- Schritt 5: Padding ------------------------------------------------------

class PaddingLaenge(unittest.TestCase):
    def test_padding_ist_auf_100ms_verkuerzt(self):
        load = _code("ASR", "load")
        self.assertIn("self.PAD_CONTEXT_MS = 100", load)

    def test_padding_liest_die_eingestellte_laenge(self):
        pad = _code("ASR", "_pad_context")
        self.assertIn("self.PAD_CONTEXT_MS", pad)
        self.assertNotIn("ms: int=250", pad.replace(" ", ""))

    def test_padding_bleibt_pro_anfrage_einstellbar(self):
        # Ohne diesen Parameter kann die Score-Pruefung 250 gegen 100 nicht
        # dieselbe Aufnahme zweimal bewerten.
        for name in ("_pad_context", "_preprocess", "_score_word"):
            args = [a.arg for a in _method("ASR", name).args.args]
            self.assertTrue(
                {"ms", "pad_ms"} & set(args),
                f"{name} nimmt keine Padding-Laenge an: {args}",
            )

    def test_padding_null_laesst_die_aufnahme_unberuehrt(self):
        pad = _code("ASR", "_pad_context")
        self.assertIn("if ms <= 0", pad, "pad_ms=0 muss ohne Anhaengen durchlaufen")


# --- Schritt 2 (Serverseite): PCM-WAV ohne Codec -----------------------------

class PcmWavSchnellpfad(unittest.TestCase):
    def test_liest_16k_mono_pcm_direkt(self):
        got = asr_app.read_wav_pcm16(_wav_bytes([0, 16384, -16384, 32767, -32768]), 16000)
        self.assertIsNotNone(got)
        self.assertEqual(got.dtype.name, "float32")
        self.assertAlmostEqual(float(got[0]), 0.0, places=6)
        self.assertAlmostEqual(float(got[1]), 0.5, places=6)
        self.assertAlmostEqual(float(got[2]), -0.5, places=6)
        # Nach der Skalierung bleibt alles im offenen Intervall [-1, 1].
        self.assertLessEqual(float(max(abs(got))), 1.0)

    def test_mischt_stereo_zu_mono(self):
        # links konstant 0.5, rechts konstant -0.5 -> Mono ist Stille.
        raw = _wav_bytes([16384, -16384, 16384, -16384], channels=2)
        got = asr_app.read_wav_pcm16(raw, 16000)
        self.assertEqual(len(got), 2)
        for value in got:
            self.assertAlmostEqual(float(value), 0.0, places=6)

    def test_gibt_fremde_formate_an_den_alten_decoder_ab(self):
        # Alte App-Versionen im Feld senden m4a/AAC - der Schnellpfad darf sie
        # nicht abfangen, sondern muss None liefern.
        self.assertIsNone(asr_app.read_wav_pcm16(_wav_bytes([1, 2, 3], sample_rate=44100), 16000))
        self.assertIsNone(asr_app.read_wav_pcm16(_wav_bytes([1, 2, 3], width=1), 16000))
        self.assertIsNone(asr_app.read_wav_pcm16(b"", 16000))
        self.assertIsNone(asr_app.read_wav_pcm16(b"\x00\x01\x02nichts", 16000))
        self.assertIsNone(asr_app.read_wav_pcm16(_wav_bytes([], sample_rate=16000), 16000))

    def test_decoder_probiert_den_schnellpfad_zuerst(self):
        decode = _code("ASR", "_decode_audio")
        fast = decode.index("read_wav_pcm16")
        self.assertLess(fast, decode.index("torchaudio"))
        self.assertLess(fast, decode.index("AudioSegment"))


# --- Produktion bleibt Produktion -------------------------------------------

class ProduktionUnberuehrt(unittest.TestCase):
    @unittest.skipIf(
        os.environ.get("ASR_APP_NAME") or os.environ.get("ASR_MIN_CONTAINERS")
        or os.environ.get("ASR_BENCH"),
        "Bench-Umgebung gesetzt - dieser Test prueft die Standardwerte",
    )
    def test_ohne_umgebungsvariablen_ist_es_die_produktion(self):
        self.assertEqual(asr_app.APP_NAME, "quran-asr")
        self.assertEqual(asr_app.MIN_CONTAINERS, 2)
        self.assertFalse(asr_app.BENCH_DEPLOY)
        # Genau ein Secret: das Auth-Token. Kein Bench-Schalter im Container.
        self.assertEqual(len(asr_app._SECRETS), 1)

    def test_messendpunkte_haengen_am_bench_schalter(self):
        # /bench/* darf nur existieren, wenn ASR_BENCH=1 im Container steht.
        web = _method("ASR", "web")
        guarded = {
            ast.unparse(node)
            for branch in ast.walk(web)
            if isinstance(branch, ast.If) and "BENCH" in ast.unparse(branch.test)
            for node in ast.walk(branch)
        }
        found = 0
        for node in ast.walk(web):
            if not isinstance(node, ast.FunctionDef):
                continue
            for deco in node.decorator_list:
                rendered = ast.unparse(deco)
                if '/bench' not in rendered:
                    continue
                found += 1
                self.assertIn(
                    ast.unparse(node), guarded,
                    f"{rendered} liegt nicht hinter dem BENCH-Schalter",
                )
        self.assertGreater(found, 0, "kein Messendpunkt gefunden - Test greift ins Leere")

    def test_bench_schalter_kommt_aus_der_container_umgebung(self):
        web = _code("ASR", "web")
        self.assertIn("os.environ.get('ASR_BENCH'", web)


if __name__ == "__main__":
    unittest.main(verbosity=2)
