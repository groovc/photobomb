# Photobomb

![Status](https://img.shields.io/badge/status-prototype-f59e0b)
![Platform](https://img.shields.io/badge/platform-mobile_web-0f766e)
![Stack](https://img.shields.io/badge/stack-vanilla_js-111827)
![Rendering](https://img.shields.io/badge/rendering-browser_canvas-0ea5e9)
![Storage](https://img.shields.io/badge/storage-IndexedDB-2563eb)

Photobomb is a mobile-first browser app for taking a photo and producing a version with one extra person added to the scene.

It is built as a static site with plain ES modules, camera access through standard web APIs, local asset persistence in IndexedDB, and lightweight browser-side image processing with canvas-based compositing.

## Overview

- Capture a photo with the device camera
- Review the shot before generation
- Pick a bundled PNG or upload your own person image
- Remove upload backgrounds in the browser
- Use face-aware placement heuristics to position the added person
- Composite the final image locally in the browser
- Save the result as a JPEG

## Tech Stack

- Vanilla HTML, CSS, and ES modules
- No framework
- No bundler
- Camera and canvas APIs in the browser
- IndexedDB for local people assets
- `OffscreenCanvas` for local composition
- `@imgly/background-removal` for uploaded image cleanup
- TensorFlow.js BlazeFace loaded lazily for face-guided placement

## Quick Start

Serve the repo with any static file server:

```bash
python3 -m http.server 3000
```

Then open:

```text
http://localhost:3000
```

`localhost` or HTTPS is required for camera access in modern browsers.

## How It Works

1. Open the app and allow camera access.
2. Capture a photo and review it.
3. Choose a bundled person or upload a new one.
4. For uploads, the app attempts browser-side background removal.
5. The app estimates placement locally using image bounds and optional face detection.
6. The app composites the selected person onto the captured image locally in the browser.
7. The final result is shown and can be downloaded.

## Project Structure

```text
.
├── assets/
│   └── people/            Bundled people assets and manifest
├── css/
│   └── style.css          App styles
├── js/
│   ├── api.js             Composition and OpenAI request logic
│   ├── app.js             App flow and UI wiring
│   ├── bg-removal.js      Background removal integration
│   ├── camera.js          Camera startup and capture
│   ├── db.js              IndexedDB helpers
│   ├── face-detection.js  BlazeFace integration
│   ├── image-segmentation.js
│   ├── picker.js          People picker and upload flow
│   └── pose-detection.js
├── .env.example
├── index.html
├── photobomb.txt          Product notes and constraints
└── README.md
```

## Configuration

### Face detection toggle

Face detection is enabled by default and can be controlled with either a query param or local storage.

Disable it:

```text
?faceDetection=0
```

```js
localStorage.setItem('feature_face_detection', '0');
```

Enable it explicitly:

```text
?faceDetection=1
```

## Development Notes

- This repo is currently browser-first. There is no required backend in the checked-in app flow.
- The checked-in implementation performs local compositing rather than remote image generation.
- Upload background removal fails closed: unusable uploads are rejected instead of silently passing through.
- Some ML and CV dependencies are loaded from CDNs, so local behavior depends on network availability.
- API key UI still exists in the codebase, but it is not part of the active image-processing path.

## Limitations

- Placement is still heuristic and can look repetitive or unnatural.
- Mobile browsers are the primary target; desktop behavior is secondary.
- Browser-side background removal can fail on low-memory devices or unsupported browsers.
- There is no manual placement or editing UI.
- Some legacy UI and configuration pieces remain from earlier OpenAI-backed experiments.

## Troubleshooting

### Camera does not start

- Confirm camera permissions are granted.
- Use `localhost` or HTTPS.
- Try a current mobile browser.

### Upload fails during background removal

- Retry with a smaller image.
- Check the browser console for CDN, WASM, or model-loading errors.
- Try a cleaner source image with a more distinct subject.

### Placement looks wrong

- Confirm face detection is enabled.
- Use a source photo with a visible face and clear foreground subject.
- Check the console for lazy-load failures from TensorFlow.js or BlazeFace.

## Current State

This repository is an actively evolving prototype. The product direction in [photobomb.txt](/Users/victorchen/Development/photobomb/photobomb.txt) still includes broader PWA goals, but the checked-in app today is focused on a simple static browser flow that can be served locally and iterated on quickly.
