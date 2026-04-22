# Premiumflix

A sleek streaming frontend that connects directly to your Premiumize.me cloud storage. It scans your Premiumize folders, matches files with TMDB, and gives you a Netflix-like interface to stream your own media library right in the browser.

## What it does

- **Direct Streaming**: Plays your Premiumize video files natively using HLS. No extra backend or media server needed.
- **Library Scanning**: Reads your chosen Premiumize folders, cleans up scene release filenames, and pulls the correct metadata from TMDB.
- **YTS Integration**: Search for movies directly in the app. It sends the magnet link to Premiumize and updates your library in the background once the download finishes.
- **Casting**: Built-in support for AirPlay and Chromecast.
- **Snappy UI**: Caches all metadata and watch progress locally in your browser (via IndexedDB), keeping load times instant.
- **Multilingual**: Supports English and German.

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Dexie.js (IndexedDB)
- Hls.js

## Running Locally

1. Clone the repo
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

You don't need to mess with config files out of the box. Just open the app and paste your Premiumize and TMDB API keys into the Settings page. 

If you prefer to use environment variables, you can create a `.env` file:

```env
VITE_PM_API_KEY=your_premiumize_key_here
VITE_TMDB_API_KEY=your_tmdb_key_here
```

## Deployment

Because it's just a static React app, you can easily deploy this to Vercel or Netlify. Premiumize supports CORS for API requests, so the browser can talk to them directly without a backend proxy. A `vercel.json` is already included to handle routing.
