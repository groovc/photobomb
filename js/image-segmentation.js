// Lazy-loaded subject segmentation using MediaPipe Tasks Vision Image Segmenter.
// Returns null on failure so callers can fall back to pose-only placement.
//
// DeepLabV3 uses Pascal VOC class labels: 0 = background, 15 = person.
const PERSON_CLASS = 15;

const TASKS_VISION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22';
const SEGMENTATION_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-assets/deeplabv3.tflite?generation=1661875711618421';

let loadPromise = null;
let imageSegmenter = null;
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
  if (imageSegmenter) return imageSegmenter;
  if (permanentlyUnavailable) return null;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const visionModule = await import(`${TASKS_VISION_CDN}/vision_bundle.mjs`);
      const vision = await visionModule.FilesetResolver.forVisionTasks(
        `${TASKS_VISION_CDN}/wasm`,
      );

      imageSegmenter = await visionModule.ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: SEGMENTATION_MODEL_URL,
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });

      return imageSegmenter;
    } catch {
      permanentlyUnavailable = true;
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

function buildDensityGrid(mask, width, height, cols = 12, rows = 10) {
  const grid = [];
  const cellW = width / cols;
  const cellH = height / rows;

  for (let row = 0; row < rows; row += 1) {
    const y0 = Math.floor(row * cellH);
    const y1 = Math.min(height, Math.floor((row + 1) * cellH));

    for (let col = 0; col < cols; col += 1) {
      const x0 = Math.floor(col * cellW);
      const x1 = Math.min(width, Math.floor((col + 1) * cellW));

      let foreground = 0;
      let total = 0;

      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          total += 1;
          if (mask[(y * width) + x] === PERSON_CLASS) foreground += 1;
        }
      }

      grid.push({
        left: x0,
        top: y0,
        right: x1,
        bottom: y1,
        density: total ? foreground / total : 0,
      });
    }
  }

  return grid;
}

/**
 * Segment foreground regions in an image bitmap.
 *
 * @param {ImageBitmap} imageBitmap
 * @returns {Promise<null|{
 *   width:number,
 *   height:number,
 *   mask: Uint8Array,
 *   grid: Array<{left:number,top:number,right:number,bottom:number,density:number}>
 * }>}
 */
export async function segmentForeground(imageBitmap) {
  const segmenter = await load();
  if (!segmenter) return null;

  try {
    const canvas = createCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imageBitmap, 0, 0);

    let result = null;
    segmenter.segment(canvas, (segmentationResult) => {
      result = segmentationResult;
    });

    const categoryMask = result?.categoryMask;
    const mask = categoryMask?.getAsUint8Array?.();
    const width = categoryMask?.width;
    const height = categoryMask?.height;
    categoryMask?.close(); // free WASM heap allocation
    if (!mask || !width || !height) return null;

    return {
      width,
      height,
      mask,
      grid: buildDensityGrid(mask, width, height),
    };
  } catch {
    return null;
  }
}
