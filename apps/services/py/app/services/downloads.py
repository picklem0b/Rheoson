"""Download jobs — the engine owns the queue, because only the engine can.

The work is ``yt-dlp`` writing bytes and ``ffmpeg`` re-muxing them. Neither
exists anywhere else in the stack, so putting the queue in the engine removes
the hop that would otherwise exist purely to ask Python to do something: a job
created over HTTP is executed here, and progress leaves here.

What is ported deliberately, because each one was learned the hard way on the
current stack:

* **Semaphore-bounded concurrency.** Downloads are IO-bound but a handful at
  once already saturate a phone's uplink; more just makes every job slower and
  every ETA a lie.
* **``.part`` staging that survives failure.** A failed, cancelled or
  restart-interrupted job keeps its staged bytes, and ``yt-dlp --continue``
  picks up where it stopped. Losing 300 MB of a 320 MB track to a flaky edge is
  the single most annoying thing a downloader can do.
* **Resumability derived from disk at read time**, never from a stored flag —
  a flag can disagree with the filesystem after a crash, and then the UI lies.
* **Progress parsed with a real regex** (percent, speed, ETA), so the client can
  show an honest number instead of a spinner.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
import structlog

from app.core import settings as engine_settings, toolchain
from app.core.errors import EngineError
from app.services import identity, library, metadata

log = structlog.get_logger()

QUEUED = "queued"
RUNNING = "running"
COMPLETED = "completed"
FAILED = "failed"
CANCELLED = "cancelled"

ACTIVE_STATUSES = frozenset({QUEUED, RUNNING})
TERMINAL_STATUSES = frozenset({COMPLETED, FAILED, CANCELLED})

#: Audio-only, in a container that needs no re-mux where possible. The ladder
#: mirrors the resolve path so a track that streams also downloads.
FORMAT_SELECTOR = "bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio/best[ext=mp4]/best"

#: ``[download]  45.2% of ~4.56MiB at 1.23MiB/s ETA 00:03`` (and the variants
#: with no speed or no ETA). One pattern, three optional groups — a download
#: that reports partial state still updates the fields it does report.
PROGRESS_RE = re.compile(
    r"^\[download\]\s+(?P<percent>\d+(?:\.\d+)?)%"
    r"(?:\s+of\s+~?\s*(?P<size>[\d.]+)\s*(?P<size_unit>[KMGT]?i?B))?"
    r"(?:\s+at\s+(?P<speed>[\d.]+)\s*(?P<speed_unit>[KMGT]?i?B)/s)?"
    r"(?:\s+ETA\s+(?P<eta>[\d:]+|Unknown))?"
)

#: Markers meaning "YouTube refused this track for this player client". The
#: user-visible copy is the registry's; this only decides which code to carry.
_REFUSAL_MARKERS = (
    "sign in to confirm",
    "confirm you're not a bot",
    "requested format is not available",
    "unable to extract",
    "video is not available",
    "content is not available",
    "unable to download video data",
    "http error 403",
    "nsig extraction failed",
)

_UNIT_BYTES = {
    "B": 1,
    "KB": 1000,
    "KiB": 1024,
    "MB": 1000**2,
    "MiB": 1024**2,
    "GB": 1000**3,
    "GiB": 1024**3,
    "TB": 1000**4,
    "TiB": 1024**4,
}

_UNSAFE_PATH_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe_name(value: str, fallback: str = "Unknown") -> str:
    """A path segment that cannot escape the library root.

    Separators, colons, wildcards and control characters are stripped, the
    result is trimmed of dots and spaces (so ``..`` cannot survive as a
    segment), and it is length-bounded.
    """
    cleaned = _UNSAFE_PATH_CHARS.sub("_", (value or "").strip()).strip(". ")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return (cleaned or fallback)[:120]


def _to_bytes(value: str, unit: str) -> Optional[int]:
    try:
        return int(float(value) * _UNIT_BYTES[unit])
    except (KeyError, TypeError, ValueError):
        return None


@dataclass
class Job:
    """One download. Every field is JSON-serialisable — the queue is persisted
    as JSON so a restart resumes from a readable file, not a private format."""

    id: str
    owner: str
    target: str
    track_id: Optional[str] = None
    url: Optional[str] = None
    status: str = QUEUED
    progress: float = 0.0
    speed: Optional[float] = None
    eta: Optional[int] = None
    total_bytes: Optional[int] = None
    downloaded_bytes: int = 0
    title: str = ""
    artist: str = ""
    album: str = ""
    file_path: str = ""
    file_id: str = ""
    filename: str = ""
    error: Optional[str] = None
    error_code: Optional[str] = None
    attempts: int = 0
    resume_requested: Optional[bool] = None
    #: The data directory this job was created in, carried on the job rather
    #: than re-read at every step. Config is boot-time; a job that re-resolved
    #: it could stage in one directory and finalise in another.
    data_dir: str = ""
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)


class DownloadManager:
    """The queue: create, run, retry, cancel, delete — all owner-scoped."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._jobs: dict[str, Job] = {}
        self._processes: dict[str, subprocess.Popen] = {}
        self._cancels: set[str] = set()
        self._executor: Optional[ThreadPoolExecutor] = None
        self._loaded = False
        # Resolved once, at construction: the queue file, the staging root and
        # every job's destination all live under one directory, and they must
        # all agree even if the environment changes under a long-running job.
        self._data_dir = engine_settings.load().data_dir

    # ── Lifecycle ─────────────────────────────────────────────

    @property
    def data_dir(self) -> str:
        return self._data_dir

    @property
    def jobs_file(self) -> Path:
        return Path(self._data_dir) / ".download_jobs.json"

    @property
    def staging_root(self) -> Path:
        return Path(self._data_dir) / ".staging"

    def staging_dir(self, job_id: str) -> Path:
        return self.staging_root / job_id

    def _job_staging(self, job: Job) -> Path:
        """A job's staging directory: recorded on the job, so it survives a
        reload from disk with the same answer."""
        return Path(job.data_dir or self._data_dir) / ".staging" / job.id

    def _executor_lazy(self) -> ThreadPoolExecutor:
        if self._executor is None:
            workers = max(1, engine_settings.load().download_concurrency)
            self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="dl")
        return self._executor

    def load(self) -> None:
        """Read persisted jobs. A job that was ``running`` when the process died
        is marked failed-and-resumable rather than left running forever: nothing
        is executing it any more, and claiming otherwise strands the UI."""
        with self._lock:
            if self._loaded:
                return
            self._loaded = True
            try:
                raw = json.loads(self.jobs_file.read_text("utf-8"))
            except FileNotFoundError:
                return
            except Exception as e:  # noqa: BLE001 — a corrupt queue file is not fatal
                log.warning("downloads.load.failed", error=str(e))
                return

            for item in raw.get("jobs", []):
                try:
                    job = Job(**item)
                except TypeError:
                    continue
                if job.status in ACTIVE_STATUSES:
                    job.status = FAILED
                    job.error = "Interrupted by a restart"
                    job.error_code = "DEX01"
                self._jobs[job.id] = job

    def _persist(self) -> None:
        try:
            self.jobs_file.parent.mkdir(parents=True, exist_ok=True)
            payload = json.dumps({"jobs": [j.to_dict() for j in self._jobs.values()]}, indent=2)
            tmp = self.jobs_file.with_suffix(".json.tmp")
            tmp.write_text(payload, "utf-8")
            tmp.replace(self.jobs_file)
        except Exception as e:  # noqa: BLE001
            log.warning("downloads.persist.failed", error=str(e))

    # ── Create ────────────────────────────────────────────────

    def create(
        self,
        *,
        owner: str,
        track_id: Optional[str] = None,
        url: Optional[str] = None,
        title: str = "",
    ) -> Job:
        settings = engine_settings.load()
        if not owner:
            raise EngineError("DVA03", 400, "A download needs an owner")

        track_id = (track_id or "").strip() or None
        url = (url or "").strip() or None
        if not track_id and not url:
            raise EngineError("DVA03")

        if track_id and not _is_bare_id(track_id):
            raise EngineError("DVA04", 400, track_id[:60])
        if url and len(url) > settings.max_url_len:
            raise EngineError("DVA02", 400, f"{len(url)} characters")
        if url and not (url.startswith("http://") or url.startswith("https://")):
            raise EngineError("DVA01", 400, url[:80])

        if not toolchain.ytdlp().available:
            raise EngineError("DEN02", 503)

        target = track_id or url or ""

        with self._lock:
            for job in self._jobs.values():
                if job.owner == owner and job.target == target and job.status in ACTIVE_STATUSES:
                    raise EngineError("DCN01", 409)

            thread_count = sum(1 for j in self._jobs.values() if j.status == RUNNING)
            queued = sum(1 for j in self._jobs.values() if j.status == QUEUED)
            if thread_count + queued >= settings.download_queue_max:
                raise EngineError("DLM01", 429)

            job = Job(
                id=uuid.uuid4().hex[:16],
                owner=owner,
                target=target,
                track_id=track_id,
                url=url,
                title=title.strip()[:200],
                data_dir=self._data_dir,
            )
            self._jobs[job.id] = job
            self._persist()

        self._job_staging(job).mkdir(parents=True, exist_ok=True)
        self._submit(job.id)
        self._publish("download:created", job)
        return job

    def _submit(self, job_id: str) -> None:
        self._executor_lazy().submit(self._run_guarded, job_id)

    def _run_guarded(self, job_id: str) -> None:
        """Run a job, converting every failure into this job's failure state.

        A worker thread that raises would lose the job silently; a worker that
        catches turns the reason into something the user can read.
        """
        try:
            self._run(job_id)
        except EngineError as e:
            self._finish_error(job_id, e.code, e.detail or e.message)
        except Exception as e:  # noqa: BLE001 — the last line of defence
            log.warning("downloads.unexpected", job_id=job_id, error=str(e))
            self._finish_error(job_id, "DEX01", str(e)[:300])

    # ── Run ───────────────────────────────────────────────────

    def _run(self, job_id: str) -> None:
        settings = engine_settings.load()
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            if job.status == CANCELLED or job_id in self._cancels:
                return
            job.status = RUNNING
            job.error = None
            job.error_code = None
            job.attempts += 1
            job.updated_at = _now()
            staging = self._job_staging(job)
            resume = job.resume_requested
            job.resume_requested = None
            self._persist()

        if resume is False:
            # An explicit fresh start: the staged bytes are what "not resuming"
            # means, so they go before the command is built.
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)

        cmd = self._build_command(job, staging)
        log.info("downloads.start", job_id=job.id, target=job.target[:80], attempt=job.attempts)

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                text=True,
            )
        except OSError as e:
            raise EngineError("DEN01", 500, str(e)[:200]) from e

        with self._lock:
            self._processes[job.id] = proc

        tail: list[str] = []
        assert proc.stdout is not None
        try:
            for line in proc.stdout:
                line = line.rstrip("\n")
                if line:
                    tail.append(line)
                    del tail[:-12]
                self._consume(job.id, line)
                if job.id in self._cancels:
                    proc.terminate()
                    break
            code = proc.wait(timeout=settings.download_timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            code = proc.wait()
            raise EngineError("DEX01", 500, "Timed out") from None
        finally:
            with self._lock:
                self._processes.pop(job.id, None)

        with self._lock:
            cancelled = job.id in self._cancels
            self._cancels.discard(job.id)

        if cancelled:
            self._finish(job.id, CANCELLED)
            return
        if code != 0:
            self._finish_error(job.id, *_classify_failure(tail))
            return

        self._finalize(job.id, staging, tail)

    def _build_command(self, job: Job, staging: Path) -> list[str]:
        settings = engine_settings.load()
        selector = job_selector(job)
        cmd = [
            toolchain.ytdlp_bin(),
            "--newline",  # one progress line at a time, so progress is live
            "--no-playlist",
            "--continue",  # resume a staged .part instead of re-fetching it
            "--no-overwrites",
            "-f",
            selector,
            "--extract-audio",
            "--audio-format",
            settings.audio_format,
            "--audio-quality",
            "0",
            "--write-thumbnail",
            "--write-info-json",
            "--no-part",  # stage as the real file in the staging dir
            "-o",
            str(staging / "%(id)s.%(ext)s"),
            *toolchain.ffmpeg_location_args(),
        ]
        cmd.append(job.url or f"https://www.youtube.com/watch?v={job.track_id}")
        return cmd

    def _consume(self, job_id: str, line: str) -> None:
        """Update one job from one line of yt-dlp output."""
        match = PROGRESS_RE.match(line)
        if match is None:
            # `[download] Destination:` names the file before any bytes move;
            # recording it early is what lets a resume report staged size.
            if line.startswith("[download] Destination:"):
                with self._lock:
                    job = self._jobs.get(job_id)
                    if job is not None:
                        job.filename = line.split("Destination:", 1)[1].strip()
                        job.updated_at = _now()
            return

        percent = float(match.group("percent"))
        speed = _to_bytes(match.group("speed") or "0", match.group("speed_unit") or "B")
        total = _to_bytes(match.group("size") or "0", match.group("size_unit") or "B")
        eta_raw = match.group("eta")

        eta: Optional[int] = None
        if eta_raw and eta_raw != "Unknown":
            parts = [int(p) for p in eta_raw.split(":") if p.isdigit()]
            if len(parts) == 2:
                eta = parts[0] * 60 + parts[1]
            elif len(parts) == 3:
                eta = parts[0] * 3600 + parts[1] * 60 + parts[2]

        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.progress = round(percent, 2)
            if speed:
                job.speed = speed
            if total:
                job.total_bytes = total
                job.downloaded_bytes = int(total * percent / 100)
            if eta is not None:
                job.eta = eta
            job.updated_at = _now()

        self._publish("download:progress", job)

    def _finalize(self, job_id: str, staging: Path, tail: list[str]) -> None:
        """Move the finished file into the library, tag it, record its identity."""
        settings = engine_settings.load()
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            info = _read_info_json(staging)
            audio = _find_audio(staging)

        title = (_first_str(info.get("title")) or Path(audio).stem) if audio else ""
        artist = (
            _first_str(info.get("artist"))
            or _first_str(info.get("uploader"))
            or _first_str(info.get("channel"))
            or "Unknown Artist"
        )
        album = _first_str(info.get("album")) or artist
        year = 0
        released = _first_str(info.get("release_date")) or _first_str(info.get("upload_date"))
        if released[:4].isdigit():
            year = int(released[:4])

        video_id = _first_str(info.get("id")) or job.track_id or job.id

        # The destination is the directory the job was created in, never one an
        # environment change could have swapped underneath it.
        destination: Optional[Path] = None
        if audio:
            artist_dir = Path(job.data_dir or settings.data_dir) / _safe_name(artist, "Unknown Artist")
            artist_dir.mkdir(parents=True, exist_ok=True)
            destination = _unique_destination(artist_dir / f"{_safe_name(title, video_id)}{Path(audio).suffix}")

            try:
                shutil.move(audio, destination)
            except OSError as e:
                raise EngineError("DEX01", 500, f"Could not move the file: {e}"[:200]) from e

            artwork = _find_artwork(staging)
            if artwork is not None:
                try:
                    # The thumbnail travels with the audio so the library has
                    # cover art without re-reading tags on every scan.
                    shutil.copyfile(artwork, destination.with_suffix(artwork.suffix))
                except OSError:
                    pass
                embedded = (artwork.read_bytes(), metadata.MIME_BY_IMAGE_EXT.get(artwork.suffix.lower(), "image/jpeg"))
            else:
                embedded = None

            metadata.write_tags(
                destination,
                title=title,
                artist=artist,
                album=album,
                year=year,
                artwork=embedded,
            )

            file_id = metadata.file_id(destination)
            identity.record(
                video_id,
                file_id,
                title=title,
                artist=artist,
                album=album,
                file_path=str(destination),
            )

        shutil.rmtree(staging, ignore_errors=True)
        library.invalidate()

        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = COMPLETED
            job.progress = 100.0
            job.speed = None
            job.eta = 0
            job.title = title or job.title
            job.artist = artist
            job.album = album
            job.file_path = str(destination) if destination else ""
            job.file_id = metadata.file_id(destination) if destination else ""
            job.filename = destination.name if destination else ""
            if job.total_bytes:
                job.downloaded_bytes = job.total_bytes
            job.updated_at = _now()
            self._persist()

        self._publish("download:completed", job)
        log.info("downloads.completed", job_id=job.id, title=title[:80], bytes=job.downloaded_bytes)

    def _finish(self, job_id: str, status: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = status
            job.updated_at = _now()
            if status == CANCELLED:
                job.speed = None
                job.eta = None
            self._persist()

        self._publish(f"download:{status}", job)

    def _finish_error(self, job_id: str, code: str, detail: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = FAILED
            job.error_code = code
            job.error = detail[:300]
            job.speed = None
            job.eta = None
            job.updated_at = _now()
            self._persist()

        self._publish("download:failed", job)
        log.warning("downloads.failed", job_id=job.id, code=code, detail=detail[:160])

    # ── Read ──────────────────────────────────────────────────

    def list(self, *, owner: Optional[str] = None, status: Optional[str] = None) -> list[dict]:
        with self._lock:
            items = list(self._jobs.values())
        # Jobs with no owner stay visible on purpose: a job created before the
        # owner field existed must not become unreachable.
        if owner:
            items = [j for j in items if j.owner == owner or not j.owner]
        if status:
            items = [j for j in items if j.status == status]
        items.sort(key=lambda j: j.created_at, reverse=True)
        return [self._with_resume_fields(j) for j in items]

    def get(self, job_id: str, *, owner: Optional[str] = None) -> dict:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None or (owner and job.owner and job.owner != owner):
            raise EngineError("DNF01", 404)
        return self._with_resume_fields(job)

    def _with_resume_fields(self, job: Job) -> dict:
        """Add resumability, **read from disk**.

        A stored boolean can disagree with the filesystem after a crash, and a
        UI that offers "resume" for bytes that are gone is worse than one that
        offers nothing.

        The snapshot is taken **under the lock, from one read of the status**:
        this method used to call ``job.to_dict()`` and then re-read
        ``job.status`` for the derived fields, so a worker finishing between the
        two lines produced a response like ``{"status": "running", "active":
        false}``. The client's resume UI keys on exactly those fields, so that
        is a real (if rare) lie — and a flaky test caught it.
        """
        with self._lock:
            # One status read decides every derived field below it.
            status = job.status
            data = job.to_dict()
            data["status"] = status
            staged = self.staged_bytes(job.id)
            data["resumable"] = staged > 0 and status in {FAILED, CANCELLED}
            data["stagedBytes"] = staged
            data["active"] = status in ACTIVE_STATUSES
            return data

    def staged_bytes(self, job_id: str) -> int:
        """Bytes already on disk for a job — the resume offer's evidence."""
        with self._lock:
            job = self._jobs.get(job_id)
        root = self._job_staging(job) if job is not None else self.staging_dir(job_id)
        total = 0
        if not root.is_dir():
            return 0
        for path in root.rglob("*"):
            try:
                if path.is_file():
                    total += path.stat().st_size
            except OSError:
                continue
        return total

    # ── Mutate ────────────────────────────────────────────────

    def cancel(self, job_id: str, *, owner: Optional[str] = None) -> dict:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or (owner and job.owner and job.owner != owner):
                raise EngineError("DNF01", 404)
            if job.status in TERMINAL_STATUSES:
                return self._with_resume_fields(job)
            self._cancels.add(job_id)
            proc = self._processes.get(job_id)
            if proc is None:
                # Still queued: never started, so cancel it here.
                job.status = CANCELLED
                job.updated_at = _now()
                self._persist()

        if proc is not None:
            try:
                proc.terminate()
            except OSError:
                pass
        return self.get(job_id)

    def retry(self, job_id: str, *, owner: Optional[str] = None, resume: Optional[bool] = None) -> dict:
        """Re-run a failed or cancelled job.

        ``resume=None`` means "continue if there is something to continue" —
        the honest default, since staged bytes exist precisely to be reused.
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or (owner and job.owner and job.owner != owner):
                raise EngineError("DNF01", 404)
            if job.status in ACTIVE_STATUSES:
                raise EngineError("DCN01", 409)
            if not toolchain.ytdlp().available:
                raise EngineError("DEN02", 503)

            if resume is None:
                resume = self.staged_bytes(job_id) > 0
            job.resume_requested = resume
            job.status = QUEUED
            job.error = None
            job.error_code = None
            job.progress = 0.0
            job.speed = None
            job.eta = None
            job.updated_at = _now()
            self._cancels.discard(job_id)
            self._persist()

        self._submit(job_id)
        self._publish("download:queued", job)
        return self.get(job_id)

    def delete(self, job_id: str, *, owner: Optional[str] = None) -> dict:
        """Remove a job.

        A running job keeps its staging: deleting the record must not throw away
        bytes the user is still paying to fetch.
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None or (owner and job.owner and job.owner != owner):
                raise EngineError("DNF01", 404)
            was_active = job.status in ACTIVE_STATUSES
            self._cancels.add(job_id)
            proc = self._processes.get(job_id)
            staging = self._job_staging(job)
            del self._jobs[job_id]

            if not was_active:
                shutil.rmtree(staging, ignore_errors=True)
            self._persist()

        if proc is not None:
            try:
                proc.terminate()
            except OSError:
                pass
        return {"id": job_id, "deleted": True, "stagingKept": was_active}

    def shutdown(self) -> None:
        """Stop accepting work and let running jobs be interrupted cleanly."""
        if self._executor is not None:
            self._executor.shutdown(wait=False)
            self._executor = None

    # ── Events ────────────────────────────────────────────────

    def _publish(self, event: str, job: Job) -> None:
        """Hand one event to the server, fire-and-forget.

        The server owns the SSE fan-out because it owns the session; the engine
        only reports. A server that is down costs live progress — the client
        still sees the final state on its next poll.
        """
        settings = engine_settings.load()
        if not settings.events_url:
            return
        payload = {"event": event, "job": self._with_resume_fields(job)}
        try:
            httpx.post(
                settings.events_url,
                json=payload,
                headers={"Authorization": f"Bearer {settings.token}"} if settings.token else {},
                timeout=2.0,
            )
        except Exception as e:  # noqa: BLE001 — reporting must never fail a job
            log.debug("downloads.publish.failed", event=event, error=str(e))


# ── Module-level helpers ──────────────────────────────────────


def _is_bare_id(value: str) -> bool:
    if not value or len(value) > 64:
        return False
    return all(ch.isalnum() or ch in "-_" for ch in value)


def job_selector(job: Job) -> str:
    """The format selector for a job — one place, so it can be reported."""
    return FORMAT_SELECTOR


def _read_info_json(staging: Path) -> dict:
    for candidate in staging.glob("*.info.json"):
        try:
            return json.loads(candidate.read_text("utf-8"))
        except Exception:  # noqa: BLE001
            continue
    return {}


def _find_audio(staging: Path) -> str:
    """The finished audio file in the staging dir, or ""."""
    candidates = [
        p
        for p in staging.iterdir()
        if p.is_file()
        and p.suffix.lower() in metadata.AUDIO_EXTENSIONS
        and not p.name.endswith(".part")
    ]
    if not candidates:
        return ""
    # Largest wins: a stray preview or thumbnail must not beat the real track.
    return str(max(candidates, key=lambda p: p.stat().st_size))


def _find_artwork(staging: Path) -> Optional[Path]:
    for p in staging.iterdir():
        if p.is_file() and p.suffix.lower() in metadata.ARTWORK_EXTENSIONS:
            return p
    return None


def _unique_destination(path: Path) -> Path:
    """Never overwrite an existing track: a second copy becomes ``… (2).ext``."""
    if not path.exists():
        return path
    for index in range(2, 100):
        candidate = path.with_name(f"{path.stem} ({index}){path.suffix}")
        if not candidate.exists():
            return candidate
    return path.with_name(f"{path.stem}-{int(time.time())}{path.suffix}")


def _first_str(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    return ""


def _classify_failure(tail: list[str]) -> tuple[str, str]:
    """Map yt-dlp's last words onto a registered code plus honest detail.

    The code decides which copy the client shows; the detail is what the ⓘ
    button reveals, and it is taken verbatim from the tool rather than
    summarised — a summary is how "YouTube refused this track" happened in the
    first place.
    """
    joined = "\n".join(tail)[-800:]
    last = tail[-1].strip() if tail else ""

    if not tail:
        return ("DEX01", "The downloader produced no output")
    if "sign in to confirm" in joined.lower() or "not a bot" in joined.lower():
        return ("DEX01", f"YouTube asked for a sign-in (bot check): {last}"[:300])
    if any(marker in joined.lower() for marker in _REFUSAL_MARKERS):
        return ("DEX01", f"YouTube refused this track on every client: {last}"[:300])
    if "ffmpeg" in joined.lower():
        return ("DEN03", last[:300])
    return ("DEX01", last[:300])


#: One manager per process — the queue is process state, like the semaphore it
#: replaced. ``main`` starts it on boot and stops it on shutdown.
manager = DownloadManager()
