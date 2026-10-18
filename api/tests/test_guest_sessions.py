"""Guest sessions — the no-account identity the phone app opens with.

The pins that matter: a guest gets its own namespace and can never reach an
account's data, a guest token is what makes its own routes work, forging one
fails, and turning guests off is a real switch rather than a comment.
"""

from __future__ import annotations

import pytest

from app.services import guest_sessions


@pytest.mark.asyncio
async def test_guest_endpoint_mints_a_working_session(client_anon):
    res = await client_anon.post("/api/auth/guest", json={"device": "pixel"})

    assert res.status_code == 200
    body = res.json()
    assert body["user"]["guest"] is True
    assert body["user"]["id"].startswith("guest_")
    assert isinstance(body["token"], str) and body["token"].count(".") == 2


@pytest.mark.asyncio
async def test_guest_token_authenticates_its_own_account_routes(client_anon):
    minted = (await client_anon.post("/api/auth/guest")).json()

    res = await client_anon.get(
        "/api/tracks/liked", headers={"Authorization": f"Bearer {minted['token']}"}
    )

    assert res.status_code == 200


@pytest.mark.asyncio
async def test_two_guests_do_not_share_state(client_anon):
    first = (await client_anon.post("/api/auth/guest")).json()
    second = (await client_anon.post("/api/auth/guest")).json()

    await client_anon.post(
        "/api/tracks/known-track/like",
        headers={"Authorization": f"Bearer {first['token']}"},
    )

    liked = await client_anon.get(
        "/api/tracks/liked", headers={"Authorization": f"Bearer {second['token']}"}
    )
    assert liked.status_code == 200
    assert liked.json() == []


@pytest.mark.asyncio
async def test_guest_endpoint_is_reachable_without_any_token(client_anon):
    # It cannot be behind get_current_user: it is what creates the identity.
    assert (await client_anon.post("/api/auth/guest")).status_code == 200


def test_a_forged_token_is_rejected():
    import jwt  # type: ignore[import-untyped]

    forged = jwt.encode(
        {"sub": "guest_evil", "iss": guest_sessions.GUEST_ISSUER, "exp": 4_102_444_800},
        "not-the-secret",
        algorithm="HS256",
    )
    assert guest_sessions.decode_guest_token(forged) is None


def test_a_token_for_another_subject_shape_is_rejected():
    # Signed with the instance's own derived key, and still refused.
    key = guest_sessions._signing_key()
    import jwt  # type: ignore[import-untyped]

    # A valid signature straight from the instance's own key is still refused
    # when it names something that is not a guest identity — the prefix is the
    # boundary that keeps a guest token from ever naming a real account.
    impostor = jwt.encode(
        {"sub": "user_2abc", "iss": guest_sessions.GUEST_ISSUER, "exp": 4_102_444_800},
        key,
        algorithm="HS256",
    )
    assert guest_sessions.decode_guest_token(impostor) is None


def test_an_expired_guest_token_is_rejected():
    import jwt  # type: ignore[import-untyped]

    key = guest_sessions._signing_key()
    expired = jwt.encode(
        {"sub": "guest_gone", "iss": guest_sessions.GUEST_ISSUER, "exp": 1_000_000_000},
        key,
        algorithm="HS256",
    )
    assert guest_sessions.decode_guest_token(expired) is None


@pytest.mark.asyncio
async def test_guests_can_be_switched_off(client_anon, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.ALLOW_GUEST_ACCOUNTS", False)

    res = await client_anon.post("/api/auth/guest")

    assert res.status_code == 403
    assert "ACF02" in res.text


@pytest.mark.asyncio
async def test_a_bad_token_is_not_silently_a_guest(client_anon):
    res = await client_anon.get(
        "/api/tracks/liked", headers={"Authorization": "Bearer not.a.token"}
    )
    assert res.status_code == 401
