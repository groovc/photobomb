// Lazy-loaded face detection using TensorFlow.js BlazeFace.
// Falls back gracefully — callers always get an array (possibly empty).

let loadPromise = null;
let model = null;
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
  if (model) return model;
  if (permanentlyUnavailable) return null;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Load TF.js core then the BlazeFace model via UMD builds.
      const loadScript = (src, isReady) =>
        new Promise((resolve, reject) => {
          if (isReady()) return resolve();

          const existing = document.querySelector(`script[src="${src}"]`);
          if (existing) {
            if (existing.dataset.loaded === 'true' || isReady()) return resolve();
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
          }

          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });

      await loadScript(
        'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
        () => typeof window.tf !== 'undefined',
      );
      await loadScript(
        'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js',
        () => typeof window.blazeface !== 'undefined',
      );

      model = await window.blazeface.load();
      return model;
    } catch {
      permanentlyUnavailable = true;
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Detect faces in an ImageBitmap.
 * Returns an array of { x, y, width, height } in image pixels.
 * Returns [] if the library fails to load or no faces are found.
 *
 * @param {ImageBitmap} imageBitmap
 * @returns {Promise<Array<{x:number,y:number,width:number,height:number}>>}
 */
export async function detectFaces(imageBitmap) {
  const m = await load();
  if (!m) return [];

  try {
    // BlazeFace accepts a canvas-like image source.
    const canvas = createCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(imageBitmap, 0, 0);

    const predictions = await m.estimateFaces(canvas, false /* returnTensors */);
    return predictions.map((p) => {
      const [x1, y1] = p.topLeft;
      const [x2, y2] = p.bottomRight;
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    });
  } catch {
    return [];
  }
}
