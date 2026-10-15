"""Setup and doctor — make the download toolchain usable from the terminal.

The CLI drives the same binaries the server does (yt-dlp + ffmpeg), located
through :mod:`app.core.toolchain`. This module is the human-facing half of
that: it reports what was found, and installs what is missing.

``app.core.toolchain`` only auto-installs ffmpeg through Termux's ``pkg``
because that is the one package manager the flag-ship Android build needs no
privileges for. Everything else is left to the caller — so here we try the
toolchain first, then fall back to a privileged-host manager (apt) when the
process actually has one, and finally hand the user a copy-pasteable hint.
Nothing is installed without being asked for explicitly.
"""

from __future__ import annotations

import shutil
import subprocess
import sys

from app.core import toolchain

from cli import ui


def _venv_ytdlp() -> str | None:
    """The yt-dlp console script shipped with the api's uv environment.

    yt-dlp is a declared dependency of the api, so ``uv sync`` already wrote a
    working binary into ``api/.venv/bin``. Resolving it here means the CLI
    works even before any system-wide install.
    """
    candidate = shutil.which("yt-dlp")
    if candidate:
        return candidate
    from pathlib import Path

    venv_bin = Path(sys.executable).parent
    script = venv_bin / "yt-dlp"
    return str(script) if script.is_file() else None


def report() -> dict:
    """Print the capability summary and return the raw capability dict."""
    caps = toolchain.capabilities()
    ui.sep()
    yt = caps["ytdlp"]
    ff = caps["ffmpeg"]
    ui.info(
        f"yt-dlp  {ui.GR + 'ok' + ui.R if yt['present'] else ui.RD + 'missing' + ui.R}"
        f"  {ui.DIM}{yt['path'] or '—'}{ui.R}"
    )
    ui.info(
        f"ffmpeg  {ui.GR + 'ok' + ui.R if ff['present'] else ui.RD + 'missing' + ui.R}"
        f"  {ui.DIM}{ff['path'] or '—'}{ui.R}"
    )
    ui.dim(
        f"host: {'termux' if caps['termux'] else 'unix'}   "
        f"can download: {'yes' if caps['canDownload'] else 'no'}   "
        f"can transcode: {'yes' if caps['canTranscode'] else 'no'}"
    )
    if not ff["present"] and ff.get("installHint"):
        ui.dim(f"install ffmpeg: {ff['installHint']}")
    return caps


def _apt_available() -> bool:
    return shutil.which("apt-get") is not None


def _install_ffmpeg_apt(timeout: float = 600.0) -> tuple[bool, str]:
    """Install ffmpeg with apt when this host has it (root/privileged)."""
    if not _apt_available():
        return False, f"Install ffmpeg: {toolchain.install_hint('ffmpeg')}"
    env = {"DEBIAN_FRONTEND": "noninteractive"}
    import os

    merged = {**os.environ, **env}
    try:
        subprocess.run(
            ["apt-get", "update", "-qq"], capture_output=True, text=True, timeout=timeout, env=merged, check=False
        )
        res = subprocess.run(
            ["apt-get", "install", "-y", "-qq", "ffmpeg"],
            capture_output=True,
            text=True,
            timeout=timeout,
            env=merged,
            check=False,
        )
    except Exception as e:  # noqa: BLE001 — surfaced verbatim
        return False, str(e)[:200]
    toolchain.refresh()
    if toolchain.has_ffmpeg():
        return True, f"ffmpeg installed at {toolchain.ffmpeg_path()}"
    tail = ((res.stdout or "") + (res.stderr or "")).strip()[-400:]
    return False, tail or f"apt-get exited with code {res.returncode}"


def install_ffmpeg(timeout: float = 600.0) -> tuple[bool, str]:
    """Install ffmpeg, trying the toolchain's manager then apt."""
    if toolchain.has_ffmpeg():
        return True, "ffmpeg is already available"
    ok, message = toolchain.install_ffmpeg(timeout=timeout)
    if ok:
        return True, message
    # The toolchain only drives Termux's pkg. On a normal host that returns a
    # hint rather than an install, so try apt when it exists.
    if _apt_available():
        ok, apt_message = _install_ffmpeg_apt(timeout=timeout)
        if ok:
            return True, apt_message
        return False, apt_message
    return False, message


def install_ytdlp(timeout: float = 300.0) -> tuple[bool, str]:
    """Ensure a yt-dlp binary exists, installing it into the api venv if not."""
    existing = _venv_ytdlp()
    if existing:
        return True, f"yt-dlp is already available at {existing}"
    try:
        res = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:200]
    toolchain.refresh()
    if _venv_ytdlp():
        return True, "yt-dlp installed"
    output = ((res.stdout or "") + (res.stderr or "")).strip()
    return False, output[-400:] or f"pip exited with code {res.returncode}"


def upgrade_ytdlp() -> tuple[bool, str]:
    """Update yt-dlp in place (the app's daily cron does the same)."""
    return toolchain.upgrade_ytdlp()


def cmd_setup(args) -> int:
    """``rheoson setup`` — install and verify everything downloads need."""
    from app.core.config import settings

    ui.blank()
    ui.info("Preparing the Rheoson download toolchain")
    ui.sep()

    caps = report()

    # 1 — directories the download engine writes to.
    from pathlib import Path

    for label, path in (("music", settings.MUSIC_DIR), ("downloads", settings.DOWNLOADS_DIR)):
        p = Path(path).expanduser()
        try:
            p.mkdir(parents=True, exist_ok=True)
            ui.ok(f"{label} dir ready: {ui.DIM}{p}{ui.R}")
        except OSError as e:
            ui.err(f"{label} dir not writable ({p}): {e}")

    # 2 — yt-dlp (no downloads at all without it).
    if not caps["ytdlp"]["present"]:
        ui.info("yt-dlp missing — installing…")
        ok, message = install_ytdlp()
        (ui.ok if ok else ui.err)(message)
    else:
        ui.ok("yt-dlp present")

    # 3 — ffmpeg (conversion, artwork + lyrics embedding).
    if not toolchain.has_ffmpeg():
        ui.info("ffmpeg missing — installing…")
        ok, message = install_ffmpeg()
        (ui.ok if ok else ui.err)(message)
    else:
        ui.ok("ffmpeg present")

    ui.blank()
    ui.sep()
    caps = toolchain.capabilities()
    if caps["canTranscode"]:
        ui.ok(f"{ui.GR}{ui.B}All set{ui.R} — downloads and conversion are ready.")
    elif caps["canDownload"]:
        ui.warn("Downloads will work, but ffmpeg is missing: no conversion, artwork or lyrics embedding.")
    else:
        ui.err("yt-dlp is still missing — downloads cannot start.")
        ui.dim(f"Try: {toolchain.install_hint('yt-dlp')}")
    ui.blank()
    return 0 if caps["canDownload"] else 1


def cmd_tools(args) -> int:
    """``rheoson tools`` — show versions without changing anything."""
    ui.blank()
    ui.info("Download toolchain")
    yt = toolchain.ytdlp()
    ff = toolchain.ffmpeg()
    ui.ok(f"yt-dlp  {ui.DIM}{yt.version or 'not installed'}{ui.R}")
    ui.ok(f"ffmpeg  {ui.DIM}{ff.version or 'not installed'}{ui.R}")
    report()
    if getattr(args, "upgrade", False):
        ui.info("Updating yt-dlp…")
        ok, message = upgrade_ytdlp()
        (ui.ok if ok else ui.err)(message.splitlines()[-1] if message else "")
    ui.blank()
    return 0
