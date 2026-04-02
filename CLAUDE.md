# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Photobomb is a mobile-first PWA that lets a user take a photo and then generates a version with one additional person added to the scene using AI. The product spec is in `photobomb.txt`.

## Key Product Constraints

- **Primary target**: Mobile browsers with camera access. Desktop is an optional fallback.
- **PWA**: Must be installable and cache static assets; offline shell loading is required.
- **Camera**: Standard browser `getUserMedia` permissions — no native plugins.
- **Saving**: Browser download (not a native gallery API); user saves to gallery from there.
- **AI augmentation**: Server-side API (not local inference for v1); timeout at 5 minutes.
- **Output**: High-quality JPEG of the final augmented image only (not the original capture).

## Architecture (to be built)

The app follows a linear screen flow:
1. **Camera screen** — live viewfinder, capture button, front/rear camera switcher
2. **Review screen** — accept or retake
3. **Person picker** — select one person to add (bundled PNGs or user-uploaded)
4. **Result screen** — show augmented image, save (download) or start over

**Storage**: IndexedDB for user-added person assets and settings.

**People assets**:
- Bundled pre-defined people are PNG files.
- User uploads go through automatic background removal before appearing in the picker.
- If background removal fails, reject the upload rather than passing a bad asset to the AI step.

**AI step**: Sends the captured image + selected person PNG to a server-side API. The model must add exactly one person naturally (matching lighting/perspective) without altering existing people, background, or framing.

## Technology Choices

- Pure static site — no server required. ES modules, no bundler.
- OpenAI API key stored in `localStorage`, sent directly from the browser to `https://api.openai.com/v1/images/edits`. The key modal appears on first load and is accessible via the gear icon on the camera screen.
- Image processing (square crop, mask generation) done client-side with Canvas API / `OffscreenCanvas` in `js/api.js`.
- PWA: `manifest.json` + Service Worker (`sw.js`) with cache-first for static assets.
- Background removal: `@imgly/background-removal` loaded lazily from CDN (`js/bg-removal.js`). Failures reject the upload rather than passing a bad asset through.
- No manual placement or editing UI in v1 — augmentation is one-tap only.

## Running locally

Any static file server works:

```bash
npx serve .         # or
python3 -m http.server 3000
```

The `server/` directory contains an older Express backend (no longer needed) that can be used if you want to move the API key server-side.
