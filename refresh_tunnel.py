import argparse
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request


BASE_DIR = os.path.dirname(__file__)
ENV_PATH = os.path.join(BASE_DIR, ".env")
CF_EXE = os.path.join(BASE_DIR, "cloudflared.exe")
CF_LOG = os.path.join(BASE_DIR, "cloudflared.log")
CF_DOWNLOAD_URL = (
    "https://github.com/cloudflare/cloudflared/releases/latest/download/"
    "cloudflared-windows-amd64.exe"
)
URL_RE = re.compile(r"https://[-a-z0-9]+\.trycloudflare\.com", re.IGNORECASE)


def _read_env(path: str) -> dict[str, str]:
    out: dict[str, str] = {}
    if not os.path.exists(path):
        return out
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _upsert_env_value(path: str, key: str, value: str) -> None:
    lines: list[str] = []
    found = False
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
    for i, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            found = True
            break
    if not found:
        lines.insert(0, f"{key}={value}")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines).rstrip() + "\n")


def _extract_host(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).hostname or ""
    except Exception:
        return ""


def _public_dns_resolves(host: str) -> bool:
    if not host:
        return False
    try:
        cp = subprocess.run(
            ["nslookup", host, "1.1.1.1"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        txt = (cp.stdout or "") + "\n" + (cp.stderr or "")
        low = txt.lower()
        if "non-existent domain" in low or "can't find" in low or "nxdomain" in low:
            return False
        return cp.returncode == 0
    except Exception:
        return False


def _cloudflared_running() -> bool:
    try:
        cp = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq cloudflared.exe"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return "cloudflared.exe" in (cp.stdout or "").lower()
    except Exception:
        return False


def _ensure_cloudflared_binary() -> None:
    if os.path.exists(CF_EXE):
        return
    print(f"[tunnel] downloading cloudflared -> {CF_EXE}")
    urllib.request.urlretrieve(CF_DOWNLOAD_URL, CF_EXE)


def _stop_cloudflared() -> None:
    subprocess.run(
        ["taskkill", "/IM", "cloudflared.exe", "/F"],
        capture_output=True,
        text=True,
        check=False,
    )


def _start_quick_tunnel(port: int) -> None:
    if os.path.exists(CF_LOG):
        try:
            os.remove(CF_LOG)
        except OSError:
            pass
    creation_flags = 0
    if os.name == "nt":
        creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    subprocess.Popen(
        [
            CF_EXE,
            "tunnel",
            "--url",
            f"http://127.0.0.1:{port}",
            "--no-autoupdate",
            "--config",
            "NUL",
            "--logfile",
            CF_LOG,
        ],
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        creationflags=creation_flags,
    )


def _wait_tunnel_url(timeout_sec: int = 60) -> str:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if os.path.exists(CF_LOG):
            try:
                with open(CF_LOG, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                matches = URL_RE.findall(content)
                if matches:
                    return matches[-1]
            except OSError:
                pass
        time.sleep(1)
    return ""


def ensure_tunnel(port: int, force_refresh: bool = False) -> str:
    env = _read_env(ENV_PATH)
    current = (env.get("WEBAPP_URL") or "").strip().rstrip("/")
    host = _extract_host(current)
    if (
        not force_refresh
        and current
        and host.endswith("trycloudflare.com")
        and _public_dns_resolves(host)
        and _cloudflared_running()
    ):
        print(f"[tunnel] keep existing WEBAPP_URL: {current}")
        return current

    print("[tunnel] refreshing quick tunnel...")
    _ensure_cloudflared_binary()
    _stop_cloudflared()
    _start_quick_tunnel(port=port)
    new_url = _wait_tunnel_url(timeout_sec=75).rstrip("/")
    if not new_url:
        raise RuntimeError("unable to get new trycloudflare URL from cloudflared.log")
    new_host = _extract_host(new_url)
    if not _public_dns_resolves(new_host):
        raise RuntimeError(f"new tunnel host not resolvable via 1.1.1.1: {new_host}")

    _upsert_env_value(ENV_PATH, "WEBAPP_URL", new_url)
    print(f"[tunnel] WEBAPP_URL updated: {new_url}")
    return new_url


def main() -> int:
    parser = argparse.ArgumentParser(description="Ensure Cloudflare quick tunnel URL for Mini App.")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--force-refresh", action="store_true")
    args = parser.parse_args()
    try:
        url = ensure_tunnel(port=args.port, force_refresh=args.force_refresh)
        print(f"FINAL_URL={url}")
        return 0
    except Exception as e:
        print(f"[tunnel] ERROR: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
