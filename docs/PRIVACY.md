# Privacy Policy

**Shulker** — Last updated: May 2026

---

## 1. Who we are

Shulker is a self-hosted, open-source music streaming and download application built and maintained by LethaboK (GitHub: lethabokhedama-png). Shulker is not a commercial product and does not operate as a company.

---

## 2. The short version

Shulker does not collect, store, transmit, or sell your personal data to any third party. Ever.

Everything you do in Shulker — searches, playback history, liked songs, playlists, downloaded files — stays on your own device and your own server. We have no servers that receive your data, no analytics pipeline, no advertising infrastructure, and no accounts system that phones home.

---

## 3. What data Shulker stores and where

| Data | Where it lives | Who can see it |
|------|---------------|----------------|
| Search history | Your browser's `localStorage` | Only you |
| Playback history | Your self-hosted API server (JSON file) | Only you and anyone with access to your server |
| Liked songs | Your self-hosted API server (JSON file) | Only you |
| Playlists | Your self-hosted API server (JSON file) | Only you |
| Downloaded audio files | Your device's file system | Only you |
| Theme and app preferences | Your browser's `localStorage` | Only you |
| Spotify Client ID and Secret | Your browser's `localStorage` and your `.env` file | Only you |

Nothing in this list is transmitted to us, to Shulker's GitHub repository, or to any analytics service.

---

## 4. Third-party services Shulker talks to

Shulker communicates with external services on your behalf to fetch music metadata and audio. You should be aware of their privacy policies:

### YouTube / YouTube Music
Shulker uses [ytmusicapi](https://github.com/sigma67/ytmusicapi) to search YouTube Music and stream audio via [yt-dlp](https://github.com/yt-dlp/yt-dlp). When you search or play a song, a request is made to YouTube's servers from your IP address.

- YouTube Privacy Policy: https://policies.google.com/privacy

### Spotify Web API
If you enter your Spotify Client ID and Client Secret in Settings, Shulker uses the [Spotify Web API](https://developer.spotify.com/documentation/web-api) to resolve Spotify links and enrich search results with metadata. Shulker never streams audio from Spotify.

- Spotify Privacy Policy: https://www.spotify.com/legal/privacy-policy/

### SoundCloud, Bandcamp, Deezer, and others
When you paste a link from these platforms, Shulker uses yt-dlp to resolve and stream it. Your IP address makes a request to those platforms.

---

## 5. Cookies

Shulker does not use cookies. App preferences are stored in `localStorage`, which is local to your browser and never transmitted.

---

## 6. Children's privacy

Shulker is not directed at children under 13. We do not knowingly collect any information from children. Since Shulker collects no data from anyone, this is largely moot — but if you are under 13, please use Shulker with parental supervision.

---

## 7. Self-hosted deployments

If you deploy Shulker on a server (e.g. Render, a VPS, or your home network) and share access with other people, you become the data controller for those users. You are responsible for:

- Keeping your server secure
- Not storing other people's data without their knowledge
- Complying with applicable privacy laws in your jurisdiction

---

## 8. Render.com deployments

If you use the one-click Render deployment, your Shulker instance runs on Render's infrastructure. Render's own privacy policy applies to server-level data (logs, IP addresses at the infrastructure level):

- Render Privacy Policy: https://render.com/privacy

---

## 9. Changes to this policy

If this policy changes materially, the "Last updated" date at the top will change and a note will appear in the CHANGELOG. Since Shulker collects no personal data, changes are unlikely to affect your privacy in practice.

---

## 10. Contact

This project is open source. If you have privacy concerns, open an issue at:

https://github.com/lethabokhedama-png/shulker/issues