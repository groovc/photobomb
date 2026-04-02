let activeStream = null;

export async function initCamera(videoEl, facingMode = 'environment') {
  await stopCamera();

  const constraints = {
    video: {
      facingMode,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  activeStream = stream;
  videoEl.srcObject = stream;

  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = resolve;
    videoEl.onerror = reject;
  });
  await videoEl.play();

  return stream;
}

export async function stopCamera() {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
}

export async function capturePhoto(videoEl, canvasEl) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;

  // On some mobile browsers (notably iOS Safari) the camera always returns
  // landscape-oriented pixels regardless of how the device is held. Detect
  // this by comparing the video's aspect ratio with the screen orientation
  // and rotate the canvas capture to match what the user actually sees.
  //
  // Use orientation type rather than angle: angle=0 means the device's
  // *natural* orientation, which is landscape on desktop monitors and portrait
  // on phones — so angle alone can't distinguish the two cases.
  const orientationType = screen.orientation?.type ?? '';
  const screenPortrait = orientationType.startsWith('portrait') ||
    (!orientationType && window.innerHeight >= window.innerWidth);
  const videoPortrait = vh >= vw;

  const ctx = canvasEl.getContext('2d');

  if (screenPortrait !== videoPortrait) {
    // Mismatch: rotate the capture so the image aligns with screen orientation.
    // Swap canvas dimensions (portrait ↔ landscape) and apply a ±90° rotation.
    canvasEl.width = vh;
    canvasEl.height = vw;
    ctx.save();
    ctx.translate(vh / 2, vw / 2);
    const screenAngle = ((screen.orientation?.angle ?? (typeof window.orientation === 'number' ? window.orientation : 0)) + 360) % 360;
    const rotDeg = (screenAngle === 0 || screenAngle === 270) ? -90 : 90;
    ctx.rotate(rotDeg * Math.PI / 180);
    ctx.drawImage(videoEl, -vw / 2, -vh / 2);
    ctx.restore();
  } else {
    canvasEl.width = vw;
    canvasEl.height = vh;
    ctx.drawImage(videoEl, 0, 0);
  }

  return new Promise((resolve, reject) => {
    canvasEl.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Capture failed'))),
      'image/jpeg',
      0.95,
    );
  });
}

export async function getAvailableCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}
