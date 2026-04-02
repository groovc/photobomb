import { initCamera, stopCamera, capturePhoto, getAvailableCameras } from './camera.js';
import { renderPicker, handleUpload } from './picker.js';
import { augmentPhoto, getApiKey, saveApiKey, KEY_STORAGE } from './api.js';

const state = {
  facingMode: 'environment',
  capturedBlob: null,
  selectedPerson: null,
  resultDataUrl: null,
  abortController: null,
};

// ── Screen management ──────────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// ── API key modal ──────────────────────────────────────────────────────────────

function showApiKeyModal({ error } = {}) {
  const modal = document.getElementById('modal-apikey');
  const input = document.getElementById('input-apikey');
  const errorEl = document.getElementById('apikey-error');

  input.value = getApiKey() ?? '';
  errorEl.textContent = error ?? '';
  errorEl.classList.toggle('hidden', !error);
  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function hideApiKeyModal() {
  document.getElementById('modal-apikey').classList.add('hidden');
}

// ── Camera screen ──────────────────────────────────────────────────────────────

async function startCamera() {
  showScreen('camera');
  hideCameraError();

  try {
    const videoEl = document.getElementById('viewfinder');
    await initCamera(videoEl, state.facingMode);
    const cameras = await getAvailableCameras();
    document.getElementById('btn-switch-camera').style.display =
      cameras.length > 1 ? 'flex' : 'none';
  } catch (err) {
    showCameraError(err);
  }
}

function showCameraError(err) {
  const msg =
    err?.name === 'NotAllowedError'
      ? 'Camera permission was denied. Tap below to try again.'
      : 'Camera is unavailable on this device or browser.';
  document.getElementById('camera-error-message').textContent = msg;
  document.getElementById('camera-error').classList.remove('hidden');
}

function hideCameraError() {
  document.getElementById('camera-error').classList.add('hidden');
}

// ── Generation ─────────────────────────────────────────────────────────────────

async function startGeneration() {
  showScreen('generating');
  document.getElementById('generation-error').classList.add('hidden');

  const abort = new AbortController();
  state.abortController = abort;
  const timer = setTimeout(() => abort.abort('timeout'), 5 * 60 * 1000);

  try {
    const dataUrl = await augmentPhoto(state.capturedBlob, state.selectedPerson, abort.signal);
    clearTimeout(timer);
    state.resultDataUrl = dataUrl;
    document.getElementById('result-image').src = dataUrl;
    showScreen('result');
  } catch (err) {
    clearTimeout(timer);

    if (err.message === 'INVALID_API_KEY') {
      showApiKeyModal({ error: 'API key rejected by OpenAI. Please check and re-enter it.' });
      return;
    }
    if (abort.signal.aborted && err.name === 'AbortError') return; // user cancelled

    document.getElementById('generation-error').classList.remove('hidden');
  }
}

// ── Event wiring ───────────────────────────────────────────────────────────────

function setupListeners() {
  // API key modal: save
  document.getElementById('btn-save-apikey').addEventListener('click', () => {
    const key = document.getElementById('input-apikey').value.trim();
    if (!key) {
      document.getElementById('apikey-error').textContent = 'Please enter your API key.';
      document.getElementById('apikey-error').classList.remove('hidden');
      return;
    }
    saveApiKey(key);
    hideApiKeyModal();
  });

  document.getElementById('input-apikey').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-save-apikey').click();
  });

  // Settings button (camera screen)
  document.getElementById('btn-settings').addEventListener('click', () => showApiKeyModal());

  // Camera: capture
  document.getElementById('btn-capture').addEventListener('click', async () => {
    const videoEl = document.getElementById('viewfinder');
    const canvasEl = document.getElementById('capture-canvas');
    try {
      state.capturedBlob = await capturePhoto(videoEl, canvasEl);
      await stopCamera();
      document.getElementById('review-image').src = URL.createObjectURL(state.capturedBlob);
      showScreen('review');
    } catch (err) {
      console.error('Capture failed', err);
    }
  });

  // Camera: switch
  document.getElementById('btn-switch-camera').addEventListener('click', async () => {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    await startCamera();
  });

  // Camera: retry after permission error
  document.getElementById('btn-retry-camera').addEventListener('click', () => startCamera());

  // Review: retake
  document.getElementById('btn-retake').addEventListener('click', async () => {
    state.capturedBlob = null;
    await startCamera();
  });

  // Review: continue → picker
  document.getElementById('btn-continue').addEventListener('click', async () => {
    showScreen('picker');
    state.selectedPerson = null;
    await renderPicker(document.getElementById('people-grid'), (person) => {
      state.selectedPerson = person;
      startGeneration();
    });
  });

  // Picker: back
  document.getElementById('btn-picker-back').addEventListener('click', () => {
    document.getElementById('review-image').src = URL.createObjectURL(state.capturedBlob);
    showScreen('review');
  });

  // Picker: upload
  document.getElementById('btn-upload-person').addEventListener('click', () => {
    document.getElementById('person-file-input').click();
  });

  document.getElementById('person-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await handleUpload(file, document.getElementById('people-grid'), (person) => {
      state.selectedPerson = person;
      startGeneration();
    });
  });

  // Generating: cancel
  document.getElementById('btn-cancel-generation').addEventListener('click', () => {
    state.abortController?.abort();
    startCamera();
  });

  // Generating: error → start over
  document.getElementById('btn-generation-start-over').addEventListener('click', () => {
    reset();
    startCamera();
  });

  // Result: save
  document.getElementById('btn-save').addEventListener('click', () => {
    if (!state.resultDataUrl) return;
    const a = document.createElement('a');
    a.href = state.resultDataUrl;
    a.download = `photobomb-${Date.now()}.jpg`;
    a.click();
  });

  // Result: start over
  document.getElementById('btn-start-over').addEventListener('click', () => {
    reset();
    startCamera();
  });
}

function reset() {
  state.capturedBlob = null;
  state.selectedPerson = null;
  state.resultDataUrl = null;
  state.abortController = null;
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  setupListeners();

  // Restart the camera when the device rotates so the stream aspect ratio
  // matches the new viewport (avoids over-cropped / zoomed-in viewfinder).
  const onOrientationChange = () => {
    if (!document.getElementById('screen-camera').classList.contains('hidden')) {
      startCamera();
    }
  };
  if (screen.orientation) {
    screen.orientation.addEventListener('change', onOrientationChange);
  } else {
    window.addEventListener('orientationchange', onOrientationChange);
  }

  await startCamera();
}

init();
