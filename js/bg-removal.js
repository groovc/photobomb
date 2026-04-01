// Best-effort background removal using @imgly/background-removal (WASM, runs in browser).
// Falls through gracefully if the library fails to load or processing errors.

let removeBackground = null;

async function loadLibrary() {
  if (removeBackground) return removeBackground;
  try {
    const mod = await import(
      'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.1/+esm'
    );
    removeBackground = mod.default ?? mod.removeBackground;
    return removeBackground;
  } catch {
    return null;
  }
}

/**
 * Attempt background removal on an image blob.
 * Returns a PNG Blob with background removed, or throws if it fails.
 *
 * @param {Blob} imageBlob
 * @returns {Promise<Blob>}
 */
export async function removeBg(imageBlob) {
  const fn = await loadLibrary();
  if (!fn) throw new Error('Background removal library unavailable');

  const result = await fn(imageBlob, {
    output: { format: 'image/png', quality: 1 },
    // Suppress verbose logs from the library
    debug: false,
  });

  if (!result) throw new Error('Background removal returned no result');
  return result;
}
