"""User-safe download error copy.

The job `error` string is rendered verbatim in the downloads list and the
activity pill. Whatever the pipeline throws — extractor bot-checks quoting
video ids, OS errors with filesystem paths, signed URL fragments — must be
mapped to an actionable sentence before it lands on the job record. The
server log keeps the diagnostic.
"""

from __future__ import annotations

import pytest

from app.services import download_service as ds


# ── main-path failures: _friendly_download_error ────────────────────

def test_friendly_error_never_quotes_stderr_tail():
    tail = (
        "ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you're not a bot. "
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    )
    msg = ds._friendly_download_error(tail)
    assert msg
    assert 'dQw4w9WgXcQ' not in msg
    assert 'ERROR' not in msg
    assert 'Sign in' not in msg


def test_media_server_refusal_is_reported_as_transient():
    """A CDN 403 is a refused transfer, not a refused track.

    The extractor resolved the track fine; the media server refused the bytes,
    usually because the signed URL expired. That is worth a retry, so the copy
    must say so instead of blaming the player clients.
    """
    for tail in (
        "ERROR: unable to download video data: HTTP Error 403: Forbidden",
        "ERROR: unable to download video data: HTTP Error 429: Too Many Requests",
    ):
        msg = ds._friendly_download_error(tail)
        assert 'retry' in msg.lower(), msg
        assert 'every client' not in msg.lower(), msg


def test_permanently_unavailable_track_does_not_imply_a_retry_fixes_it():
    """A deleted or region-blocked video is not an engine problem."""
    for tail in (
        "ERROR: [youtube] abc: Video unavailable",
        "ERROR: [youtube] abc: This video is not available",
        "ERROR: [youtube] abc: The uploader has not made this video available in your country",
    ):
        msg = ds._friendly_download_error(tail)
        assert 'no longer available' in msg, msg
        assert 'engine' not in msg.lower(), msg


def test_bot_check_names_cookies_not_just_the_engine():
    """YouTube's bot check is answered with credentials, not a new client.

    The engine may genuinely need updating too, but a bot check follows the
    network, so promising a retry alone would be dishonest.
    """
    msg = ds._friendly_download_error(
        "ERROR: [youtube] abc: Sign in to confirm you're not a bot."
    )
    assert 'cookies' in msg
    assert 'tried' in msg


def test_friendly_error_is_actionable_per_case():
    assert 'Doctor' in ds._friendly_download_error('ffmpeg not found')
    assert 'timed out' in ds._friendly_download_error('giving up after 1 attempt').lower() or \
           'retry' in ds._friendly_download_error('URLError: timed out').lower()
    assert 'storage space' in ds._friendly_download_error('[Errno 28] No space left on device')
    assert 'connection' in ds._friendly_download_error('unable to resolve host').lower() or \
           'connection' in ds._friendly_download_error('Temporary failure in name resolution').lower()
    assert 'writable' in ds._friendly_download_error('Permission denied: /data/music')


# ── resolve-stage failures: _friendly_resolve_error ─────────────────

def test_resolve_error_hides_extractor_internals():
    err = RuntimeError(
        "ERROR: [youtube] 3Zl5NJZ0bmw: Video unavailable. This video contains "
        "content from UMG. Watch on the latest version of YouTube."
    )
    msg = ds._friendly_resolve_error(err)
    assert '3Zl5NJZ0bmw' not in msg
    assert 'UMG' not in msg
    assert 'ERROR' not in msg


def test_resolve_error_hides_signed_urls():
    err = RuntimeError(
        "HTTP Error 403: Forbidden at https://rr3---sn-1gi7znek.googlevideo.com/"
        "videoplayback?expire=1234&signature=ABCDEF"
    )
    msg = ds._friendly_resolve_error(err)
    assert 'signature' not in msg
    assert 'googlevideo' not in msg


def test_resolve_error_times_out_is_actionable():
    msg = ds._friendly_resolve_error(TimeoutError('lookup timed out'))
    assert 'connection' in msg.lower() or 'retry' in msg.lower()


def test_resolve_error_passes_through_safe_validation_text():
    # Netguard/our own validation messages are written to be shown.
    err = ValueError("Host not supported for server-side fetching")
    assert str(err) == ds._friendly_resolve_error(err)


def test_resolve_error_generic_neutral_fallback():
    # Long, non-extractor text is never trusted with the UI.
    err = RuntimeError('x' * 200)
    msg = ds._friendly_resolve_error(err)
    assert len(msg) < 120


# ── enqueue path stores the friendly copy ───────────────────────────

@pytest.mark.asyncio
async def test_enqueue_resolve_failure_stores_user_safe_error(monkeypatch):
    async def boom(track_id, url):
        raise RuntimeError(
            "ERROR: [youtube] abcdef12345: Sign in to confirm you're not a bot"
        )

    monkeypatch.setattr(ds, '_resolve_to_yt_url', boom)

    job = await ds.enqueue_download(track_id='abcdef12345', owner='u1')

    assert job['status'] == 'error'
    assert 'abcdef12345' not in job['error']
    assert 'Sign in' not in job['error']
    assert job['error']  # still a real, actionable message

    ds._jobs.pop(job['id'], None)


# ── subprocess spawn failures don't leak OS paths ────────────────────

def test_job_record_does_not_double_prefix_the_failure():
    """The stored error is one sentence, not "Download failed: Download failed".

    _friendly_download_error already returns a complete user-facing sentence,
    and the WS error event sends it unprefixed. Prefixing it again in the job
    record made the activity pill read
    "Download failed — Download failed: The media server cut the transfer".
    """
    import inspect
    src = inspect.getsource(ds._download_task)
    assert "error=f'Download failed: {e}'" not in src


def test_spawn_failure_copy_is_user_safe():
    # The message _run_ytdlp_attempt raises on a failed subprocess spawn.
    # It must not include the exception text (which carries OS paths and
    # binary locations); that goes to the log instead.
    import inspect
    src = inspect.getsource(ds._run_ytdlp_attempt)
    assert 'Could not start yt-dlp: {e}' not in src
    assert 'The download could not start' in src
