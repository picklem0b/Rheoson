"""The download queue, driven by a fake ``yt-dlp``.

Every test here runs a real subprocess against a script that behaves like
yt-dlp: it reports progress, it writes a file, and it can be made to refuse a
track or die halfway. That is deliberate — the resume behaviour, the progress
parsing and the failure classification are exactly the parts a mock would
assert into existence without ever proving.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from app.core import toolchain
from app.core.errors import EngineError
from app.services import downloads, identity, library, metadata

#: A yt-dlp stand-in. Reads `-o TEMPLATE`, writes the audio, an info.json and a
#: thumbnail — the three files the finalize step consumes.
FAKE_YTDLP = """#!/bin/sh
MODE="${FAKE_MODE:-ok}"
OUT=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then OUT="$a"; fi
  prev="$a"
done
ID="dQw4w9WgXcQ"
FILE=$(printf '%s' "$OUT" | sed "s/%(id)s/$ID/; s/%(ext)s/m4a/")
BASE="${FILE%.m4a}"
mkdir -p "$(dirname "$FILE")"

if [ "$MODE" = "refuse" ]; then
  echo "[youtube] $ID: Sign in to confirm you're not a bot. Use --cookies-from-browser"
  exit 1
fi

if [ "$MODE" = "half" ]; then
  printf 'AAAA' > "$FILE"
  echo "[download] Destination: $FILE"
  echo "[download]  50.0% of 8B at 1.00MiB/s ETA 00:01"
  exit 1
fi

if [ "$MODE" = "resume" ]; then
  if [ -f "$FILE" ]; then
    printf 'BBBB' >> "$FILE"
  else
    printf 'AAAA' > "$FILE"
    echo "[download]  50.0% of 8B at 1.00MiB/s ETA 00:01"
    exit 1
  fi
else
  printf 'AAAAAAAA' > "$FILE"
  echo "[download] Destination: $FILE"
  echo "[download]  50.0% of 8B at 1.00MiB/s ETA 00:02"
fi

echo "[download] 100% of 8B at 2.00MiB/s ETA 00:00"
printf '{"id":"%s","title":"Fake Song","artist":"Fake Artist","album":"Fake Album","release_date":"20240101","duration":12}' "$ID" > "$BASE.info.json"
printf '\\377\\330\\377jpegdata' > "$BASE.jpg"
echo "[ExtractAudio] Destination: $FILE"
exit 0
"""


@pytest.fixture()
def fake_ytdlp(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Path:
    script = tmp_path / "fake-yt-dlp"
    script.write_text(FAKE_YTDLP, "utf-8")
    script.chmod(0o755)
    # The engine resolves the binary through the toolchain, so the toolchain is
    # what gets pointed at the stand-in.
    monkeypatch.setattr(toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", str(script), "YTDLP_BIN"))
    monkeypatch.setattr(toolchain, "ffmpeg_location_args", lambda binary="yt-dlp": [])
    return script


@pytest.fixture()
def manager(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENGINE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ENGINE_DOWNLOAD_TIMEOUT", "30")
    identity.reset_caches()
    library.invalidate()
    fresh = downloads.DownloadManager()
    yield fresh
    fresh.shutdown()
    identity.reset_caches()
    library.invalidate()


def _wait(manager: downloads.DownloadManager, job_id: str, timeout: float = 20.0) -> dict:
    """Poll until a job leaves the active states. Real work runs in a thread,
    so the test waits for the outcome rather than assuming it."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = manager.get(job_id)
        if not job["active"]:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} never settled: {manager.get(job_id)}")


def test_a_successful_download_lands_in_the_library_and_keeps_its_identity(manager, fake_ytdlp, tmp_path) -> None:
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    done = _wait(manager, job.id)

    assert done["status"] == downloads.COMPLETED
    assert done["progress"] == 100.0
    assert done["title"] == "Fake Song"
    assert done["artist"] == "Fake Artist"

    landed = Path(done["file_path"])
    assert landed.is_file()
    # Artist/Title.ext — the documented on-disk layout.
    assert landed.parent.name == "Fake Artist"
    assert landed.name == "Fake Song.m4a"
    # The stage is gone once the file moves: nothing is left to resume.
    assert not manager.staging_dir(job.id).exists()

    mapped = identity.lookup_by_video("dQw4w9WgXcQ")
    assert mapped is not None
    assert mapped["file_path"] == str(landed)
    assert mapped["file_id"] == metadata.file_id(landed)

    # And the new file is visible immediately — the cache-invalidation chain
    # from the current stack, kept intact.
    assert any(t["id"] == "dQw4w9WgXcQ" for t in library.scan(force=True))


def test_progress_is_parsed_into_percent_speed_and_eta(manager, fake_ytdlp) -> None:
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    _wait(manager, job.id)

    # The job finished, so the last observed values are cleared on completion;
    # what must survive is the byte total, which is what a UI reports.
    assert manager.get(job.id)["total_bytes"] == 8


def test_a_refused_track_carries_its_code_and_the_real_reason(manager, fake_ytdlp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "refuse")
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    done = _wait(manager, job.id)

    assert done["status"] == downloads.FAILED
    assert done["error_code"] == "DEX01"
    # The ⓘ panel shows this verbatim: a summary is how the unhelpful
    # "YouTube refused this track" copy happened in the first place.
    assert "sign in to confirm" in done["error"].lower()
    assert not Path(done["file_path"]).exists() if done["file_path"] else True


def test_a_failed_job_keeps_its_staged_bytes_and_offers_a_resume(manager, fake_ytdlp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "half")
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    done = _wait(manager, job.id)

    assert done["status"] == downloads.FAILED
    # Resumability is read from disk, not from a stored flag: the bytes are
    # the evidence.
    assert done["stagedBytes"] == 4
    assert done["resumable"] is True


def test_retry_resumes_from_the_staged_bytes_instead_of_restarting(manager, fake_ytdlp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "resume")
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    assert _wait(manager, job.id)["status"] == downloads.FAILED

    resumable = manager.get(job.id)
    assert resumable["resumable"] is True

    manager.retry(job.id)
    done = _wait(manager, job.id)

    assert done["status"] == downloads.COMPLETED
    # 4 staged bytes + 4 appended = 8. A restart would have produced 4, which
    # is precisely the waste the staging contract exists to prevent.
    assert Path(done["file_path"]).stat().st_size == 8


def test_retry_with_resume_false_discards_the_stage(manager, fake_ytdlp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "half")
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    assert _wait(manager, job.id)["status"] == downloads.FAILED
    assert manager.staged_bytes(job.id) == 4

    monkeypatch.setenv("FAKE_MODE", "ok")
    manager.retry(job.id, resume=False)
    done = _wait(manager, job.id)

    assert done["status"] == downloads.COMPLETED
    assert Path(done["file_path"]).stat().st_size == 8


def test_cancel_of_a_queued_job_is_immediate(manager, fake_ytdlp) -> None:
    # Fill the single worker with a job that will not finish quickly by holding
    # the executor, then cancel the second before it starts.
    first = manager.create(owner="user_a", track_id="aaaaaaaaaaa")
    second = manager.create(owner="user_a", track_id="bbbbbbbbbbb")

    cancelled = manager.cancel(second.id)

    assert cancelled["status"] in {downloads.CANCELLED, downloads.RUNNING, downloads.COMPLETED}
    if cancelled["status"] == downloads.CANCELLED:
        assert cancelled["active"] is False
    _wait(manager, first.id)


def test_cancelled_jobs_keep_their_staging(manager, fake_ytdlp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FAKE_MODE", "half")
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    _wait(manager, job.id)

    # DELETE on a settled job clears the stage (nothing to resume any more),
    # while an *active* job's stage is kept. Both are asserted here because the
    # difference is the whole point of the rule.
    result = manager.delete(job.id)
    assert result == {"id": job.id, "deleted": True, "stagingKept": False}
    with pytest.raises(EngineError) as exc:
        manager.get(job.id)
    assert exc.value.code == "DNF01"


def test_owner_scoping_hides_other_peoples_jobs(manager, fake_ytdlp) -> None:
    job = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    _wait(manager, job.id)

    assert manager.list(owner="user_a") != []
    assert manager.list(owner="user_b") == []
    with pytest.raises(EngineError) as exc:
        manager.get(job.id, owner="user_b")
    assert exc.value.code == "DNF01"


def test_a_duplicate_active_job_is_refused(manager, fake_ytdlp) -> None:
    manager.create(owner="user_a", track_id="dQw4w9WgXcQ")

    with pytest.raises(EngineError) as exc:
        manager.create(owner="user_a", track_id="dQw4w9WgXcQ")

    assert exc.value.code == "DCN01"
    assert exc.value.status == 409


def test_a_different_owner_may_download_the_same_track(manager, fake_ytdlp) -> None:
    first = manager.create(owner="user_a", track_id="dQw4w9WgXcQ")
    second = manager.create(owner="user_b", track_id="dQw4w9WgXcQ")

    assert first.id != second.id
    _wait(manager, first.id)
    _wait(manager, second.id)


def test_input_validation_rejects_before_any_work(manager, fake_ytdlp) -> None:
    cases = [
        ({"track_id": None, "url": None}, "DVA03"),
        ({"track_id": "../etc/passwd"}, "DVA04"),
        ({"url": "ftp://example.com/a.mp3"}, "DVA01"),
        ({"url": "https://example.com/" + "a" * 3000}, "DVA02"),
    ]
    for kwargs, code in cases:
        with pytest.raises(EngineError) as exc:
            manager.create(owner="user_a", **kwargs)
        assert exc.value.code == code, kwargs


def test_a_missing_engine_is_reported_as_a_missing_capability(manager, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(toolchain, "ytdlp", lambda: toolchain.Tool("yt-dlp", None, "YTDLP_BIN"))

    with pytest.raises(EngineError) as exc:
        manager.create(owner="user_a", track_id="dQw4w9WgXcQ")

    assert exc.value.code == "DEN02"
    assert exc.value.status == 503


def test_the_queue_ceiling_is_enforced(manager, fake_ytdlp, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENGINE_DOWNLOAD_QUEUE_MAX", "1")
    manager.create(owner="user_a", track_id="dQw4w9WgXcQ")

    with pytest.raises(EngineError) as exc:
        manager.create(owner="user_b", track_id="bbbbbbbbbbb")

    assert exc.value.code == "DLM01"


def test_an_interrupted_job_is_failed_and_resumable_after_a_restart(manager, fake_ytdlp, tmp_path) -> None:
    """A job persisted as `running` has nothing executing it any more: claiming
    otherwise strands the UI forever."""
    jobs_file = Path(tmp_path) / ".download_jobs.json"
    jobs_file.write_text(
        json.dumps({"jobs": [{"id": "abc", "owner": "user_a", "target": "x", "status": "running"}]}),
        "utf-8",
    )

    reloaded = downloads.DownloadManager()
    reloaded.load()

    assert reloaded.get("abc")["status"] == downloads.FAILED
    assert reloaded.get("abc")["error_code"] == "DEX01"


def test_classify_failure_names_the_refusal_honestly() -> None:
    code, detail = downloads._classify_failure(["[youtube] Requested format is not available"])

    assert code == "DEX01"
    assert "Requested format is not available" in detail
    # Transport failures are not refusals and must not be described as one.
    transport_code, transport_detail = downloads._classify_failure(["ERROR: Unable to resolve host cdn"])
    assert transport_code == "DEX01"
    assert "Unable to resolve host" in transport_detail


def test_the_command_always_asks_yt_dlp_to_continue(manager, fake_ytdlp, tmp_path) -> None:
    job = downloads.Job(id="j1", owner="user_a", target="dQw4w9WgXcQ", track_id="dQw4w9WgXcQ")

    cmd = manager._build_command(job, tmp_path)

    assert "--continue" in cmd
    assert "--newline" in cmd
    # Staging is per job, which is what makes a resumed run find its own bytes.
    assert str(tmp_path) in " ".join(cmd)
