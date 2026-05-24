# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | ✅ Yes    |
| < 1.2   | ❌ No     |

## Reporting a vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

Email or send a private message to LethaboK via GitHub:
https://github.com/lethabokhedama-png

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

You will receive a response within 7 days. If the vulnerability is confirmed, a fix will be released and you will be credited in the CHANGELOG.

## Known limitations

- Shulker uses yt-dlp which relies on YouTube's internal APIs. These can change without notice.
- The Spotify Client ID and Secret are stored in `localStorage` — do not use Shulker on a shared or public computer.
- Self-hosted instances with no authentication are accessible to anyone on the network. Restrict access with a firewall or reverse proxy if needed.
- Downloads are stored on the server filesystem. Secure your server.