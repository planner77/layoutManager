#!/usr/bin/env python3
"""Start built app with disposable DB and poll public health on loopback."""
import os
import signal
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

src = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="verify-local-smoke-") as tmp:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = {k: v for k, v in os.environ.items() if not any(s in k.lower() for s in ("token", "secret", "password", "credential", "remote_repo"))}
    env.update({"DATABASE_URL": "file:" + tmp + "/smoke.sqlite", "CAD_STORAGE_PATH": tmp + "/cad",
                "CAD_STORAGE_BACKEND": "local", "PORT": str(port), "HOSTNAME": "127.0.0.1"})
    deployed = subprocess.run(["npm", "run", "db:deploy"], cwd=src, env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
    if deployed.returncode:
        sys.exit("disposable DB migration failed")
    process = subprocess.Popen(["node", ".next/standalone/server.js"],
                               cwd=src, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               start_new_session=True)
    try:
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            if process.poll() is not None:
                sys.exit("app exited before health")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as response:
                    if response.status == 200:
                        print("loopback app health 200")
                        break
            except Exception:
                time.sleep(.5)
        else:
            sys.exit("app health timeout")
    finally:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
