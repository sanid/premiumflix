# Premiumflix

A sleek streaming frontend that connects directly to your Premiumize.me cloud storage. It scans your Premiumize folders, matches files with TMDB, and gives you a Netflix-like interface to stream your own media library right in the browser.

## What it does

- **Direct Streaming**: Plays your Premiumize video files natively using HLS with adaptive quality, hover thumbnails, and subtitle support (embedded + OpenSubtitles with sync offset).
- **Library Scanning**: Reads your chosen Premiumize folders, cleans up scene release filenames, and pulls the correct metadata from TMDB. Metadata is cached locally, so rescans only fetch what's new.
- **Fast Rescans**: Scan results are cached in IndexedDB — rescans skip already-fetched TMDB data. Optional scheduled auto-rescan (6/12/24h) notifies you about new movies and episodes while a tab is open.
- **YTS Integration**: Search for movies directly in the app. It sends the magnet link to Premiumize and updates your library in the background once the download finishes.
- **Usenet (SceneNZBs)**: Browse and add NZBs from SceneNZBs. Automatic ingestion and episode detection when transfers complete.
- **Discover & Grab**: Search results show TMDB matches you don't own yet — click one to jump straight into the release picker (YTS/NZB) and queue the download.
- **Episode Tracking**: Show cards display `12/24 EP` completeness, missing seasons appear in the episode selector, and unaired/unowned episodes show as dimmed placeholders.
- **Mark Watched**: Manual watched/unwatched toggles on details pages (whole show or per season), synced visually with green checkmarks everywhere.
- **Trakt Sync**: Connect via device-code auth — playback scrobbles automatically (watched past 80%), and you can import your entire watched history.
- **Library Management**: Multi-select, filter (never watched, cloud-only, duplicates), and bulk-remove items. Duplicate detection keeps the best copy.
- **Video Player**: Full-featured player with play/pause, seek with thumbnails, volume, quality selector, audio/subtitle tracks, playback speed, Picture-in-Picture, AirPlay, and Chromecast. Mobile-optimized with swipe gestures, double-tap to seek, and landscape detection.
- **Casting**: Built-in support for AirPlay and Chromecast.
- **Snappy UI**: Caches all metadata and watch progress locally in your browser (via IndexedDB), keeping load times instant.
- **Backups**: Library, favorites, watchlist and watch progress auto-sync to your Premiumize cloud — plus full JSON export/import in Settings.
- **Multilingual**: Supports English and German.

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Dexie.js (IndexedDB)
- Hls.js
- Vercel Serverless Functions (API proxy)

## Running Locally

1. Clone the repo
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

You don't need to mess with config files out of the box. Just open the app and paste your Premiumize and TMDB API keys into the Settings page. 

For Trakt sync, create a free app at [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications) and paste its client ID in Settings → Trakt Sync (or set `VITE_TRAKT_CLIENT_ID`).

If you prefer to use environment variables, you can create a `.env` file:

```env
VITE_PM_API_KEY=your_premiumize_key_here
VITE_TMDB_API_KEY=your_tmdb_key_here
VITE_SCENENZBS_API_KEY=your_scenenzbs_key_here
```

## Deployment

Deploy to Vercel or Netlify. Premiumize supports CORS for API requests, so the browser can talk to them directly. A `vercel.json` is included for routing and serverless API proxies (TMDB, SceneNZBs).

Set environment variables in your Vercel/Netlify dashboard for API keys you want to keep server-side.
