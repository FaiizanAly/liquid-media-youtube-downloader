# Liquid Media

> **macOS-inspired Liquid Glass Media Download Manager**  
> Built for Google Chrome (Manifest V3) with native system aesthetics, secure stream management, and an optional local companion engine.

![Liquid Media UI](icons/icon128.png)

---

## 1. Overview & Architecture

**Liquid Media** is a media utility built with pure HTML5, CSS3, vanilla JavaScript, and Chrome Extension APIs. Designed around the translucent **macOS 27 Golden Gate "Liquid Glass"** visual language, it brings tactile, frosted-glass elegance to browser media management without bloat or heavy frameworks.

### Architecture

```text
liquid-media/
├── manifest.json              # Manifest V3 extension configuration
├── popup.html                 # Apple Liquid Glass popup window
├── popup.css                  # Frosted glass, specular highlights, system typography
├── popup.js                   # Popup UI controller & state management
├── background.js              # Manifest V3 service worker & Chrome Downloads manager
├── content.js                 # Media page metadata collector & SPA navigation monitor
├── js/
│   ├── validators.js          # Cross-environment URL, ID, and path sanitization
│   ├── formats.js             # Media format normalization, schemas, and sorting
│   ├── api.js                 # Companion API client with timeout protection
│   └── ui.js                  # Safe DOM component renderer (XSS-proof)
├── icons/
│   ├── icon16.png             # Crisp multi-size extension icons
│   ├── icon48.png
│   ├── icon128.png
│   └── generate_icons.js      # Pure Node.js PNG encoder
├── companion/                 # Optional local Node.js media companion
│   ├── package.json
│   ├── server.js              # Loopback HTTP server (127.0.0.1:48123)
│   ├── routes/                # Health, format resolution, and job endpoints
│   ├── services/              # Media processor & safe process invocation
│   └── README.md
└── tests/                     # Automated unit and integration test suites
    ├── validators.test.js
    ├── formats.test.js
    ├── companion.test.js
    └── run_tests.js
```

---

## 2. Key Features

- **Liquid Glass Interface**: Translucent frosted-glass panels (`backdrop-filter: blur(28px)`), delicate top specular highlights, refined micro-borders, Apple system font stack, and adaptive light/dark mode support.
- **Independent Video & Audio Selection**: Segmented control tab switcher between **Video Downloads** (ordered by resolution and fps) and **Audio Only** (ordered by bitrate with MP3/AAC preference).
- **Source Detection**: Automatically recognizes YouTube watch URLs (`/watch?v=...`), shorts (`/shorts/...`), youtu.be links, and direct HTML5 `<video>` sources. Tracks YouTube's single-page app (SPA) navigation via `yt-navigate-finish`.
- **Chrome Native Downloads API**: Direct media files are passed to Chrome's native download manager with progress tracking and sanitized filenames.
- **Honest Capability Reporting**: Never promises unavailable streams or fakes resolutions. Clearly flags formats requiring stream remuxing and displays standalone vs companion mode status.
- **Local Companion Service**: Optional local Node.js server that runs strictly on `127.0.0.1` for authorized track merging and audio transcoding.

---

## 3. Installation Guide

### Loading the Extension in Google Chrome

1. Open Google Chrome.
2. In the address bar, navigate to: `chrome://extensions`
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button in the top-left.
5. In the file picker, select this workspace folder:
   ```text
   c:\Users\Aly\Desktop\YT Downloader
   ```
6. The **Liquid Media** icon will appear in your Chrome toolbar. Pin it for quick access!

---

## 4. Running the Local Companion Service

Direct media downloads work natively in Chrome without the companion. To unlock full YouTube stream extraction, 1080p+ remuxing, and local audio conversion:

### Option A: One-Click Launcher (Windows)
Double-click `start-companion.bat` in the project root folder.

### Option B: Terminal
In the project root folder:
```bash
npm start
```

The service will initialize on `http://127.0.0.1:48123`. The extension popup automatically detects the running service via its built-in heartbeat, turns the status dot green (**Companion Active**), and immediately populates real formats with working download buttons.

> [!NOTE]
> **High-Fidelity Engine**: FFmpeg and yt-dlp are fully supported. When present, the companion automatically utilizes them to extract exact stream resolutions (1080p, 720p, etc.) and convert high-bitrate audio (320 kbps MP3, AAC M4A) directly into your Downloads folder.

---

## 5. Security & Manifest V3 Design

| Permission | Justification |
|---|---|
| `downloads` | Required to dispatch direct media files via Chrome's native `chrome.downloads.download()` API. |
| `activeTab` | Grants temporary access to inspect the active tab's URL and query video metadata when the popup opens. |
| `storage` | Persists download state and progress so active downloads survive service worker suspension and popup closures. |
| `host_permissions` | Restricted strictly to `http://127.0.0.1:48123/*` (local companion communication) and `*://*.youtube.com/*` (for watch page detection). |

### Security Boundaries
- **No Remote Executable Code**: Fully compliant with Manifest V3 CSP. No external CDNs, eval, or runtime script injection.
- **Strict Loopback Binding**: Companion listens exclusively on `127.0.0.1`, ignoring any LAN interfaces.
- **Origin Validation**: The companion validates the `Origin` header and rejects requests from unauthorized web pages.
- **Path Traversal & Injection Prevention**: Media files are quarantined in `companion/temp/` with 32-character hex tokens. Process execution disables shells (`shell: false`) and uses strict argument arrays.
- **XSS-Safe DOM Manipulation**: All UI components are generated via `document.createElement` and `textContent`.

---

## 6. Running the Automated Test Suite

To verify all validation rules, format normalization, companion endpoints, and security protections:

```bash
node tests/run_tests.js
```

### Verified Test Cases:
- **Validators (`tests/validators.test.js`)**: Valid URL checks, YouTube domain & ID extraction (watch, shorts, youtu.be, query params), direct media extension parsing, OS-safe filename sanitization, origin allowlisting.
- **Formats (`tests/formats.test.js`)**: Byte formatting, schema validation, direct HTML5 format synthesis, descending resolution sort, descending audio bitrate sort.
- **Companion (`tests/companion.test.js`)**: `/api/health` status check, `/api/formats` schema resolution, `/api/jobs` queue creation and polling, `/api/jobs/:id/download` file streaming, origin rejection (403), path traversal blocking (404), and oversized payload rejection (413).

---

## 7. License

MIT License. Designed with care for premium desktop media workflows.
