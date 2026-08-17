"""Lokaler Test des Tailscale-Funnel-Flows aus dem Colab-Notebook.

Ziel: Bevor du in Colab GPU-Zeit verbrauchst, kannst du hier lokal
validieren, dass die exakte Aktivierungssequenz aus Zelle 8 wirklich
laeuft: 'tailscale up' -> Online-Wait -> Zert -> Funnel-Popen+Polling ->
FastAPI erreichbar unter https://<host>.ts.net.

Statt der GPU-schweren ASR-Pipeline startet dieses Skript nur einen
Mini-FastAPI-Server (/health + auth-geschuetztes /stream-WS), damit die
Test-Latenz nur vom Tailscale-Setup abhaengt und kein Modell geladen wird.

Voraussetzungen:
    - Linux
    - tailscale + tailscaled installiert (Skript bietet auto-install an
      wenn 'sudo -n' passwortfrei verfuegbar ist, sonst nur Hinweis)
    - Env-Var TS_AUTHKEY  (Ephemeral+Reusable, gleiche Quelle wie Colab)
    - Optional: Env-Var API_TOKEN (sonst wird einer generiert)
    - Freier TCP-Port 8000

Nutzung:
    export TS_AUTHKEY='tskey-auth-xxxx'
    python backend/tailscale_funnel_test.py

Beenden mit Ctrl+C - der Test raeumt tailscaled+funnel wieder auf.
"""

from __future__ import annotations

import atexit
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from typing import Optional

PORT = 8000
HOSTNAME = "colab-asr-test"

# System-Socket vom offiziellen tailscaled-systemd-Service (Standard-Pfad
# nach 'curl | sudo sh'-Install). Wenn vorhanden, benutzen wir diese
# Instanz statt eine eigene zu starten - sonst rennen zwei tailscaleds
# um dieselben Netzwerk-Interfaces und die Registrierung haengt.
SYSTEM_SOCK = "/var/run/tailscale/tailscaled.sock"

# Fallback: eigener isolierter tailscaled, wenn kein System-Daemon laeuft.
STATE_DIR = os.path.join(tempfile.gettempdir(), "tailscale-funnel-test")
SOCK_PATH = os.path.join(STATE_DIR, "tailscaled.sock")
STATE_FILE = os.path.join(STATE_DIR, "tailscaled.state")
LOG_PATH = os.path.join(STATE_DIR, "tailscaled.log")

# Zur Laufzeit gesetzt: welchen Socket verwenden wir, und braucht der
# write-Operationen sudo?
_ACTIVE_SOCK: Optional[str] = None
_USE_SUDO: bool = False


def _die(msg: str, code: int = 1) -> None:
    print(f"\n❌ {msg}", file=sys.stderr)
    sys.exit(code)


def _ok(msg: str) -> None:
    print(f"✅ {msg}")


def _info(msg: str) -> None:
    print(f"ℹ️  {msg}")


def _load_env_local() -> None:
    """Laedt KEY=VALUE aus backend/.env.local (gitignored) in os.environ.
    Vorhandene Env-Vars werden NICHT ueberschrieben, damit ein explizites
    `export TS_AUTHKEY=…` in der Shell Prioritaet behaelt."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as fh:
        for line in fh:
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


# ---------------------------------------------------------------------------
# 0) Vorpruefungen
# ---------------------------------------------------------------------------


def _port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) != 0


def _preflight() -> str:
    if sys.platform != "linux":
        _die(f"Nur Linux getestet. Erkannt: {sys.platform}")
    if shutil.which("tailscale") is None or shutil.which("tailscaled") is None:
        _die(
            "tailscale/tailscaled nicht installiert. Installiere manuell:\n"
            "   curl -fsSL https://tailscale.com/install.sh | sudo sh\n"
            "   (danach dieses Skript nochmal starten)"
        )
    key = os.environ.get("TS_AUTHKEY", "").strip()
    if not key:
        _die(
            "TS_AUTHKEY fehlt in der Umgebung.\n"
            "   1) https://login.tailscale.com/admin/settings/keys\n"
            "   2) Generate auth key  (Ephemeral ✓  Reusable ✓)\n"
            "   3) export TS_AUTHKEY='tskey-auth-xxxx'  ODER in backend/.env.local eintragen"
        )
    if not _port_free(PORT):
        _die(f"Port {PORT} ist belegt. Stoppe den Vorgang oder passe PORT im Skript an.")
    return key


# ---------------------------------------------------------------------------
# 1) tailscaled-Auswahl: System-Daemon (bevorzugt) oder eigener Fallback
# ---------------------------------------------------------------------------


_tailscaled_proc: Optional[subprocess.Popen] = None


def _system_daemon_available() -> bool:
    return os.path.exists(SYSTEM_SOCK)


def _sudo_available_noninteractive() -> bool:
    try:
        r = subprocess.run(["sudo", "-n", "true"], capture_output=True, timeout=3)
        return r.returncode == 0
    except Exception:
        return False


def _ensure_operator_set() -> bool:
    """True, wenn der current user write-Ops am System-Socket ausfuehren kann.
    Prueft real via idempotenter 'tailscale set --operator=$USER'; setzt sie
    ggf. per 'sudo -n' zurecht. Kein Raten anhand von sudo-Verfuegbarkeit."""
    if os.geteuid() == 0:
        return True
    user = os.environ.get("USER") or ""
    if not user:
        return False
    # 1) Probe ohne sudo: klappt nur wenn operator schon gesetzt.
    probe = subprocess.run(
        ["tailscale", f"--socket={SYSTEM_SOCK}", "set", f"--operator={user}"],
        capture_output=True, text=True, timeout=10,
    )
    if probe.returncode == 0:
        return True
    # 2) Versuch mit passwordless sudo, falls verfuegbar.
    if _sudo_available_noninteractive():
        subprocess.run(
            ["sudo", "-n", "tailscale", f"--socket={SYSTEM_SOCK}",
             "set", f"--operator={user}"],
            capture_output=True, text=True, timeout=10,
        )
        # nochmal probe
        probe2 = subprocess.run(
            ["tailscale", f"--socket={SYSTEM_SOCK}", "set", f"--operator={user}"],
            capture_output=True, text=True, timeout=10,
        )
        if probe2.returncode == 0:
            return True
    return False


def _use_system_tailscaled() -> None:
    global _ACTIVE_SOCK, _USE_SUDO
    _ACTIVE_SOCK = SYSTEM_SOCK
    _operator_ok = _ensure_operator_set()
    if os.geteuid() == 0 or _operator_ok:
        _USE_SUDO = False
        _ok(f"System-tailscaled uebernommen (Socket: {SYSTEM_SOCK}, operator ok)")
    else:
        _USE_SUDO = True
        _info(
            f"System-tailscaled uebernommen (Socket: {SYSTEM_SOCK})\n"
            "   Hinweis: Fuer write-Ops wird 'sudo' verwendet.\n"
            "   Einmal-Setup fuer sudo-freie Nutzung:\n"
            f"     sudo tailscale set --operator={os.environ.get('USER', '$USER')}"
        )


def _start_isolated_tailscaled() -> None:
    global _tailscaled_proc, _ACTIVE_SOCK, _USE_SUDO
    os.makedirs(STATE_DIR, exist_ok=True)
    subprocess.run(
        ["pkill", "-9", "-f", f"tailscaled.*{SOCK_PATH}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.5)
    logf = open(LOG_PATH, "a")
    _tailscaled_proc = subprocess.Popen(
        [
            "tailscaled",
            "--tun=userspace-networking",
            "--socks5-server=localhost:1055",
            f"--state={STATE_FILE}",
            f"--socket={SOCK_PATH}",
        ],
        stdout=logf,
        stderr=subprocess.STDOUT,
    )
    for _ in range(40):
        if os.path.exists(SOCK_PATH):
            break
        if _tailscaled_proc.poll() is not None:
            _die(
                f"tailscaled sofort beendet (rc={_tailscaled_proc.returncode}).\n"
                f"   Log: {LOG_PATH}"
            )
        time.sleep(0.25)
    if not os.path.exists(SOCK_PATH):
        _die(f"tailscaled-Socket nicht erschienen. Log: {LOG_PATH}")
    _ACTIVE_SOCK = SOCK_PATH
    _USE_SUDO = False
    _ok(f"Eigenes tailscaled laeuft   (Socket: {SOCK_PATH})")


def _bring_up_daemon() -> None:
    """Bevorzugt vorhandenen System-Daemon; startet sonst isolierte Instanz."""
    if _system_daemon_available():
        _use_system_tailscaled()
    else:
        _start_isolated_tailscaled()


def _tsc(*args: str, timeout: float = 30, write: bool = False) -> subprocess.CompletedProcess:
    """tailscale-CLI gegen den aktiven Socket. `write=True` fuehrt bei
    Bedarf ueber 'sudo -n' aus (write-Ops brauchen root am System-Socket)."""
    assert _ACTIVE_SOCK is not None, "Kein Socket aktiv (Programmier-Fehler)."
    base = ["tailscale", f"--socket={_ACTIVE_SOCK}", *args]
    if write and _USE_SUDO:
        base = ["sudo", "-n", *base]
    return subprocess.run(base, capture_output=True, text=True, timeout=timeout)


# ---------------------------------------------------------------------------
# 2) tailscale up + Online-Wait
# ---------------------------------------------------------------------------


def _tailscale_up(authkey: str) -> dict:
    up_args = [
        "up",
        f"--auth-key={authkey}",
        f"--hostname={HOSTNAME}",
        "--accept-routes=false",
        "--timeout=30s",
    ]
    tags = os.environ.get("TS_TAGS", "").strip()
    if tags:
        up_args.append(f"--advertise-tags={tags}")
        _info(f"Tags: {tags}")
    r = _tsc(*up_args, timeout=60, write=True)
    print(f"   up rc={r.returncode}  stderr={(r.stderr or '').strip()[:200]}")
    if r.returncode != 0:
        _print_tailscaled_log_tail()
        _die(
            f"'tailscale up' fehlgeschlagen: {r.stderr.strip()}\n"
            "   Haeufige Ursachen:\n"
            "     - Key bereits verbraucht (Single-Use ohne 'Reusable')\n"
            "     - Tailnet-ACL verlangt Tags -> setze TS_TAGS='tag:xxx' in backend/.env.local\n"
            "     - Key gehoert zu anderem Tailnet\n"
            "   Manuell verifizieren:\n"
            "     https://login.tailscale.com/admin/settings/keys  (Key noch gruen?)"
        )

    self_info: dict = {}
    for _ in range(60):
        try:
            st = json.loads(_tsc("status", "--json", timeout=5).stdout)
            self_info = st.get("Self") or {}
            if self_info.get("Online") is True:
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        _print_tailscaled_log_tail()
        _die("Node nach 60s noch nicht online (Self.Online=False).")
    _ok(
        f"Node online:  {self_info.get('HostName')}  "
        f"({(self_info.get('DNSName') or '').rstrip('.')})"
    )
    return self_info


def _print_tailscaled_log_tail(n: int = 25) -> None:
    """Nur relevant im Fallback-Modus (isolierte tailscaled-Instanz)."""
    if _ACTIVE_SOCK != SOCK_PATH:
        return
    try:
        with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()[-n:]
        if lines:
            print(f"\n   --- tailscaled log (letzte {len(lines)} Zeilen, {LOG_PATH}) ---")
            for line in lines:
                print(f"   {line.rstrip()}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 3) Mini-FastAPI Backend (statt der GPU-ASR)
# ---------------------------------------------------------------------------


def _start_fake_backend(api_token: str) -> None:
    try:
        import uvicorn
        from fastapi import FastAPI, WebSocket
    except ImportError:
        _die(
            "fastapi/uvicorn nicht installiert. Installiere:\n"
            "   pip install fastapi 'uvicorn[standard]'"
        )
        return  # unreachable, satisfies type checker

    app = FastAPI(title="Tailscale-Funnel Testbackend")

    @app.get("/health")
    def health():
        return {"status": "ok", "backend": "fake", "hostname": HOSTNAME}

    @app.websocket("/stream")
    async def stream(ws: WebSocket):
        token = ws.query_params.get("token") or ws.headers.get("x-api-token")
        if not token or not secrets.compare_digest(token, api_token):
            await ws.close(code=1008, reason="invalid token")
            return
        await ws.accept()
        await ws.send_json({"hello": "world", "backend": "fake"})
        try:
            while True:
                msg = await ws.receive_text()
                await ws.send_json({"echo": msg})
        except Exception:
            return

    def _serve():
        uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning", access_log=False)

    threading.Thread(target=_serve, daemon=True).start()

    for _ in range(40):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1).read()
            _ok(f"Fake-Backend antwortet auf 127.0.0.1:{PORT}")
            return
        except Exception:
            time.sleep(0.25)
    _die(f"Fake-Backend hat nicht innerhalb 10s auf Port {PORT} geantwortet.")


# ---------------------------------------------------------------------------
# 4) Zert + Funnel  (== Colab Zelle Block 7)
# ---------------------------------------------------------------------------


def _funnel_status_blob() -> str:
    try:
        fs = _tsc("funnel", "status", timeout=5)
        return (fs.stdout or "") + (fs.stderr or "")
    except Exception:
        return ""


def _funnel_serving(port: int) -> bool:
    blob = _funnel_status_blob()
    return f"127.0.0.1:{port}" in blob or f":{port}" in blob


def _issue_cert(dns_name: str) -> None:
    # 'tailscale cert' ist idempotent: hat der Daemon schon ein Zert, wird
    # es einfach nochmal geschrieben. Kein Path-Check noetig.
    _info(f"Stelle TLS-Zert fuer {dns_name} aus (kann 30-90s beim ersten Mal) …")
    try:
        cr = _tsc("cert", dns_name, timeout=180, write=True)
    except subprocess.TimeoutExpired:
        _die(
            "'tailscale cert' nach 180s nicht fertig. Skript nochmal starten;\n"
            "   das Zert wird meist im Hintergrund weiter ausgestellt."
        )
        return
    if cr.returncode != 0:
        msg = (cr.stderr or cr.stdout or "").strip()
        low = msg.lower()
        if any(x in low for x in ("https is not enabled", "enablehttps", "https must be enabled")):
            _die(
                "HTTPS im Tailscale-Admin nicht aktiviert.\n"
                "   https://login.tailscale.com/admin/dns  →  'Enable HTTPS'\n"
                f"   stderr: {msg}"
            )
        _die(f"'tailscale cert' fehlgeschlagen: {msg}")
    _ok("TLS-Zert vorhanden")


def _enable_funnel() -> None:
    if _funnel_serving(PORT):
        _ok(f"Funnel bereits aktiv fuer Port {PORT}")
        return
    _info(f"Aktiviere Funnel auf Port {PORT} …")
    cmd = ["tailscale", f"--socket={_ACTIVE_SOCK}", "funnel", "--bg", str(PORT)]
    if _USE_SUDO:
        cmd = ["sudo", "-n", *cmd]
    fp = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.time() + 90
    served = False
    early_fail_msg = ""

    def _combined_output() -> str:
        # Ausgabe live pruefen: 'Funnel is not enabled' wird von der CLI
        # sofort auf stdout gedruckt, nicht erst am Exit. So brechen wir
        # nicht 90s ins Leere ab.
        try:
            r = subprocess.run(
                ["tailscale", f"--socket={_ACTIVE_SOCK}", "serve", "status"],
                capture_output=True, text=True, timeout=3,
            )
            return (r.stdout or "") + (r.stderr or "")
        except Exception:
            return ""

    while time.time() < deadline:
        if _funnel_serving(PORT):
            served = True
            break
        rc = fp.poll()
        if rc is not None:
            # Prozess terminiert - Ausgabe einsammeln.
            try:
                o, e = fp.communicate(timeout=5)
            except Exception:
                o, e = "", ""
            early_fail_msg = (o or "") + (e or "")
            break
        time.sleep(1)

    out, err = "", ""
    if fp.poll() is None:
        fp.terminate() if served else fp.kill()
        try:
            out, err = fp.communicate(timeout=5)
        except Exception:
            try:
                fp.kill()
                out, err = fp.communicate(timeout=5)
            except Exception:
                pass
    else:
        if early_fail_msg:
            # war bereits im Loop eingesammelt
            out, err = "", early_fail_msg
        else:
            try:
                out, err = fp.communicate(timeout=5)
            except Exception:
                pass

    print("   --- funnel ---")
    if out:
        print(f"   stdout: {out.strip()}")
    if err:
        print(f"   stderr: {err.strip()}")

    if not _funnel_serving(PORT):
        combined = ((err or "") + " " + (out or "")).strip()
        low = combined.lower()
        # 1) Funnel muss erst pro Node im Admin-Panel aktiviert werden.
        if "funnel is not enabled" in low or "/f/funnel?node=" in combined:
            import re as _re
            m = _re.search(r"https://login\.tailscale\.com/f/funnel\?node=\S+", combined)
            url = m.group(0) if m else "https://login.tailscale.com/admin"
            _die(
                "Funnel ist auf deinem Tailnet fuer diesen Node NICHT freigegeben.\n"
                "   Aktivierungs-URL (einmalig im Browser oeffnen und bestaetigen):\n"
                f"     {url}\n"
                "   Danach dieses Skript nochmal starten."
            )
        # 2) ACL-Attribute fehlen.
        if "funnel" in low and "attribute" in low:
            _die(
                "Funnel-ACL nicht gesetzt.\n"
                "   https://login.tailscale.com/admin/acls  ergaenze:\n"
                '     "nodeAttrs": [ { "target": ["*"], "attr": ["funnel"] } ]\n'
                f"   stderr: {combined}"
            )
        _die(
            "Funnel wurde nach 90s nicht aktiv.\n"
            f"   funnel status:\n{_funnel_status_blob() or '(leer)'}\n"
            f"   Manuell testen:  tailscale --socket={_ACTIVE_SOCK} funnel --bg {PORT}"
        )
    _ok("Funnel aktiv")


# ---------------------------------------------------------------------------
# 5) End-to-End-Check ueber die oeffentliche URL
# ---------------------------------------------------------------------------


def _check_public(public_url: str, api_token: str) -> None:
    _info("End-to-End-Check ueber die oeffentliche Funnel-URL …")
    hurl = f"{public_url}/health"
    # Der erste HTTPS-Aufruf kann 5-10s brauchen (DERP-Warmup); Retry mit
    # Backoff macht den Test robust.
    for i in range(12):
        try:
            with urllib.request.urlopen(hurl, timeout=8) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                _ok(f"GET {hurl}  ->  {resp.status}  {body}")
                return
        except Exception as e:
            print(f"   [{i+1}/12] {type(e).__name__}: {e}")
            time.sleep(2)
    _die(f"Health-Check ueber Funnel-URL fehlgeschlagen: {hurl}")


# ---------------------------------------------------------------------------
# 6) Cleanup bei Ctrl+C / atexit
# ---------------------------------------------------------------------------


def _cleanup() -> None:
    if _ACTIVE_SOCK is None:
        return
    try:
        _tsc("funnel", "reset", timeout=5, write=True)
    except Exception:
        pass
    # Kein 'tailscale logout': wuerde das --operator-Setting zuruecksetzen
    # und beim naechsten Run wieder sudo-Password anfordern. Ephemere
    # Reusable-Keys erlauben ohnehin unbegrenztes Re-up beim naechsten
    # Start; das aktuelle Node-Objekt raeumt Tailscale nach Inaktivitaet
    # automatisch weg.
    if _tailscaled_proc and _tailscaled_proc.poll() is None:
        _tailscaled_proc.terminate()
        try:
            _tailscaled_proc.wait(timeout=5)
        except Exception:
            _tailscaled_proc.kill()
    print("\n🧹  Cleanup abgeschlossen  (Node bleibt authentisiert, Funnel weg).")


def _install_signal_handlers() -> None:
    def _handler(signum, frame):
        print(f"\n⏹  Signal {signum} empfangen, beende …")
        sys.exit(0)

    signal.signal(signal.SIGINT, _handler)
    signal.signal(signal.SIGTERM, _handler)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    _install_signal_handlers()
    atexit.register(_cleanup)

    print("=" * 68)
    print("🧪  Tailscale-Funnel-Test  (spiegelt Colab-Zelle 8 1:1)")
    print("=" * 68)

    _load_env_local()
    authkey = _preflight()
    api_token = os.environ.get("API_TOKEN") or secrets.token_urlsafe(24)

    _bring_up_daemon()
    self_info = _tailscale_up(authkey)
    _start_fake_backend(api_token)

    dns_name = (self_info.get("DNSName") or "").rstrip(".")
    if not dns_name:
        _die("Konnte DNSName nicht aus 'tailscale status --json' lesen.")
    public_url = f"https://{dns_name}"

    _issue_cert(dns_name)
    _enable_funnel()
    _check_public(public_url, api_token)

    print("\n" + "=" * 68)
    print(f"🌍 Public-URL:  {public_url}")
    print(f"🔐 API-Token:   {api_token}")
    print("=" * 68)
    print(f"Health-Check:  {public_url}/health")
    print(f"WebSocket:     {public_url.replace('https://', 'wss://')}/stream?token={api_token}")
    print("\nStrg+C beendet den Test und raeumt tailscaled+Funnel auf.")

    # Idle-Loop bis Ctrl+C.
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
