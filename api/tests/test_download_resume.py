"""Resume support for downloads.

Pins the contract that makes "Resume" meaningful: partial .part data must
survive a failed/cancelled attempt and a server restart, retry must
continue from it instead of re-downloading, and deleting the job record
must NOT delete staged data for a still-running job.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.services import download_service as ds


@pytest.fixture
def staged_job(monkeypatch):
    """A failed job with pretend-partial data in its staging dir."""
    job = ds._new_job("dQw4w9WgXcQ", "Never Gonna Give You Up", "Rick Astley", "", "mp3", "320")
    job["status"] = "error"
    job["error"] = "Download failed: yt-dlp exited with code 1"
    ds._jobs[job["id"]] = job

    staging = ds._staging_dir(job["id"])
    staging.mkdir(parents=True, exist_ok=True)
    (staging / "Never Gonna Give You Up.mp3.part").write_bytes(b"x" * 4096)

    yield job

    ds._jobs.pop(job["id"], None)
    ds._tasks.pop(job["id"], None)
    import shutil
    shutil.rmtree(staging, ignore_errors=True)


# ── staged-bytes accounting ──────────────────────────────────────────

def test_staged_bytes_counts_partial_data(staged_job):
    assert ds._staged_bytes(staged_job["id"]) == 4096


def test_staged_bytes_zero_when_no_staging_dir():
    assert ds._staged_bytes("no-such-job") == 0


# ── retry semantics ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_retry_auto_resumes_when_data_is_staged(staged_job, monkeypatch):
    """retry with resume=None continues from staged data."""
    captured = {}

    async def fake_enqueue(**kwargs):
        captured.update(kwargs)
        return staged_job

    monkeypatch.setattr(ds, "enqueue_download", fake_enqueue)

    await ds.retry_job(staged_job["id"])  # resume=None → auto

    assert captured["resume"] is True
    assert staged_job["status"] == "queued"


@pytest.mark.asyncio
async def test_retry_force_fresh_wipes_and_starts_over(staged_job, monkeypatch):
    """resume=False must discard partial data, not continue from it."""
    captured = {}

    async def fake_enqueue(**kwargs):
        captured.update(kwargs)
        return staged_job

    monkeypatch.setattr(ds, "enqueue_download", fake_enqueue)

    await ds.retry_job(staged_job["id"], resume=False)

    assert captured["resume"] is False
    assert ds._staged_bytes(staged_job["id"]) == 0, "staging must be wiped for a fresh retry"


@pytest.mark.asyncio
async def test_retry_resume_true_degrades_gracefully_without_data(monkeypatch):
    """resume=True with nothing staged silently does a fresh download."""
    job = ds._new_job("abc123", "T", "A", "", "mp3", "320")
    job["status"] = "error"
    ds._jobs[job["id"]] = job
    captured = {}

    async def fake_enqueue(**kwargs):
        captured.update(kwargs)
        return job

    monkeypatch.setattr(ds, "enqueue_download", fake_enqueue)
    await ds.retry_job(job["id"], resume=True)

    assert captured["resume"] is False, "resume=True with no staged data must fall back to fresh"
    ds._jobs.pop(job["id"], None)


@pytest.mark.asyncio
async def test_retry_of_unknown_job_returns_none():
    assert await ds.retry_job("00000000-0000-4000-8000-000000000000") is None


# ── restart recovery marks jobs resumable ────────────────────────────

def test_load_jobs_marks_interrupted_as_resumable(tmp_path, monkeypatch):
    """A job mid-flight at restart with staged .part data → resumable."""
    jid = "11111111-1111-4111-8111-111111111111"
    jobs_file = tmp_path / ".download_jobs.json"
    jobs_file.write_text(
        '{"%s": {"id": "%s", "trackId": "abc", "title": "T", "artist": "A",'
        ' "status": "downloading", "progress": 42.0}}' % (jid, jid)
    )
    monkeypatch.setattr(ds, "_JOBS_FILE", jobs_file)
    staging = tmp_path / f".staging-{jid}"
    staging.mkdir()
    (staging / "T.mp3.part").write_bytes(b"y" * 1024)

    # _staging_dir must point into tmp_path for this test
    monkeypatch.setattr(
        ds, "_staging_dir",
        lambda job_id: tmp_path / f".staging-{job_id}",
    )

    ds._load_jobs()
    try:
        job = ds._jobs[jid]
        assert job["status"] == "error"
        assert job["resumable"] is True
        assert job["stagedBytes"] == 1024
    finally:
        ds._jobs.pop(jid, None)


def test_load_jobs_no_resume_offer_without_staged_data(tmp_path, monkeypatch):
    """Restart-interrupted job with an empty staging dir → not resumable."""
    jid = "22222222-2222-4222-8222-222222222222"
    jobs_file = tmp_path / ".download_jobs.json"
    jobs_file.write_text(
        '{"%s": {"id": "%s", "status": "downloading"}}' % (jid, jid)
    )
    monkeypatch.setattr(ds, "_JOBS_FILE", jobs_file)
    monkeypatch.setattr(
        ds, "_staging_dir",
        lambda job_id: tmp_path / f".staging-{job_id}",
    )

    ds._load_jobs()
    try:
        job = ds._jobs[jid]
        assert job["resumable"] is False
        assert job["stagedBytes"] is None
    finally:
        ds._jobs.pop(jid, None)


# ── delete keeps staged data for running jobs ────────────────────────

@pytest.mark.asyncio
async def test_delete_running_job_keeps_staging(client, staged_job):
    """Deleting the RECORD of a running job must not nuke its partial data."""
    staged_job["status"] = "downloading"

    resp = await client.delete(f"/api/downloads/{staged_job['id']}")
    assert resp.status_code == 200
    assert ds._staged_bytes(staged_job["id"]) == 4096, "running job's staging must survive record deletion"


@pytest.mark.asyncio
async def test_delete_finished_job_removes_staging(client, staged_job):
    """Deleting a terminal job cleans its staging dir too."""
    staged_job["status"] = "error"

    resp = await client.delete(f"/api/downloads/{staged_job['id']}")
    assert resp.status_code == 200
    assert ds._staged_bytes(staged_job["id"]) == 0


# ── job payload exposes resume fields ────────────────────────────────

@pytest.mark.asyncio
async def test_job_schema_exposes_resume_fields(client, staged_job):
    resp = await client.get(f"/api/downloads/{staged_job['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["resumable"] is True
    assert body["stagedBytes"] == 4096
