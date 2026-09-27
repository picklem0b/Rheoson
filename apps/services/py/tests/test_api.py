"""HTTP surface of the engine.

These pin the answers the relay and the server depend on: a resolve that ends
in a definitive 404 (a real "not available" answer the caller can fall back
from), an explicit 503 when the tool is missing, and a DCCNN chip on every
failure so the client never has to invent copy.
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.core import toolchain
from app.services import resolve

client = TestClient(main.app)

PRESENT = toolchain.Tool("yt-dlp", "/usr/bin/yt-dlp", "YTDLP_BIN")
ABSENT = toolchain.Tool("yt-dlp", None, "YTDLP_BIN")


@pytest.fixture()
def ytdlp_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(toolchain, "ytdlp", lambda: PRESENT)


@pytest.fixture()
def ytdlp_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(toolchain, "ytdlp", lambda: ABSENT)


def test_health_reports_capabilities_and_code_source(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(toolchain, "capabilities", lambda: {"canDownload": True})

    body = client.get("/health").json()

    assert body["status"] == "ok"
    assert body["capabilities"]["canDownload"] is True
    # The registry's provenance is visible: a missing artifact must not be a
    # mystery when a message looks wrong.
    assert "source" in body["errorCodes"]


def test_invalid_track_id_is_refused_before_any_work(
    monkeypatch: pytest.MonkeyPatch, ytdlp_present: None
) -> None:
    response = client.get("/resolve/..%2Fetc%2Fpasswd")
    assert response.status_code in (400, 404)
    if response.status_code == 400:
        assert "SVA03" in response.text


def test_missing_ytdlp_is_service_unavailable(ytdlp_absent: None) -> None:
    response = client.get("/resolve/dQw4w9WgXcQ")

    assert response.status_code == 503
    assert response.json()["code"] == "DEN02"
    assert "[ERROR_CODE: DEN02]" in response.json()["error"]


def test_unavailable_track_is_a_definitive_404(
    monkeypatch: pytest.MonkeyPatch, ytdlp_present: None
) -> None:
    async def fake_resolve(*_a, **_k) -> None:
        return None

    monkeypatch.setattr(resolve, "resolve_direct_url", fake_resolve)

    response = client.get("/resolve/dQw4w9WgXcQ")

    # 404 (not 5xx) is the signal the caller's fallback keys on: the track was
    # genuinely declined, retrying is pointless.
    assert response.status_code == 404
    assert response.json()["code"] == "SUP01"


def test_successful_resolve_payload(monkeypatch: pytest.MonkeyPatch, ytdlp_present: None) -> None:
    async def fake_resolve(*_a, **_k) -> str:
        return "https://cdn.example/audio.m4a?mime=audio%2Fmp4"

    monkeypatch.setattr(resolve, "resolve_direct_url", fake_resolve)

    body = client.get("/resolve/dQw4w9WgXcQ").json()

    assert body["url"].startswith("https://cdn.example/")
    assert body["contentType"] == "audio/mp4"
    assert body["expiresAt"] > 0
    assert body["filename"].startswith("dQw4w9WgXcQ")


def test_a_fresh_resolve_bypasses_the_url_cache(
    monkeypatch: pytest.MonkeyPatch, ytdlp_present: None
) -> None:
    """`?fresh=1` is how a caller says "that URL is dead".

    The cache lives for hours, so without this a re-mint after a CDN refusal
    returns the refused URL and the caller's retry becomes a repeat. The
    assertion is on the keyword the service receives, because that is the
    contract between the route and the extractor.
    """
    seen: dict[str, object] = {}

    async def fake_resolve(_track_id: str, **kwargs) -> str:
        seen.update(kwargs)
        return "https://cdn.example/fresh.m4a"

    monkeypatch.setattr(resolve, "resolve_direct_url", fake_resolve)

    body = client.get("/resolve/dQw4w9WgXcQ?fresh=1").json()

    assert body["url"] == "https://cdn.example/fresh.m4a"
    assert seen["use_cache"] is False


def test_a_plain_resolve_still_uses_the_cache(
    monkeypatch: pytest.MonkeyPatch, ytdlp_present: None
) -> None:
    seen: dict[str, object] = {}

    async def fake_resolve(_track_id: str, **kwargs) -> str:
        seen.update(kwargs)
        return "https://cdn.example/cached.m4a"

    monkeypatch.setattr(resolve, "resolve_direct_url", fake_resolve)

    client.get("/resolve/dQw4w9WgXcQ")

    # A replay must stay cheap: resolution costs a subprocess.
    assert seen["use_cache"] is True


def test_probe_reports_mime_and_length(monkeypatch: pytest.MonkeyPatch, ytdlp_present: None) -> None:
    async def fake_probe(_track_id: str, **_kwargs) -> dict:
        return {"url": "https://cdn.example/a", "mime": "audio/webm", "bytes": 4096}

    monkeypatch.setattr(resolve, "probe_direct", fake_probe)

    body = client.get("/probe/dQw4w9WgXcQ").json()
    # `local` tells the caller which tier answered: false means the length came
    # from the CDN, true means it came from `stat` on this disk.
    assert body == {"mime": "audio/webm", "bytes": 4096, "local": False}


def test_probe_failure_is_bad_gateway(monkeypatch: pytest.MonkeyPatch, ytdlp_present: None) -> None:
    async def fake_probe(_track_id: str, **_kwargs) -> None:
        return None

    monkeypatch.setattr(resolve, "probe_direct", fake_probe)

    response = client.get("/probe/dQw4w9WgXcQ")
    assert response.status_code == 502
    assert response.json()["code"] == "SUP02"


def test_token_is_enforced_only_when_configured(
    monkeypatch: pytest.MonkeyPatch, ytdlp_present: None
) -> None:
    async def fake_resolve(*_a, **_k) -> str:
        return "https://cdn.example/audio.m4a"

    monkeypatch.setattr(resolve, "resolve_direct_url", fake_resolve)

    # Default posture: no token means the engine trusts its network.
    assert client.get("/resolve/dQw4w9WgXcQ").status_code == 200

    monkeypatch.setattr(main, "settings", replace(main.settings, token="secret"))
    assert client.get("/resolve/dQw4w9WgXcQ").status_code == 401
    assert client.get(
        "/resolve/dQw4w9WgXcQ", headers={"Authorization": "Bearer secret"}
    ).status_code == 200
    assert client.get(
        "/resolve/dQw4w9WgXcQ", headers={"X-Engine-Token": "secret"}
    ).status_code == 200
    assert client.get(
        "/resolve/dQw4w9WgXcQ", headers={"Authorization": "Bearer wrong"}
    ).status_code == 401
