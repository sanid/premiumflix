Comprehensive Exploration Report: Premiumize iOS
1. Overall Project Structure
The project is a SwiftUI-based iOS application for browsing and managing media from Premiumize cloud storage. It follows the MVVM architecture with a clean separation of concerns:

/Users/sanid/Documents/premiumize-ios/premiumize/
├── premiumizeApp.swift              # App entry point
├── ContentView.swift                # Main tab-based UI
├── Models/                          # Data models
│   ├── MediaItem.swift             # Movie, TVShow, Season, Episode, MediaFile
│   ├── UserCollection.swift        # Favorites & Watchlist store
│   ├── WatchProgress.swift         # Watch tracking store
│   ├── ScanFolderSelection.swift   # Folder scanning config
│   └── LanguageStore.swift         # Language preferences
├── Services/                        # API clients
│   ├── PremiumizeAPI.swift         # Premiumize cloud API
│   ├── TMDBService.swift           # TMDB metadata API
│   └── YTSService.swift            # YTS torrent API
├── ViewModels/                      # State management
│   └── LibraryViewModel.swift      # Main library scanning & metadata
└── Views/                           # UI Components
    ├── VideoPlayerView.swift       # KSPlayer-based player
    ├── MovieDetailView.swift       # Movie/show details
    ├── MovieLibraryView.swift      # Movie grid browser
    ├── TVShowLibraryView.swift     # TV show browser
    ├── AddMovieView.swift          # Torrent search & add
    ├── SettingsView.swift          # User settings
    ├── HomeView.swift              # Dashboard
    └── Components/                 # Reusable UI components
2. APIs Used
A. Premiumize API (/Users/sanid/Documents/premiumize-ios/premiumize/Services/PremiumizeAPI.swift)
Base URL: https://www.premiumize.me/api

Authentication: Query parameter apikey (hardcoded in config)

API Key: f42bgybf3ufm6ac4
Customer ID: 910570095
Key Endpoints:

Endpoint	Method	Purpose
/folder/list	GET	List folder contents with optional breadcrumbs
/folder/search	GET	Search for folders by name
/folder/create	POST	Create new folder
/folder/rename	POST	Rename folder
/item/details	GET	Get metadata for a file/folder
/item/listall	GET	List all items in account (flat list)
/account/info	GET	Get account info (premium status, quotas)
/transfer/create	POST	Add magnet/torrent (creates transfer)
/transfer/list	GET	List ongoing transfers
Response Models:

PMFolderListResponse - folder listing with breadcrumbs
PMItem - file/folder item (ID, name, type, size, mimeType, streamLink, transcoded link, codecs, resolution, duration)
PMItemDetailResponse - detailed file metadata including transcode status
PMAccountInfoResponse - account quotas and expiration
PMTransfer - transfer/download job info
Special Features:

Flexible numeric decoding (handles strings and numbers from API)
Stream link vs. raw link handling
Video file detection by MIME type or extension
Transcoding status polling with retry logic (up to 10 retries, 3-second intervals)
Supports native formats (MP4, M4V, MOV, TS, M3U8) and requires transcoding for MKV
B. TMDB API (/Users/sanid/Documents/premiumize-ios/premiumize/Services/TMDBService.swift)
Base URL: https://api.themoviedb.org/3

Image Base URL: https://image.tmdb.org/t/p

Authentication: Query parameter api_key (hardcoded)

API Key: 7468645ef9348873a7bc6c24b6e67c2a
Key Endpoints:

Endpoint	Purpose
/search/movie	Search movies by query & year
/search/tv	Search TV shows
/search/multi	Multi-type search
/movie/{id}	Get movie details
/tv/{id}	Get TV show details
/tv/{tvID}/season/{season}	Get season details with episodes
/movie/{id}/credits	Get cast & crew
/tv/{id}/credits	Get TV credits
/movie/{id}/videos	Get trailers and videos (searches for YouTube trailers)
/tv/{id}/videos	Get TV videos
/movie/{id}/images	Get images (logos, posters)
/tv/{id}/images	Get TV images
/person/{id}	Get actor/director bio
/person/{id}/combined_credits	Get person's filmography
/movie/{id}/similar	Get similar movies
/tv/{id}/similar	Get similar TV shows
/movie/{id}/external_ids	Get IMDb ID
/tv/{id}/external_ids	Get IMDb ID for TV
Language Support:

Resolved per-request from user language preference (de-DE, en-US, or system default)
Language-neutral logo/poster preference
Rate Limiting:

40 req/s max; app uses max 6 concurrent requests with exponential backoff and retry on 429
Data Models:

TMDBMovieDetail - movie/show with genres, runtime, seasons (for TV)
TMDBSeason - season with episode count
TMDBEpisode - episode with name, overview, air date
TMDBCredits - cast members (name, character, profile path)
TMDBVideo - trailer/video (filters for YouTube trailers marked official)
TMDBImageInfo - logos with language and vote average
Best-Match Search:

Multi-strategy search: original title + year → cleaned title + year → no year → alternative title
Scoring algorithm: title match (100 points), prefix/substring match (80/60), word overlap, year bonus (+30/-15), popularity bonus
Minimum score threshold: 40
C. YTS API (/Users/sanid/Documents/premiumize-ios/premiumize/Services/YTSService.swift)
Base URL: https://movies-api.accel.li/api/v2

Key Endpoints:

Endpoint	Parameters	Purpose
/list_movies.json	query_term, page, sort_by, quality	Search for torrents by title
/movie_details.json	movie_id, with_cast, with_images	Get detailed torrent info
Data Models:

YTSMovie - movie with torrents array (ID, title, year, rating, genres, IMDb code, poster)
YTSTorrent - torrent info (hash, quality, seeds/peers, size, upload date)
Generates magnet links with ~8 public trackers
Use Case: "Add similar movies" feature allows users to search YTS for torrents of TMDB-matched movies

3. Authentication Method
All APIs use API key authentication:

Premiumize: Query parameter apikey (long alphanumeric key)
TMDB: Query parameter api_key (MD5-like key)
YTS: No authentication (public API)
Note: API keys are hardcoded in the PremiumizeConfig and TMDBConfig structs—not recommended for production.

4. How the App Fetches/Scans Libraries
Scanning Flow (LibraryViewModel.loadLibrary()):
Resolve scan roots:
User can explicitly select folders via ScanFolderStore (persisted in UserDefaults)
If empty, auto-detect by folder name: "Movies", "Series", "TV Shows", etc. (multi-language support)
Process folders recursively:
For TV Shows: detect by season folder patterns (S01, Season 1, Staffel 2, etc.) or by episode filename patterns (S01E05)
For Movies: single video or multi-file folders without episode patterns
Check for optional TMDB ID prefix in folder name (format: {tmdbId} - {title})
Parse filenames:
Extract title, year, season/episode numbers using regex
Clean titles by removing quality tags (1080p, 720p, BluRay, etc.), codecs, release groups
Create media objects:
Movie → MediaFile array (can have multiple files per movie)
TVShow → Season array → Episode array → MediaFile
Store Premiumize IDs for playback URL lookup
Fetch metadata (concurrent, max 6 requests/s):
Search TMDB with cleaned title + year (multiple fallback strategies)
Fetch credits, trailers, images (logos)
For TV shows: fetch season details and episode metadata
Cache results in library_cache.json
Retry missing metadata:
After main scan, re-attempt any items with blank tmdbDetail
Useful for rate-limited or transient API failures
Incremental Ingest (ingestNewTransfer()):
After a transfer completes, scan only new items in that folder
Fetch metadata for just the new items
Append to existing library without full rescan
5. Data Models for Movies, Shows, Favorites, Watchlist
A. Media Models (MediaItem.swift):
struct MediaFile {
    let id: String, name: String, fileName: String
    let size: Int64, mimeType: String?, streamLink: String?, directLink: String?
    let duration: Double?, resolution: String?, videoCodec: String?, audioCodec: String?
    let premiumizeID: String
    var episodeNumber: Int?, seasonNumber: Int?
}

struct Movie: Codable {
    let id: String
    var title: String, year: String?, files: [MediaFile]
    var tmdbID: Int?, tmdbDetail: TMDBMovieDetail?, credits: TMDBCredits?
    var trailerKey: String?, logoPath: String?, addedAt: Date?
    // Computed properties: displayTitle, posterURL, backdropURL, overview, rating, genres, imdbURL, etc.
}

struct TVShow: Codable {
    let id: String, title: String, year: String?
    var seasons: [Season]
    var tmdbID: Int?, tmdbDetail: TMDBMovieDetail?, credits: TMDBCredits?
    var trailerKey: String?, logoPath: String?
}

struct Season: Codable {
    let id: String, number: Int, name: String
    var episodes: [Episode]
    var tmdbSeason: TMDBSeason?
}

struct Episode: Codable {
    let id: String, number: Int, name: String
    let file: MediaFile
    var tmdbEpisode: TMDBEpisode?
}
B. Watch Progress (WatchProgress.swift):
struct WatchProgress: Codable {
    let mediaID: String  // Premiumize file ID
    var position: Double, duration: Double, lastWatched: Date
    var isFinished: Bool { position / duration >= 0.90 }
    var hasProgress: Bool { position > 30 && !isFinished }
    var fraction: Double { position / duration }
    var remainingLabel: String
}

// Stored in UserDefaults: [String: WatchProgress] (keyed by mediaID)
enum WatchProgressStore {
    static func load() -> [String: WatchProgress]
    static func save(_ progress: WatchProgress)
    static func update(id: String, position: Double, duration: Double)
    static func markFinished(id: String, duration: Double)
}
C. User Collections (UserCollection.swift):
enum UserCollectionStore {
    // Stored as Set<String> in UserDefaults
    static func isFavorite(id: String) -> Bool
    static func toggleFavorite(id: String)
    static func isOnWatchlist(id: String) -> Bool
    static func toggleWatchlist(id: String)
}
D. Scan Folder Configuration (ScanFolderSelection.swift):
struct ScanFolderSelection: Codable {
    let id: String  // Premiumize folder ID
    var name: String
    var kind: Kind  // .movies or .tvShows
}

enum ScanFolderStore {
    static func load() -> [ScanFolderSelection]
    static func save(_ selections: [ScanFolderSelection])
}
6. Player Implementation (VideoPlayerView.swift)
Framework: KSPlayer (third-party, Cocoapod-based)

Architecture:

PlayerViewModel (@MainActor, @Observable):
Manages playback state, current time, duration, buffering, control visibility
Handles resume-from-saved-position on first play
Saves progress every ~10 seconds via WatchProgressStore
Auto-hides controls after 4 seconds of inactivity
Sets up remote commands (MPRemoteCommandCenter) for lock-screen controls
VideoPlayerView:
KSVideoPlayer coordinator manages the underlying player layer
Portrait mode: player takes 16:9 of screen width, controls + metadata below
Landscape mode: full-screen player with gradient overlays and centered controls
Picture-in-Picture support via coordinator.playerLayer?.isPipActive
AirPlay button (AVRoutePickerView) for casting
Features:

Play/pause, skip forward/backward (10s, 30s controls in lock screen)
Seek by dragging scrubber
Auto-resume to saved position (skip if < 30s watched or ≥ 90% watched)
Metadata display (title, subtitle, year, rating, genres, overview)
Error overlay with playback failure messages
Background playback support (audio session configured for .playback mode)
Rotation support (keeps player stable across portrait ↔ landscape)
Playback URL Resolution:

First check MediaFile.playbackURL (cached during scan)
If missing, fetch via library.fetchItemDetails() to get stream link
For MKV files: fetchItemDetailsWithTranscode() polls transcoding status (max 10 retries)
7. Key Features of the App
Core Features:
Cloud Library Scanning
Auto-detect "Movies" and "Series" folders (multi-language variants)
Manual folder selection with Kind override (movies vs. TV shows)
Recursive folder traversal for nested media structures
Season folder detection (S01, Season 1, Staffel 2, Saison 1, Temporada 1, etc.)
TMDB ID parsing from folder names: 123456 - Movie Title
Metadata Enrichment
TMDB integration for posters, backdrops, ratings, genres, runtime, taglines
Logo/artwork selection (prefers German language, falls back to English)
Cast info: name, character, profile photos
Similar movies/shows recommendations
IMDb integration (links via external IDs)
Episode guides with season/episode details for TV
Video Playback
KSPlayer-based player (supports H.264, H.265, VP9 codecs)
Auto-transcoding for unsupported formats (MKV → MP4 stream)
Resume playback from saved position
Watch progress tracking (90% = "finished")
Lock-screen controls and remote commands
Picture-in-Picture support
AirPlay casting
Content Management
Favorites: Mark movies/shows as favorites (stored in UserDefaults)
Watchlist: Add to watchlist for later (stored in UserDefaults)
Watch Status: Mark as watched (progress = 100%), clear progress to re-watch
File information display: size, resolution, codecs, duration
Torrent Integration (Add Content)
Search YTS for torrents matching TMDB-identified movies
Display torrents by quality (1080p, 720p, etc.), seeds, peers
Generate magnet links with trackers
Option to add similar movies via torrent
Caching & Performance
Full library cached as JSON (library_cache.json)
TMDB response caching per-language
Incremental ingest for new transfers (avoid full rescan)
Concurrent metadata fetching (max 6 simultaneous TMDB requests)
Rate-limit handling with exponential backoff
Internationalization
Language support: English, German, System Default
Per-language TMDB requests (images, metadata)
Localized UI strings (SwiftUI String(localized:))
Multi-language folder name support (season detection in 5+ languages)
UI/UX
Dark theme (forced via .preferredColorScheme(.dark))
Tab-based navigation: Home, Movies, TV Shows, Add
Movie/show detail views with hero sections (backdrop, logo, metadata)
Grid-based library browser with poster cards
Loading/error states during scan
Background audio support for continued playback
8. File Paths Summary
Core Services:

/Users/sanid/Documents/premiumize-ios/premiumize/Services/PremiumizeAPI.swift (Premiumize cloud API)
/Users/sanid/Documents/premiumize-ios/premiumize/Services/TMDBService.swift (TMDB metadata)
/Users/sanid/Documents/premiumize-ios/premiumize/Services/YTSService.swift (YTS torrents)
Models:

/Users/sanid/Documents/premiumize-ios/premiumize/Models/MediaItem.swift (Movie, TVShow, Season, Episode)
/Users/sanid/Documents/premiumize-ios/premiumize/Models/WatchProgress.swift (Play tracking)
/Users/sanid/Documents/premiumize-ios/premiumize/Models/UserCollection.swift (Favorites, watchlist)
/Users/sanid/Documents/premiumize-ios/premiumize/Models/ScanFolderSelection.swift (Folder config)
/Users/sanid/Documents/premiumize-ios/premiumize/Models/LanguageStore.swift (Language prefs)
ViewModels:

/Users/sanid/Documents/premiumize-ios/premiumize/ViewModels/LibraryViewModel.swift (Main logic: scanning, metadata)
Views:

/Users/sanid/Documents/premiumize-ios/premiumize/Views/VideoPlayerView.swift (KSPlayer-based player)
/Users/sanid/Documents/premiumize-ios/premiumize/Views/MovieDetailView.swift (Movie details + play)
/Users/sanid/Documents/premiumize-ios/premiumize/Views/MovieLibraryView.swift (Movie grid)
/Users/sanid/Documents/premiumize-ios/premiumize/Views/TVShowDetailView.swift (TV show details)
/Users/sanid/Documents/premiumize-ios/premiumize/Views/TVShowLibraryView.swift (TV grid)
/Users/sanid/Documents/premiumize-ios/premiumize/Views/AddMovieView.swift (Torrent search)
/Users/sanid/Documents/premiumize-ios/premiumize/Views/HomeView.swift (Dashboard)
/Users/sanid/Documents/premiumize-ios/premiumize/Views/SettingsView.swift (Settings)
Entry Points:

/Users/sanid/Documents/premiumize-ios/premiumize/premiumizeApp.swift (App entry)
/Users/sanid/Documents/premiumize-ios/premiumize/ContentView.swift (Tab navigation)
Config:

/Users/sanid/Documents/premiumize-ios/CustomInfo.plist (ATS/background modes)