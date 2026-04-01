export const KEY_STORAGE = 'openai_api_key';
const FACE_DETECTION_FLAG = 'feature_face_detection';
const FACE_TO_BODY_RATIO = 7;
const DEFAULT_CONTENT_HEIGHT_RATIO = 0.40;
const MIN_CONTENT_HEIGHT_RATIO = 0.34;
const MAX_CONTENT_HEIGHT_RATIO = 0.72;
const DEFAULT_ANCHOR_RATIO = 0.82;
const MIN_ANCHOR_RATIO = 0.18;
const MAX_ANCHOR_RATIO = 0.82;
const FACE_KEEP_OUT_SIDE_PADDING_RATIO = 0.2;
const FACE_KEEP_OUT_TOP_PADDING_RATIO = 0.15;
const FACE_KEEP_OUT_BOTTOM_PADDING_RATIO = 0.1;
const PLACEMENT_TEMPLATES = [
  { offset: 0.0, scale: 1.08, peek: 0.16 },
  { offset: -0.08, scale: 1.0, peek: 0.2 },
  { offset: 0.08, scale: 0.92, peek: 0.12 },
  { offset: -0.16, scale: 0.96, peek: 0.24 },
];

export const getApiKey = () => localStorage.getItem(KEY_STORAGE);
export const saveApiKey = (key) => localStorage.setItem(KEY_STORAGE, key.trim());
export const clearApiKey = () => localStorage.removeItem(KEY_STORAGE);

function isFaceDetectionEnabled() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('faceDetection') === '0') return false;
  if (params.get('faceDetection') === '1') return true;
  return localStorage.getItem(FACE_DETECTION_FLAG) !== '0';
}

// ── Person image analysis ──────────────────────────────────────────────────────

/**
 * Scan the person PNG (RGBA pixel data) to find the bounding box of
 * non-transparent pixels. Returns { top, bottom, left, right } as fractions
 * of the image dimensions (0–1).
 */
function findContentBounds(imageBitmap) {
  const { width: w, height: h } = imageBitmap;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  let top = h, bottom = 0, left = w, right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 10) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  // Guard against fully-transparent images
  if (top > bottom) return { top: 0, bottom: 1, left: 0, right: 1 };

  return {
    top: top / h,
    bottom: bottom / h,
    left: left / w,
    right: right / w,
  };
}

// ── Placement logic ────────────────────────────────────────────────────────────

/**
 * Decide how large to draw the person and where to place them.
 *
 * Strategy:
 * - Scale so the visible content height (top of head → feet) is ~40% of the
 *   photo height. This keeps the photobomber proportional to typical subjects.
 * - Peek from the bottom: shift the person down so ~20% of their full height
 *   is off-canvas, giving the classic "emerging from below" look.
 * - Horizontal: right-of-center (~65% from left) so they don't block the
 *   main subject but are clearly visible.
 *
 * @returns {{ drawX, drawY, drawW, drawH }}
 */
function computePlacement(
  photoW,
  photoH,
  personBitmap,
  bounds,
  targetContentH = photoH * DEFAULT_CONTENT_HEIGHT_RATIO,
  anchorRatio = DEFAULT_ANCHOR_RATIO,
  peekRatio = 0.2,
) {
  const contentH = (bounds.bottom - bounds.top) * personBitmap.height;
  const scale = targetContentH / contentH;

  const drawW = Math.round(personBitmap.width * scale);
  const drawH = Math.round(personBitmap.height * scale);

  const peekY = photoH - drawH + Math.round(drawH * peekRatio);

  const contentCenterInDraw = Math.round(((bounds.left + bounds.right) / 2) * drawW);
  const drawX = Math.round(photoW * anchorRatio) - contentCenterInDraw;

  return { drawX, drawY: peekY, drawW, drawH };
}

function getContentRect(drawX, drawY, drawW, drawH, bounds) {
  return {
    left: drawX + (bounds.left * drawW),
    top: drawY + (bounds.top * drawH),
    right: drawX + (bounds.right * drawW),
    bottom: drawY + (bounds.bottom * drawH),
  };
}

function rectIntersectionArea(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);

  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function buildFaceKeepOutZones(photoW, photoH, face) {
  if (!face) return [];

  const width = face.width;
  const height = face.height;

  return [{
    left: Math.max(0, face.x - (width * FACE_KEEP_OUT_SIDE_PADDING_RATIO)),
    top: Math.max(0, face.y - (height * FACE_KEEP_OUT_TOP_PADDING_RATIO)),
    right: Math.min(photoW, face.x + width + (width * FACE_KEEP_OUT_SIDE_PADDING_RATIO)),
    bottom: Math.min(photoH, face.y + height + (height * FACE_KEEP_OUT_BOTTOM_PADDING_RATIO)),
  }];
}

function mirrorAnchor(anchorRatio) {
  return 1 - anchorRatio;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildTemplateCandidates(photoW, photoH, personBitmap, bounds, targetContentH, face) {
  const mirroredFaceAnchor = face
    ? mirrorAnchor((face.x + (face.width / 2)) / photoW)
    : DEFAULT_ANCHOR_RATIO;
  const baseAnchor = clamp(mirroredFaceAnchor, MIN_ANCHOR_RATIO, MAX_ANCHOR_RATIO);

  return PLACEMENT_TEMPLATES.map((template) => ({
    placement: computePlacement(
      photoW,
      photoH,
      personBitmap,
      bounds,
      targetContentH * template.scale,
      clamp(baseAnchor + template.offset, MIN_ANCHOR_RATIO, MAX_ANCHOR_RATIO),
      template.peek,
    ),
    template,
  }));
}

function scorePlacement({
  photoW,
  photoH,
  placement,
  bounds,
  keepOutZones,
  preferredAnchorRatio,
}) {
  const contentRect = getContentRect(
    placement.drawX,
    placement.drawY,
    placement.drawW,
    placement.drawH,
    bounds,
  );
  const contentArea = Math.max(1, (contentRect.right - contentRect.left) * (contentRect.bottom - contentRect.top));
  const visibleRect = {
    left: Math.max(0, contentRect.left),
    top: Math.max(0, contentRect.top),
    right: Math.min(photoW, contentRect.right),
    bottom: Math.min(photoH, contentRect.bottom),
  };
  const visibleArea = rectIntersectionArea(contentRect, visibleRect);
  const visibilityRatio = visibleArea / contentArea;

  const overlapPenalty = keepOutZones.reduce(
    (sum, zone) => sum + (rectIntersectionArea(contentRect, zone) / contentArea),
    0,
  );

  const contentCenterX = (contentRect.left + contentRect.right) / 2;
  const anchorRatio = contentCenterX / photoW;
  const anchorPenalty = Math.abs(anchorRatio - preferredAnchorRatio);

  const edgePenalty =
    Math.max(0, -contentRect.left) +
    Math.max(0, contentRect.right - photoW);
  const topPenalty = Math.max(0, -contentRect.top);

  return (
    (placement.drawH / photoH) * 4.8 +
    visibilityRatio * 3.5 -
    overlapPenalty * 22 -
    anchorPenalty * 1.25 -
    (edgePenalty / photoW) * 2 -
    (topPenalty / photoH) * 2
  );
}

function choosePlacement(photoW, photoH, personBitmap, bounds, targetContentH, face) {
  const preferredAnchorRatio = face
    ? 1 - ((face.x + (face.width / 2)) / photoW)
    : DEFAULT_ANCHOR_RATIO;
  const keepOutZones = buildFaceKeepOutZones(photoW, photoH, face);
  const candidates = buildTemplateCandidates(
    photoW,
    photoH,
    personBitmap,
    bounds,
    targetContentH,
    face,
  );

  let bestPlacement = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const score = scorePlacement({
      photoW,
      photoH,
      placement: candidate.placement,
      bounds,
      keepOutZones,
      preferredAnchorRatio,
    });
    if (score > bestScore) {
      bestScore = score;
      bestPlacement = candidate.placement;
    }
  }

  return bestPlacement ?? computePlacement(
    photoW,
    photoH,
    personBitmap,
    bounds,
    targetContentH,
    DEFAULT_ANCHOR_RATIO,
    0.2,
  );
}

async function detectReferenceFaceInPhoto(photoImg) {
  if (!isFaceDetectionEnabled()) return null;

  try {
    const { detectFaces } = await import('./face-detection.js');
    const faces = await detectFaces(photoImg);
    if (!faces.length) return null;

    return faces.reduce(
      (largest, face) => (face.height > largest.height ? face : largest),
      faces[0],
    );
  } catch {
    return null;
  }
}

// ── Augment ────────────────────────────────────────────────────────────────────

/**
 * Composite the person PNG onto the captured photo.
 *
 * @param {Blob} capturedBlob
 * @param {{ imageBlob: Blob|null, imageUrl: string|null }} person
 * @param {AbortSignal} signal
 * @returns {Promise<string>} JPEG data URL
 */
export async function augmentPhoto(capturedBlob, person, signal) {
  // Load person image from blob (user upload) or URL (bundled asset)
  let personImg;
  if (person.imageBlob) {
    personImg = await createImageBitmap(person.imageBlob);
  } else if (person.imageUrl) {
    const res = await fetch(person.imageUrl, { signal });
    if (!res.ok) throw new Error(`Failed to load person image: ${res.status}`);
    personImg = await createImageBitmap(await res.blob());
  } else {
    throw new Error('No person image available');
  }

  const photoImg = await createImageBitmap(capturedBlob);

  // Analyse person PNG to find where the actual content is
  const bounds = findContentBounds(personImg);
  const referenceFace = await detectReferenceFaceInPhoto(photoImg);
  const unclampedTargetContentH = referenceFace
    ? referenceFace.height * FACE_TO_BODY_RATIO
    : photoImg.height * DEFAULT_CONTENT_HEIGHT_RATIO;
  const targetContentH = Math.max(
    photoImg.height * MIN_CONTENT_HEIGHT_RATIO,
    Math.min(unclampedTargetContentH, photoImg.height * MAX_CONTENT_HEIGHT_RATIO),
  );
  const { drawX, drawY, drawW, drawH } = choosePlacement(
    photoImg.width,
    photoImg.height,
    personImg,
    bounds,
    targetContentH,
    referenceFace,
  );

  // Draw photo then composite person with a soft drop-shadow for depth
  const canvas = new OffscreenCanvas(photoImg.width, photoImg.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photoImg, 0, 0);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = Math.round(photoImg.width * 0.015);
  ctx.shadowOffsetX = Math.round(photoImg.width * 0.004);
  ctx.shadowOffsetY = Math.round(photoImg.height * 0.003);
  ctx.drawImage(personImg, drawX, drawY, drawW, drawH);
  ctx.restore();

  const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(jpegBlob);
  });
}
