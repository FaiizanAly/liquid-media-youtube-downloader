# Liquid Media — Local Companion Service

The **Liquid Media Companion** is a lightweight, secure local Node.js daemon that extends the **Liquid Media** Chrome extension. While standard direct media downloads work natively inside Chrome, this companion handles local stream remuxing (combining separate YouTube 1080p+ video and audio tracks) and authorized format transcoding without sending media through third-party servers.

---

## 1. Quick Start

### Prerequisites

- **Node.js**: v16+ (built and tested on Node.js v24)
- **Optional**: [FFmpeg](https://ffmpeg.org/) and/or [yt-dlp](https://github.com/yt-dlp/yt-dlp) for local media processing.

### Installation

No heavy npm dependencies required. Simply launch:

```bash
cd companion
npm start
```

Or run directly:

```bash
node companion/server.js
```

The service will output:
```text
[Liquid Media Companion] Service running on http://127.0.0.1:48123
```

---

## 2. Security Boundaries & Architecture

- **Strict Loopback Binding**: The HTTP server listens exclusively on `127.0.0.1` (never on `0.0.0.0`), preventing incoming connections from local network peers.
- **Origin Validation**: Rejects requests originating from untrusted web domains. Only extension pages (`chrome-extension://*`) and loopback callers are authorized.
- **Path Traversal Protection**: All generated media files are isolated strictly inside `companion/temp/`. File resolution uses cryptographic 32-character hex IDs and verifies containment before streaming.
- **Safe Process Invocation**: Media tools (`ffmpeg` / `yt-dlp`) are executed via `child_process.spawn` with `shell: false` and strict array argument passing. No shell interpolation or arbitrary commands are permitted.
- **Memory & Disk Hygiene**: Temporary media containers and jobs are automatically pruned after 15 minutes.

---

## 3. API Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Returns service status, version, and detected tools (`ffmpeg`, `yt-dlp`). |
| `POST` | `/api/formats` | Inspects authorized URL and returns normalized video and audio stream formats. |
| `POST` | `/api/jobs` | Dispatches an asynchronous remuxing / conversion job. |
| `GET` | `/api/jobs/:id` | Returns real-time progress percentage (0–100%) and job status. |
| `GET` | `/api/jobs/:id/download` | Streams the finished media file safely to Chrome Downloads. |

---

## 4. Verification

Run the automated test suite from the project root:

```bash
node tests/companion.test.js
```
