// Lazy-loaded pose detection using MediaPipe Tasks Vision Pose Landmarker.
// Returns null on failure so callers can fall back to simpler heuristics.

const TASKS_VISION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let loadPromise = null;
let poseLandmarker = null;
let permanentlyUnavailable = false;

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function load() {
  if (poseLandmarker) return poseLandmarker;
  if (permanentlyUnavailable) return null;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const visionModule = await import(`${TASKS_VISION_CDN}/vision_bundle.mjs`);
      const vision = await visionModule.FilesetResolver.forVisionTasks(
        `${TASKS_VISION_CDN}/wasm`,
      );

      poseLandmarker = await visionModule.PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
        },
        runningMode: 'IMAGE',
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });

      return poseLandmarker;
    } catch {
      permanentlyUnavailable = true;
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

function toPixelRect(landmarks, width, height) {
  const visible = landmarks.filter((landmark) => (landmark.visibility ?? 1) >= 0.35);
  if (!visible.length) return null;

  const xs = visible.map((landmark) => landmark.x * width);
  const ys = visible.map((landmark) => landmark.y * height);

  return {
    left: Math.max(0, Math.min(...xs)),
    top: Math.max(0, Math.min(...ys)),
    right: Math.min(width, Math.max(...xs)),
    bottom: Math.min(height, Math.max(...ys)),
  };
}

function getVisibleLandmarks(landmarks, indices, minVisibility = 0.35) {
  return indices
    .map((index) => landmarks[index])
    .filter((landmark) => landmark && (landmark.visibility ?? 1) >= minVisibility);
}

function toHeadBox(landmarks, width, height) {
  const headLandmarks = getVisibleLandmarks(landmarks, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.3);
  if (!headLandmarks.length) return null;

  const shoulderLandmarks = getVisibleLandmarks(landmarks, [11, 12], 0.3);
  const headXs = headLandmarks.map((landmark) => landmark.x * width);
  const headYs = headLandmarks.map((landmark) => landmark.y * height);

  const rawLeft = Math.min(...headXs);
  const rawRight = Math.max(...headXs);
  const rawTop = Math.min(...headYs);
  const rawBottom = Math.max(...headYs);
  const rawWidth = Math.max(1, rawRight - rawLeft);
  const shoulderY = shoulderLandmarks.length
    ? Math.min(...shoulderLandmarks.map((landmark) => landmark.y * height))
    : null;
  const inferredBottom = shoulderY == null
    ? rawBottom + (rawWidth * 0.9)
    : Math.min(shoulderY, rawBottom + (rawWidth * 1.1));

  return {
    left: Math.max(0, rawLeft - (rawWidth * 0.35)),
    top: Math.max(0, rawTop - (rawWidth * 0.45)),
    right: Math.min(width, rawRight + (rawWidth * 0.35)),
    bottom: Math.min(height, inferredBottom),
  };
}

/**
 * Detect the most prominent pose in an image bitmap.
 *
 * @param {ImageBitmap} imageBitmap
 * @returns {Promise<null|{
 *   landmarks: Array<{x:number,y:number,z?:number,visibility?:number,presence?:number}>,
 *   bbox: {left:number,top:number,right:number,bottom:number},
 *   headBox: {left:number,top:number,right:number,bottom:number}|null,
 *   centerX: number,
 *   headHeight: number|null,
 *   bodyHeight: number,
 *   bodyWidth: number
 * }>}
 */
export async function detectPrimaryPose(imageBitmap) {
  const detector = await load();
  if (!detector) return null;

  try {
    const canvas = createCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imageBitmap, 0, 0);

    const result = detector.detect(canvas);
    const landmarks = result?.landmarks?.[0];
    if (!landmarks?.length) return null;

    const bbox = toPixelRect(landmarks, imageBitmap.width, imageBitmap.height);
    if (!bbox) return null;
    const headBox = toHeadBox(landmarks, imageBitmap.width, imageBitmap.height);

    return {
      landmarks,
      bbox,
      headBox,
      centerX: (bbox.left + bbox.right) / 2,
      headHeight: headBox ? Math.max(1, headBox.bottom - headBox.top) : null,
      bodyHeight: Math.max(1, bbox.bottom - bbox.top),
      bodyWidth: Math.max(1, bbox.right - bbox.left),
    };
  } catch {
    return null;
  }
}
