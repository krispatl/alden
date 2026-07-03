/** Camera access: rear-facing full-screen video feed. */

export class CameraError extends Error {
  constructor(
    message: string,
    public readonly kind: 'denied' | 'unavailable' | 'insecure' | 'unknown'
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

/**
 * Requests the rear camera and attaches the stream to the given video element.
 * Resolves once the video has real dimensions and is playing.
 */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new CameraError(
      'Camera access needs a secure connection. Open this page over HTTPS (or localhost).',
      'insecure'
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('This browser cannot open a camera feed.', 'unavailable');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new CameraError(
        'Camera permission was denied. Allow camera access in your browser settings, then try again.',
        'denied'
      );
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new CameraError('No usable camera was found on this device.', 'unavailable');
    }
    throw new CameraError('The camera could not be started.', 'unknown');
  }

  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      video.removeEventListener('loadedmetadata', onReady);
      resolve();
    };
    video.addEventListener('loadedmetadata', onReady);
    setTimeout(() => reject(new CameraError('Camera feed timed out.', 'unknown')), 15000);
  });

  try {
    await video.play();
  } catch {
    /* autoplay w/ muted+playsinline should succeed; ignore benign rejections */
  }

  return stream;
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
