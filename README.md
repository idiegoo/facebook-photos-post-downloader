# Facebook Post Photo Downloader (Next.js & TypeScript)

A high-performance application built with Next.js (App Router) and strict TypeScript, designed to extract all photos from Facebook posts in their original maximum resolution and package them into a compressed ZIP file with custom naming.

The system incorporates a reactive navigation engine and multithreaded worker pools (`asyncPool`) to analyze the target post and download image files in parallel directly into a compressed ZIP stream, drastically reducing waiting times compared to conventional implementations.

---

## Table of Contents

1. Key Features
2. System Requirements
3. Installation and Setup
4. Usage Modes
   - Web Interface (Next.js)
   - Interactive Terminal (CLI in TypeScript)
   - Browser Script (Tampermonkey / Userscript)
   - Developer Console Snippet (Bookmarklet)
5. Technical Architecture
   - Isolated Post Gallery Traversal
   - Asynchronous Multithreaded Download & Streaming
   - Zero-Runtime SVG Icon System
6. Repository Structure
7. API Reference
8. Troubleshooting and FAQ
9. License

---

## 1. Key Features

- Clean Modern Architecture: Fully developed in Next.js (App Router) and strict TypeScript with `noImplicitAny` and zero use of `any`.
- Exact Post Isolation: Navigates directly inside the post's isolated photo collection (`set=pcb...`), ensuring only images belonging to the requested post are extracted, without leaking feed items, suggested posts, profile pictures, or comments.
- Multithreaded Parallel Download: Concurrent downloading of up to 16 images in parallel utilizing network bandwidth efficiently via the `asyncPool` dispatcher.
- Automatic Full-Cycle Detection: Tracks unique photo identifiers (`fbid`), detecting automatically and instantly when the gallery has completed a full loop to terminate extraction without unnecessary delays.
- Memory-Safe Stream Compression: On-the-fly packaging using native Web Streams and `archiver`, maintaining sequential ordering (`_01.jpg`, `_02.jpg`) without buffering large ZIP files in server memory.
- Optimized Vector Iconography: Powered by `@react-zero-ui/icon-sprite` with compile-time generation of a single SVG sprite in `public/icons.svg`, eliminating emojis and reducing payload size.
- Real-Time Live Monitoring: Bi-directional Server-Sent Events (SSE) stream reporting active threads, detected photos, and transfer rates.

---

## 2. System Requirements

- Node.js: Version 18.17.0 or higher (verified on Node.js v22).
- Package Manager: `pnpm` (version 9 or higher recommended).
- Web Browser: Google Chrome, Microsoft Edge, Mozilla Firefox, or Brave (Puppeteer manages its own Chromium binary for server tasks).
- RAM: Minimum 2 GB recommended for headless Chromium execution.

---

## 3. Installation and Setup

Clone the repository and install dependencies using `pnpm`:

```bash
git clone <REPOSITORY_URL>
cd facebook-post-downloader
pnpm install
```

---

## 4. Usage Modes

### Option A: Web Interface (Next.js)

Recommended for general users, offering a complete graphical interface with real-time feedback.

1. Start the development server:
   ```bash
   pnpm dev
   ```
   Or build for production:
   ```bash
   pnpm build
   pnpm start
   ```

2. Open your browser at:
   ```text
   http://localhost:3000
   ```

3. Paste the Facebook post URL (or multiple URLs separated by commas).
4. Select the desired number of parallel threads (4, 6, 8, or 12 threads for parallel download).
5. Enter your preferred name for the ZIP archive (e.g. `car_photos`).
6. Click "Download Photos as ZIP". The file will be generated and downloaded automatically.

---

### Option B: Interactive Terminal (CLI in TypeScript)

Ideal for remote servers, headless environments, or automated scripts.

Run the interactive CLI:
```bash
pnpm cli
```

The wizard will prompt for:
1. Facebook post URL (supports single or comma-separated URLs).
2. ZIP archive name (default: `facebook_photos`).
3. Number of concurrent download threads (default: 6).

The resulting compressed ZIP archive is automatically stored inside the `downloads/` directory.

---

### Option C: Browser Script (Tampermonkey / Userscript)

Recommended for private posts, closed groups, or content requiring your active Facebook login session.

1. Install the Tampermonkey extension in your browser.
2. Create a new user script.
3. Copy and paste the entire contents of:
   `userscript/fb-post-downloader.user.js`
4. Save the script. When visiting any Facebook post, a floating button titled "Download Photos as ZIP" will appear in the lower-right corner.
5. The script allows setting the filename, concurrency level, and generates the ZIP directly within your browser.

---

### Option D: Developer Console Snippet (Bookmarklet)

Requires no browser extensions.

1. Open the target Facebook post in your regular browser.
2. Open Developer Tools by pressing F12 or Ctrl + Shift + I, and select the "Console" tab.
3. Open `bookmarklet/fb-downloader-console.js`, copy all contents, and paste into the console.
4. Press Enter. A modal will appear allowing you to specify the filename and concurrency for immediate in-browser download.

---

## 5. Technical Architecture

### Isolated Post Gallery Traversal

Unlike naive scrapers that attempt to parse the entire feed or intercept broad CDN requests (which captures unrelated images from feeds, ads, and profiles), `src/lib/scraper.ts` implements a controlled traversal:

1. Post Set Resolution: Navigates to the post and locates the primary collection anchor (`set=pcb...`), switching directly into the post's isolated viewer.
2. High-Resolution Inspection: At each step, waits reactively for the main photo element to load with its natural dimensions, filtering out avatars, UI icons, and thumbnails.
3. Keyboard & Reactive Navigation: Triggers keyboard right-arrow events and next-button controls, polling reactively until the unique identifier (`fbid`) changes in the DOM.
4. Deterministic Loop Termination: Maintains a `seenFbids` registry. As soon as the first `fbid` is re-encountered, the loop terminates immediately, having extracted 100% of the photos from the post.

### Asynchronous Multithreaded Download & Streaming

Implemented in `src/lib/concurrency.ts` and `src/app/api/download/route.ts`:

- Task Pool: `asyncPool` dispatches parallel downloads up to the configured concurrency limit (default: 6), emitting real-time progress events over SSE.
- Buffer Ordering: Out-of-order downloads are indexed in an in-memory map and appended sequentially to the archive stream to preserve numbered filenames (`_01.jpg`, `_02.jpg`).
- Direct Streaming: Archiving occurs on the fly via `archiver` piped into a native `ReadableStream Web`, maintaining minimal server memory usage.

### Zero-Runtime SVG Icon System

- `@react-zero-ui/icon-sprite` scans icon references during pre-build (`pnpm prebuild` / `pnpm predev`).
- It outputs a static, cacheable SVG sprite to `public/icons.svg` containing only the required vector icons, completely eliminating emojis from the user interface.

---

## 6. Repository Structure

```text
facebook-post-downloader/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout and head configuration
│   │   ├── page.tsx                  # Home page and UI composition
│   │   ├── globals.css               # Global styles and dark-mode palette
│   │   └── api/
│   │       ├── download/
│   │       │   └── route.ts          # ZIP archive streaming endpoint
│   │       └── progress/
│   │           └── [sessionId]/
│   │               └── route.ts      # Server-Sent Events (SSE) progress endpoint
│   ├── components/
│   │   ├── DownloaderForm.tsx        # Form component with icons and thread selector
│   │   └── StatusPanel.tsx           # Live progress bar and console log viewer
│   ├── lib/
│   │   ├── concurrency.ts            # Multithreaded asyncPool dispatcher
│   │   ├── scraper.ts                # Isolated gallery scraper with Puppeteer
│   │   └── progress.ts               # In-memory SSE subscriber manager
│   └── types/
│       ├── progress.ts               # Type definitions for progress payloads
│       ├── scraper.ts                # Interfaces for scraper options and data
│       └── concurrency.ts            # Generic definitions for worker pool
├── cli.ts                            # Interactive TypeScript CLI application
├── next.config.mjs                   # Next.js configuration (serverExternalPackages)
├── tsconfig.json                     # Strict TypeScript configuration
├── public/
│   └── icons.svg                     # Build-time generated SVG sprite
├── userscript/
│   └── fb-post-downloader.user.js    # In-browser Tampermonkey script
├── bookmarklet/
│   └── fb-downloader-console.js      # Console bookmarklet snippet
├── downloads/                        # Output directory for CLI downloads
├── package.json                      # Build scripts and project dependencies
├── pnpm-lock.yaml                    # pnpm dependency lockfile
└── README.md                         # Technical documentation
```

---

## 7. API Reference

### GET `/api/progress/:sessionId`
Server-Sent Events (SSE) channel.

- Path Parameters:
  - `sessionId` (string): Client-generated unique session ID.
- Response Headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
- Payload Example:
  ```json
  {
    "stage": "downloading_file",
    "message": "Downloading image 4 of 23 [6 active threads]...",
    "current": 4,
    "total": 23,
    "activeThreads": 6,
    "concurrency": 6
  }
  ```

### GET `/api/download`
Generates and streams the ZIP file in real time.

- Query Parameters:
  - `url` (required): Facebook post URL (supports comma-separated URLs).
  - `name` (optional): Desired filename for the ZIP (default: `facebook_photos`).
  - `concurrency` (optional): Parallel download thread count (1 to 16, default: 6).
  - `sessionId` (optional): Session ID to link real-time SSE progress.
- Response Headers:
  - `Content-Type: application/zip`
  - `Content-Disposition: attachment; filename="<name>.zip"`

---

## 8. Troubleshooting and FAQ

### Server reports no photos found
- Check if the post is publicly accessible. If the post is in a private group or restricted to friends, the server's automated browser cannot view it anonymously. In that case, use the Userscript or Console Bookmarklet directly in your browser with your active session.
- Ensure the URL belongs to a post that contains photos.

### Recommended thread count
- Standard connections (30 to 100 Mbps): 4 or 6 threads provide an optimal balance between CPU utilization and speed.
- High-speed connections (300+ Mbps): 8 or 12 threads maximize download throughput.

---

## 9. License

This project is licensed under the MIT License.
