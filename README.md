# Personal Countdown Hub

Track your most important dates — events, deadlines, and moments that matter.

---

## What this is

A fully offline-capable countdown website built with plain HTML, CSS, and JavaScript.
No server, no account, no dependencies. Everything runs in your browser.

---

## How to open it on Android

### Option A — Open the HTML file directly
1. Extract this ZIP file using your file manager app.
2. Open your file manager, navigate to the extracted folder, and tap **index.html**.
3. Your browser (Chrome, Firefox, or Kiwi) will open the site.

### Option B — Run a local server with Termux (recommended)
This gives you a stable localhost address and enables full PWA behaviour.

1. Install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/).
2. Copy the extracted `Personal-Countdown-Hub/` folder into your Termux home:
   ```
   cp -r /storage/emulated/0/Personal-Countdown-Hub ~/
   ```
3. In Termux, install Python and start a server:
   ```
   pkg install python
   cd ~/Personal-Countdown-Hub
   python -m http.server 8080
   ```
4. Open **http://localhost:8080** in Chrome on your phone.
5. Tap **⋮ → Add to Home Screen** to install it as a PWA (after Stage 2 adds the manifest).

---

## Features

| Feature | Detail |
|---|---|
| Multiple countdowns | Create as many events as you need (up to 100) |
| Live countdown | Updates every second — days, hours, minutes, seconds |
| Custom colours | Pick an accent colour for each card |
| Featured event | Pin one event to the hero section (and future Android widget) |
| Search & filter | Find events instantly; filter by active or completed |
| JSON export | Download all events as a `.json` file |
| JSON import | Paste or load a JSON file to restore or sync events |
| Offline-ready | Works without internet after first load |
| Dark theme | Premium dark UI optimised for OLED screens |
| Timezone | All dates treated as **Africa/Lagos** (WAT, UTC+1) |

---

## Timezone note

New events use **Africa/Lagos (WAT, UTC+1)** as the local timezone.
If you are in a different timezone, the displayed target time will reflect
WAT. Adjust your target time accordingly, or this behaviour will be
configurable in a later version.

---

## Project structure

```
Personal-Countdown-Hub/
├── index.html          Main page
├── style.css           All styles (dark theme, responsive)
├── script.js           All logic (storage, countdown, export/import)
├── README.md           This file
└── assets/
    └── icons/
        ├── icon-192.png    PWA icon (192×192)
        └── icon-512.png    PWA icon (512×512)
```

**Coming in later stages:**
- `manifest.json` — PWA installation manifest
- `sw.js` — Service Worker for full offline caching
- Android APK with native home-screen widget

---

## Data persistence

Events are stored in your browser's `localStorage` under the key `pch_events_v1`.
They persist across sessions as long as you do not clear browser data.

Use **Export** regularly to back up your events as a JSON file.

---

## Syncing with the Android widget (future stage)

The native Android widget cannot read the browser's `localStorage` directly.
The JSON export/import feature is the bridge:

1. Tap **Export** in the website to download `countdown-hub-YYYY-MM-DD.json`.
2. In the Android app (Stage 4+), tap **Import** and select that file.
3. The widget reads from the Android app's local storage.

---

## Development stages

- **Stage 1** — This file (website core) ✅
- **Stage 2** — PWA manifest + Service Worker + offline caching
- **Stage 3** — Termux + Android SDK setup
- **Stage 4** — Android app shell (Kotlin, WebView)
- **Stage 5** — Native Android home-screen widget
- **Stage 6** — JSON data bridge (website ↔ widget)
- **Stage 7** — Integration testing
