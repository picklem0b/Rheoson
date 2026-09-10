# Terms of Service

**Rheoson** — Last updated: September 2026

## 1. Overview

Rheoson is free, open-source software licensed under the **Apache License 2.0**. By using Rheoson — the web app, the API, the Android app, or any hosted instance — you agree to these terms. If you do not agree, do not use Rheoson.

These terms apply to: the web application, the API, the Android APK, the `rheoson` CLI, and any publicly hosted instance of Rheoson.

## 2. What Rheoson is

A personal music tool that lets you:

- Search for music via YouTube Music
- Stream audio from YouTube via yt-dlp
- Download audio to your own storage for offline listening
- Manage playlists, lyrics, likes, and listening history on your own server

Rheoson is **not** a music distribution service, does not host music libraries centrally, and does not sell or stream content to you. The operator of an instance provides its storage and connectivity.

## 3. Acceptable use

You agree **not** to:

- Use Rheoson to redistribute, sell, or publicly perform downloaded audio
- Attack, overload, or disrupt any Rheoson instance (rate limits exist and are enforced)
- Attempt to access other users' data on an instance you don't control
- Use the artwork proxy, search resolve, or download endpoints to reach hosts outside their allowlisted purposes (SSRF is actively defended; abuse will be blocked)
- Circumvent authentication (Clerk) or the per-user isolation of data
- Remove the license or attribution from copies you redistribute

## 4. Audio content & copyright

The Rheoson **source code** is Apache-2.0. The license grants no rights to **audio content** accessed through the software. Streaming and downloading audio from third-party platforms may be restricted by those platforms' terms and by copyright law in your jurisdiction. You are solely responsible for how you use Rheoson. The project does not endorse or facilitate infringement; self-hosting exists precisely so each operator bears responsibility for their own use.

## 5. Accounts

- Authentication is handled by Clerk under their terms and privacy policy.
- On a shared instance, your likes, playlists, and history are visible only to you and the instance operator.
- The operator may suspend access to their instance for abuse (section 3).

## 6. Self-hosting responsibilities

If you operate an instance for others, you are responsible for: securing it (see the [security policy](SECURITY.md)), its compliance with applicable law, informing your users of your data practices (start from the [privacy policy](PRIVACY.md) and adapt it), and backing up their data.

## 7. Availability & warranty

Rheoson is provided **"AS IS"**, without warranty of any kind, express or implied — including merchantability, fitness for a particular purpose, and non-infringement — as stated in the Apache License 2.0. YouTube/Spotify/lyrics-provider changes can break features at any time; the project ships updates (including a daily yt-dlp refresh) but offers no SLA.

## 8. Limitation of liability

To the maximum extent permitted by law, the maintainer is not liable for any damages arising from use of the software — including data loss, service interruption, or claims from third parties (including platforms whose content is accessed).

## 9. Termination

You may stop using Rheoson at any time. Operators may terminate access to their instances at any time. The license terms in `LICENSE` govern the code independently of these terms.

## 10. Changes

Material changes to these terms ship with a release and are dated at the top. Continued use after a release that changes these terms constitutes acceptance.

## 11. Contact

Bugs and features: <https://github.com/picklem0b/Rheoson/issues> · Security: [SECURITY.md](SECURITY.md) · Maintainer: <https://github.com/picklem0b>

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
