"""Resolution of the external binaries the engine depends on.

Both the fast path and the download path sit on two command-line tools,
neither of which is guaranteed to exist on a given host:

* ``yt-dlp`` resolves a track and fetches its bytes.
* ``ffmpeg`` post-processes audio — extraction, conversion, artwork embedding.

Guessing ``"yt-dlp"`` and letting a spawn raise turns a missing binary into an
opaque ``FileNotFoundError`` deep inside a job. Resolving once per process and
reporting exactly what was found lets callers pass an explicit path, pass
``--ffmpeg-location``, or degrade deliberately.

Ported unchanged from the current stack's ``app/core/toolchain.py``: the
resolution order (env override → ``PATH`` → known directories) is a contract
the deployment docs and the Doctor's repairs both rely on.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import structlog

log = structlog.get_logger()

_LOCK = threading.Lock()


def _prefix() -> str:
    """The Termux installation prefix, when running inside one."""
    return os.environ.get("PREFIX", "")


def is_termux() -> bool:
    """True when this process runs under Termux/Android."""
    prefix = _prefix()
    return "com.termux" in prefix or os.path.isdir("/data/data/com.termux/files/usr/bin")


def _search_dirs() -> list[Path]:
    """Directories to search, in priority order, after ``PATH``."""
    candidates = [
        Path(_prefix()) / "bin" if _prefix() else None,
        Path("/data/data/com.termux/files/usr/bin"),
        Path.home() / ".local" / "bin",
        Path("/usr/local/bin"),
        Path("/usr/bin"),
        Path("/bin"),
        Path("/opt/homebrew/bin"),
        Path("/snap/bin"),
    ]
    return [c for c in candidates if c is not None]


@dataclass(frozen=True)
class Tool:
    """A resolved external binary."""

    name: str
    path: Optional[str]
    env_var: str

    @property
    def available(self) -> bool:
        return self.path is not None

    @property
    def version(self) -> Optional[str]:
        """First line of ``<tool> --version``, or None when unavailable."""
        if not self.path:
            return None
        args = [self.path, "--version"] if self.name == "yt-dlp" else [self.path, "-version"]
        try:
            res = subprocess.run(
                args, capture_output=True, text=True, timeout=8, check=False
            )
        except Exception:  # noqa: BLE001 — a probe failure is not fatal
            return None
        out = ((res.stdout or "") + (res.stderr or "")).strip().splitlines()
        return out[0][:120] if out else None


_cache: dict[str, Tool] = {}


def _resolve(name: str, env_var: str) -> Tool:
    """Locate ``name``: explicit override → ``PATH`` → known directories."""
    override = os.environ.get(env_var, "").strip()
    if override:
        p = Path(override).expanduser()
        if p.is_file() and os.access(p, os.X_OK):
            return Tool(name, str(p), env_var)
        log.warning("toolchain.override_invalid", tool=name, env_var=env_var, value=override)

    found = shutil.which(name)
    if found:
        return Tool(name, found, env_var)

    for directory in _search_dirs():
        candidate = directory / name
        try:
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return Tool(name, str(candidate), env_var)
        except OSError:
            continue

    return Tool(name, None, env_var)


def _get(name: str, env_var: str) -> Tool:
    with _LOCK:
        tool = _cache.get(name)
        if tool is None:
            tool = _resolve(name, env_var)
            _cache[name] = tool
            if tool.available:
                log.info("toolchain.resolved", tool=name, path=tool.path)
            else:
                log.warning("toolchain.missing", tool=name)
        return tool


def ytdlp() -> Tool:
    """The resolved ``yt-dlp`` binary."""
    return _get("yt-dlp", "YTDLP_BIN")


def ffmpeg() -> Tool:
    """The resolved ``ffmpeg`` binary."""
    return _get("ffmpeg", "FFMPEG_BIN")


def ytdlp_bin() -> str:
    """Path to ``yt-dlp``, or the bare name so a spawn fails visibly."""
    return ytdlp().path or "yt-dlp"


def ffmpeg_path() -> Optional[str]:
    return ffmpeg().path


def has_ffmpeg() -> bool:
    """True when audio can be post-processed (extract, convert, embed art)."""
    return ffmpeg().available


def ffmpeg_location_args(binary: str = "yt-dlp") -> list[str]:
    """``--ffmpeg-location`` for a yt-dlp invocation, when ffmpeg exists.

    yt-dlp looks for ``ffmpeg`` on the process ``PATH``, which is often not the
    one a service was started with.
    """
    if binary != "yt-dlp":
        return []
    path = ffmpeg_path()
    return ["--ffmpeg-location", path] if path else []


# ── Repair ────────────────────────────────────────────────────


def install_hint(name: str) -> str:
    """A copy-pasteable command that installs ``name`` on this host."""
    if is_termux():
        return f"pkg install -y {name}"
    if shutil.which("apt-get"):
        return f"sudo apt-get install -y {name}"
    if shutil.which("brew"):
        return f"brew install {name}"
    return f"install {name} with your system package manager"


def install_ffmpeg(timeout: float = 600.0) -> tuple[bool, str]:
    """Install ffmpeg with the host package manager.

    Only the Termux package manager is driven automatically: it needs no
    privilege escalation, which the Android build cannot provide. Everywhere
    else the caller is handed the command to run.
    """
    if has_ffmpeg():
        return True, "ffmpeg is already available"

    if not is_termux():
        return False, f"Install ffmpeg manually: {install_hint('ffmpeg')}"

    cmd = ["pkg", "install", "-y", "ffmpeg"]
    log.info("toolchain.install_ffmpeg.start", cmd=" ".join(cmd))
    try:
        res = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False
        )
    except FileNotFoundError:
        return False, "pkg is not available on this host"
    except subprocess.TimeoutExpired:
        return False, "ffmpeg install timed out"
    except Exception as e:  # noqa: BLE001 — surfaced to the caller verbatim
        return False, str(e)[:200]

    output = ((res.stdout or "") + (res.stderr or "")).strip()
    refresh()
    if has_ffmpeg():
        log.info("toolchain.install_ffmpeg.ok", path=ffmpeg_path())
        return True, f"ffmpeg installed at {ffmpeg_path()}"
    log.warning("toolchain.install_ffmpeg.failed", rc=res.returncode, tail=output[-200:])
    return False, output[-400:] or f"pkg exited with code {res.returncode}"


def _script_interpreter(path: str) -> Optional[str]:
    """The Python that owns a script-based install at ``path``, or None.

    A pip/wheel install of yt-dlp is a console script with a
    ``#!/path/to/python`` shebang, so the interpreter that installed it — and
    therefore the one that can upgrade it — is written in the file. Frozen
    builds (a real ELF/Mach-O binary) have no shebang.
    """
    try:
        with open(path, "rb") as handle:
            first = handle.readline(256)
    except OSError:
        return None
    if not first.startswith(b"#!"):
        return None
    parts = first[2:].decode("utf-8", "replace").strip().split()
    if not parts:
        return None
    # `#!/usr/bin/env python3` names the interpreter as an argument.
    if Path(parts[0]).name == "env":
        return shutil.which(parts[-1]) if len(parts) > 1 else None
    return parts[0]


def _pip_upgrade_ytdlp(binary_path: str, timeout: float) -> tuple[bool, str]:
    """Upgrade a pip/wheel yt-dlp through the interpreter that installed it."""
    python = _script_interpreter(binary_path) or sys.executable
    if not python:
        return False, "no Python interpreter found to run pip"

    base = [python, "-m", "pip", "install", "--upgrade"]
    log.info("toolchain.upgrade_ytdlp.pip", python=python)

    for args in ([*base, "yt-dlp"], [*base, "--break-system-packages", "yt-dlp"]):
        try:
            res = subprocess.run(
                args, capture_output=True, text=True, timeout=timeout, check=False
            )
        except subprocess.TimeoutExpired:
            return False, "pip install yt-dlp timed out"
        except FileNotFoundError:
            return False, f"pip is not available for {python}"
        except Exception as e:  # noqa: BLE001
            return False, str(e)[:200]

        output = ((res.stdout or "") + (res.stderr or "")).strip()
        if res.returncode == 0:
            return True, output[-400:] or f"updated yt-dlp via {python}"

        # PEP 668 hosts refuse a plain install; the explicit override is what
        # lets the upgrade land at all.
        if "externally-managed-environment" not in output:
            return False, output[-400:] or f"pip exited with code {res.returncode}"

    return False, "pip refused the upgrade even with --break-system-packages"


def upgrade_ytdlp(timeout: float = 180.0) -> tuple[bool, str]:
    """Update yt-dlp, falling back to pip when it was pip-installed.

    ``yt-dlp -U`` refuses to run for a pip/wheel install — it reports "You
    installed yt-dlp with pip or using the wheel from PyPi" and exits non-zero.
    On Termux that is *every* install, so the daily update had never actually
    updated anything: yt-dlp silently aged out while YouTube changed its player
    clients, and extraction started failing on tracks the current release
    handles fine.
    """
    binary = ytdlp()
    if not binary.available:
        return False, f"yt-dlp is not installed — {install_hint('yt-dlp')}"

    try:
        res = subprocess.run(
            [binary.path, "-U"], capture_output=True, text=True, timeout=timeout, check=False
        )
    except subprocess.TimeoutExpired:
        return False, "yt-dlp -U timed out"
    except Exception as e:  # noqa: BLE001
        return False, str(e)[:200]

    output = ((res.stdout or "") + (res.stderr or "")).strip()
    if res.returncode == 0:
        refresh()
        return True, output[-400:] or "no output"

    # `-U` declined; the install is probably pip-managed, so upgrade it there.
    first_line = output or f"yt-dlp -U exited with code {res.returncode}"
    ok, pip_output = _pip_upgrade_ytdlp(binary.path or "yt-dlp", timeout)
    refresh()
    return ok, f"{first_line}\n{pip_output}"[-400:]


def refresh() -> None:
    """Drop the resolution cache — call after installing or upgrading a tool."""
    with _LOCK:
        _cache.clear()


def capabilities() -> dict:
    """A non-secret summary of what this host can do, for health/diagnostics."""
    yt = ytdlp()
    ff = ffmpeg()
    return {
        "ytdlp": {"present": yt.available, "path": yt.path, "version": yt.version},
        "ffmpeg": {
            "present": ff.available,
            "path": ff.path,
            "installHint": None if ff.available else install_hint("ffmpeg"),
        },
        "termux": is_termux(),
        "canDownload": yt.available,
        "canTranscode": yt.available and ff.available,
    }
