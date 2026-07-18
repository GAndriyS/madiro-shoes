import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'pending' | 'streaming' | 'unavailable';

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

interface TorchConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
}

/**
 * Rear-camera stream for tag scanning. `unavailable` covers every no-camera
 * path (desktop, denied permission, insecure context) — the caller falls back
 * to a file input. Torch is Android-Chrome-only; `torchSupported` gates the UI.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('pending');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        const [track] = stream.getVideoTracks();
        const capabilities = track?.getCapabilities?.() as TorchCapabilities | undefined;
        setTorchSupported(capabilities?.torch === true);
        setStatus('streaming');
      } catch {
        if (!cancelled) {
          setStatus('unavailable');
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraintSet] });
      setTorchOn(next);
    } catch {
      // Torch flaked (e.g. camera claimed by another app) — keep the UI state.
    }
  }, [torchOn]);

  /** Full current frame as JPEG — the backend downscales, extra context helps the model. */
  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  }, []);

  return { videoRef, status, torchSupported, torchOn, toggleTorch, captureFrame };
}
