# Privacy Policy

**Shulker** — Last updated: August 2026

---

## 1. Who we are

Shulker is a self-hosted, open-source music streaming and download application built and maintained by LethaboK (GitHub: lethabokhedama-png). Shulker is not a commercial product and does not operate as a company.

---

## 2. The short version

Shulker does not collect, store, transmit, or sell your personal data to any third party. Everything you do in Shulker — searches, playback history, liked songs, playlists, downloaded files — stays on your own device and your own server.

---

## 3. What Shulker stores and where

| Data                         | Where it lives                               | Who can see it                    |
| ---------------------------- | -------------------------------------------- | --------------------------------- |
| Playback history             | Server filesystem (`.history.json`)          | You and anyone with server access |
| Liked songs                  | Server filesystem (`.liked.json`)            | You and anyone with server access |
| Playlists                    | Server filesystem (`.playlists.json`)        | You and anyone with server access |
| Downloaded audio files       | Server filesystem (`MUSIC_DIR`)              | You and anyone with server access |
| Theme and app preferences    | Browser `localStorage`                       | Only you                          |
| Spotify Client ID and Secret | Server `.env` file (written at runtime)      | You and anyone with server access |
| Download job history         | Browser `localStorage` (completed jobs only) | Only you                          |

Nothing in this list is transmitted to Shulker's GitHub repository, to any analytics service, or to any third party operated by LethaboK.

---

## 4. Third-party services Shulker talks to

Shulker communicates with external services on your behalf. You should be aware of their policies.

**YouTube / YouTube Music**
Shulker uses ytmusicapi to search YouTube Music and yt-dlp to stream audio. When you search or play a song, a request is made to YouTube's servers from your IP address.
Privacy policy: https://policies.google.com/privacy

**Spotify Web API**
If you enter Spotify credentials in Settings, Shulker uses the Spotify Web API to resolve Spotify links and enrich metadata. Shulker never streams audio from Spotify.
Privacy policy: https://www.spotify.com/legal/privacy-policy/

**SoundCloud, Bandcamp, and others**
When you paste a link from these platforms, yt-dlp resolves and streams it. Your IP address makes a request to those platforms.

---

## 5. Cookies

Shulker does not use cookies. App preferences are stored in browser `localStorage`, which is local to your device and never transmitted.

---

## 6. Self-hosted deployments

If you deploy Shulker on a server and share access with other people, you become the data controller for those users. You are responsible for keeping your server secure, not storing other people's data without their knowledge, and complying with applicable privacy laws in your jurisdiction.

---

## 7. Render.com deployments

If you use the Render deployment, your Shulker instance runs on Render's infrastructure. Render's own privacy policy applies to server-level data (logs, IP addresses at the infrastructure level):
https://render.com/privacy

---

## 8. Changes to this policy

If this policy changes materially, the "Last updated" date at the top will change and a note will appear in the CHANGELOG. Since Shulker collects no personal data, changes are unlikely to affect your privacy in practice.

---

## 9. Contact

https://github.com/picklem0b/shulker/issues
