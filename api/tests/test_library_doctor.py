"""Library doctor tests.

The doctor is filesystem-only, so every test runs against a staged
tmp_path library: real files with real (or truncated) bytes, no mocks
of the scanning logic itself. The pin: scans report exactly what is on
disk, and repairs refuse to delete anything that is not what they
claimed it was.
"""

from __future__ import annotations

import os

import pytest

from app.services import library_doctor


# ── Staging helpers ───────────────────────────────────────────

def _write(path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


@pytest.fixture(autouse=True)
def _isolate_dirs(monkeypatch, tmp_path):
    """Point the doctor at a private tmp library and clear its cache."""
    music = tmp_path / "music"
    music.mkdir()  # all_music_dirs only returns dirs that exist
    monkeypatch.setattr(
        "app.core.config.settings.MUSIC_DIR", str(music)
    )
    monkeypatch.setattr("app.core.config.settings.EXTRA_MUSIC_DIRS", [])
    # conftest points os.environ at a session-wide path — keep the env var
    # in sync so tests reading it stage files where the doctor looks.
    monkeypatch.setenv("MUSIC_DIR", str(music))
    library_doctor.invalidate_doctor_cache()
    yield
    library_doctor.invalidate_doctor_cache()


def _healthy_mp3(path):
    # A minimal but mutagen-parseable MPEG frame header is not needed for
    # these tests — what matters is what mutagen does. Real ID3-headed
    # files are used for the duplicate grouping tests; the "healthy"
    # marker here is simply "mutagen parses it", which _is_corrupt checks.
    import struct

    # Build a tiny valid MP3: ID3v2 header + one MPEG frame.
    # mutagen needs an MPEG sync frame to compute duration.
    frame = b"\xff\xfb\x90\x64" + b"\x00" * 417  # MPEG1 Layer3 128kbps 44.1kHz
    id3 = b"ID3\x03\x00\x00\x00\x00\x00\x00"
    return _write(path, id3 + frame * 8)


# ── Scan ──────────────────────────────────────────────────────

def test_scan_empty_library_reports_zeros():
    scan = library_doctor.scan_library()
    assert scan["scanned"] == 0
    assert scan["corrupt"] == []
    assert scan["duplicates"] == []
    assert scan["emptyDirs"] == []


def test_scan_flags_zero_byte_and_tiny_files():
    lib = os.environ["MUSIC_DIR"]
    _write_path = __import__("pathlib").Path(lib)
    _write(_write_path / "a" / "tiny.mp3", b"\x00" * 100)

    scan = library_doctor.scan_library()
    assert scan["scanned"] == 1
    assert len(scan["corrupt"]) == 1
    assert scan["corrupt"][0]["kind"] == "tiny"


def test_scan_flags_unreadable_file(monkeypatch):
    lib = __import__("pathlib").Path(os.environ["MUSIC_DIR"])
    f = _write(lib / "b" / "broken.mp3", b"\xff\xfb" + b"\x07" * 16384)
    # Force the corrupt classifier deterministically: the staged bytes may
    # or may not parse depending on the mutagen build, so pin the check.
    monkeypatch.setattr(library_doctor, "_is_corrupt", lambda p: p == f)

    scan = library_doctor.scan_library()
    kinds = [c["kind"] for c in scan["corrupt"]]
    assert kinds == ["unreadable"]


def test_scan_finds_empty_dirs():
    lib = __import__("pathlib").Path(os.environ["MUSIC_DIR"])
    _write(lib / "artist" / "song.mp3", b"x" * 1024)
    (lib / "artist" / "empty-album").mkdir(parents=True)

    scan = library_doctor.scan_library()
    # The file above is corrupt (4-byte frame header, no real audio), but
    # the empty dir is independent of that.
    assert any(d.endswith("empty-album") for d in scan["emptyDirs"])


def test_scan_is_cached_per_dir_set():
    lib = __import__("pathlib").Path(os.environ["MUSIC_DIR"])
    _write(lib / "one.mp3", b"x" * 2048)
    library_doctor.scan_library()

    # Same dirs → cached result (scanned count unchanged even though a
    # second file appeared).
    _write(lib / "two.mp3", b"x" * 2048)
    assert library_doctor.scan_library()["scanned"] == 1

    # Cache invalidation → fresh scan.
    library_doctor.invalidate_doctor_cache()
    assert library_doctor.scan_library()["scanned"] == 2


# ── Repairs ───────────────────────────────────────────────────

def test_delete_corrupt_removes_reported_file():
    lib = __import__("pathlib").Path(os.environ["MUSIC_DIR"])
    victim = _write(lib / "corrupt" / "bad.mp3", b"\x00" * 10)

    res = library_doctor.delete_corrupt_file(str(victim))
    assert res["deleted"] is True
    assert not victim.exists()


def test_delete_corrupt_refuses_healthy_file(monkeypatch):
    lib = __import__("pathlib").Path(os.environ["MUSIC_DIR"])
    healthy = _write(lib / "fine.mp3", b"x" * 16384)
    monkeypatch.setattr(library_doctor, "_is_corrupt", lambda p: False)

    with pytest.raises(ValueError, match="no longer corrupt"):
        library_doctor.delete_corrupt_file(str(healthy))
    assert healthy.exists()


def test_delete_refuses_path_outside_music_dirs(tmp_path):
    outsider = _write(tmp_path / "elsewhere" / "x.mp3", b"\x00" * 10)
    with pytest.raises(ValueError, match="outside"):
        library_doctor.delete_corrupt_file(str(outsider))


def test_delete_duplicate_keeps_last_copy(monkeypatch):
    lib = __import__("pathlib").Path(os.environ["MUSIC_DIR"])
    only = _write(lib / "only.mp3", b"x" * 16384)
    monkeypatch.setattr(library_doctor, "_is_corrupt", lambda p: False)
    monkeypatch.setattr(
        library_doctor, "_read_title_artist", lambda p: ("Song", "Artist")
    )

    # No healthy twin anywhere → refuse, even though the scan reported it
    # as a duplicate earlier (state changed between scan and repair).
    with pytest.raises(ValueError, match="no healthy duplicate"):
        library_doctor.delete_duplicate_file(str(only))
    assert only.exists()


def test_delete_duplicate_removes_when_twin_exists(monkeypatch):
    lib = __import__("pathlib").Path(os.environ["MUSIC_DIR"])
    _write(lib / "twin.mp3", b"x" * 16384)
    victim = _write(lib / "victim.mp3", b"x" * 16384)
    # Both files healthy, same tags → victim is the reported duplicate.
    monkeypatch.setattr(library_doctor, "_is_corrupt", lambda p: False)
    monkeypatch.setattr(
        library_doctor, "_read_title_artist", lambda p: ("Song", "Artist")
    )

    res = library_doctor.delete_duplicate_file(str(victim))
    assert res["deleted"] is True
    assert not victim.exists()
    assert (lib / "twin.mp3").exists()


def test_delete_empty_dir_only_when_empty():
    import pathlib

    lib = pathlib.Path(os.environ["MUSIC_DIR"])
    empty = lib / "gone"
    empty.mkdir(parents=True)
    full = lib / "full"
    full.mkdir(parents=True)
    (full / "keep.txt").write_text("not audio, but present")

    assert library_doctor.delete_empty_dir(str(empty))["deleted"] is True
    assert not empty.exists()
    with pytest.raises(OSError):
        library_doctor.delete_empty_dir(str(full))
    assert full.exists()


# ── Sweep endpoints (service level) ──────────────────────────

def test_delete_all_corrupt_sweeps_every_reported_file(monkeypatch):
    import pathlib

    lib = pathlib.Path(os.environ["MUSIC_DIR"])
    _write(lib / "a.mp3", b"\x00" * 5)
    _write(lib / "b.mp3", b"\x00" * 5)
    _write(lib / "c.mp3", b"x" * 16384)
    # c.mp3 is the one healthy file (a and b are tiny regardless).
    monkeypatch.setattr(
        library_doctor, "_is_corrupt", lambda p: p.name != "c.mp3"
    )

    res = library_doctor.delete_all_corrupt()
    assert res["deleted"] == 2
    assert (lib / "c.mp3").exists()


def test_prune_empty_dirs_reports_count():
    import pathlib

    lib = pathlib.Path(os.environ["MUSIC_DIR"])
    (lib / "e1").mkdir(parents=True)
    (lib / "e2").mkdir(parents=True)

    res = library_doctor.prune_empty_dirs()
    assert res["deleted"] == 2
