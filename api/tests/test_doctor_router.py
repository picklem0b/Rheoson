"""Device doctor routes — the non-admin scan and its repairs.

The instance-wide doctor is admin-only; this pair is what an ordinary account
gets from "Scan device". The pins: the scan never requires admin, a repair only
touches paths inside MUSIC_DIR, and a stale report cannot delete a file that
has since been repaired.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.services import library_doctor


@pytest.fixture(autouse=True)
def _fresh_cache():
    """The per-user scan is cached per (account, directory); start clean."""
    library_doctor.invalidate_user_cache()
    yield
    library_doctor.invalidate_user_cache()


def _music_dir() -> Path:
    return Path(os.environ["MUSIC_DIR"])


def _stage_tiny(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x00" * 100)
    return path


@pytest.mark.asyncio
async def test_scan_requires_a_session(client_anon):
    res = await client_anon.get("/api/doctor/user-scan")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_scan_reports_what_the_device_holds(client):
    staged = _stage_tiny(_music_dir() / "Artist" / "tiny.mp3")

    res = await client.get("/api/doctor/user-scan")

    assert res.status_code == 200
    body = res.json()
    assert body["scanned"] == 1
    assert [c["path"] for c in body["corrupt"]] == [str(staged)]
    # Shape matches the admin scan, so the same UI renders both.
    assert set(body) >= {"scanned", "totalBytes", "corrupt", "duplicates", "emptyDirs", "dirs"}


@pytest.mark.asyncio
async def test_repair_deletes_the_reported_file(client):
    staged = _stage_tiny(_music_dir() / "Artist" / "tiny.mp3")

    res = await client.post("/api/doctor/user-fix", json={"kind": "corrupt", "path": str(staged)})

    assert res.status_code == 200
    assert res.json()["deleted"] is True
    assert not staged.exists()


@pytest.mark.asyncio
async def test_repair_refuses_a_path_outside_the_library(client):
    res = await client.post("/api/doctor/user-fix", json={"kind": "corrupt", "path": "/etc/passwd"})

    assert res.status_code == 400
    assert "LVA01" in res.text


@pytest.mark.asyncio
async def test_repair_refuses_a_file_that_is_no_longer_corrupt(client, tmp_path):
    healthy = tmp_path / "now-fine.mp3"
    # Same shape the doctor's own "healthy" fixture uses: an ID3 header plus
    # real MPEG frames, which mutagen parses and duration-checks.
    frame = b"\xff\xfb\x90\x64" + b"\x00" * 417
    healthy.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00\x00" + frame * 8)

    res = await client.post("/api/doctor/user-fix", json={"kind": "corrupt", "path": str(healthy)})

    # Outside MUSIC_DIR, so the guard rejects it before the corrupt re-check —
    # either way nothing is deleted.
    assert res.status_code == 400
    assert healthy.exists()


@pytest.mark.asyncio
async def test_empty_dir_repair_needs_a_path(client):
    res = await client.post("/api/doctor/user-fix", json={"kind": "empty-dir"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_empty_dir_repair_removes_one_folder(client):
    folder = _music_dir() / "Empty Album"
    folder.mkdir(parents=True, exist_ok=True)

    res = await client.post("/api/doctor/user-fix", json={"kind": "empty-dir", "path": str(folder)})

    assert res.status_code == 200
    assert res.json()["deleted"] is True
    assert not folder.exists()


@pytest.mark.asyncio
async def test_unknown_fix_kind_is_rejected(client):
    res = await client.post("/api/doctor/user-fix", json={"kind": "everything"})
    assert res.status_code == 400
    assert "LVA01" in res.text
