# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.3.x   | Yes       |
| 1.2.x   | Yes       |
| < 1.2   | No        |

## Reporting a vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Send a private message to LethaboK via GitHub:
https://github.com/picklem0b

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if you have one

You will receive a response within 7 days. If the vulnerability is confirmed, a fix will be released and you will be credited in the CHANGELOG.

## Known limitations

- Rheoson uses yt-dlp which relies on YouTube's internal APIs. These can change without notice and may cause streams or downloads to break temporarily.
- Spotify Client ID and Secret are stored in your server's `.env` file and written there at runtime via `POST /api/settings/spotify`. Do not run a shared Rheoson instance without restricting access.
- Self-hosted instances have no authentication layer. Anyone on your network who can reach port 8000 can use the API. Restrict access with a firewall or reverse proxy if needed.
- Download jobs are stored in memory only. No sensitive data persists across server restarts.
- Downloaded audio files are stored on the server filesystem. Secure your server and `MUSIC_DIR` accordingly.
- On Render free tier, Spotify credentials written to `.env` do not survive a restart. Re-enter them after a cold start.
