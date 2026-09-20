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

def test_spawn_failure_copy_is_user_safe():
    # The message _run_ytdlp_attempt raises on a failed subprocess spawn.
    # It must not include the exception text (which carries OS paths and
    # binary locations); that goes to the log instead.
    import inspect
    src = inspect.getsource(ds._run_ytdlp_attempt)
    assert 'Could not start yt-dlp: {e}' not in src
    assert 'The download could not start' in src
