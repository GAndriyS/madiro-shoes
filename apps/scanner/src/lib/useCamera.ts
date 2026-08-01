import { useCallback, useEffect, useRef, useState } from 'react';

import { computeCropRect, fitWithin, type CropBox } from './cropRect';

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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('pending');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  /**
   * Wires the stream into the <video> whenever both exist. Both orderings are
   * real: on first mount the stream wins the race (the element only renders
   * once status flips to 'streaming'), on a rescan the element is already
   * there. Attaching from one place is what fixes the black viewfinder — the
   * old code assigned srcObject before the element existed and never retried.
   * play() is explicit because iOS Safari in a standalone PWA does not
   * reliably honour `autoPlay` for a srcObject attached after mount.
   */
  const attach = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || video.srcObject === stream) return;
    video.srcObject = stream;
    void video.play?.().catch(() => {
      // AbortError when the element unmounts mid-play — the next mount re-attaches.
    });
  }, []);

  /** Callback ref: fires on mount, so the stream lands even if it arrived first. */
  const setVideoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      videoRef.current = video;
      attach();
    },
    [attach],
  );

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
        attach();
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
  }, [attach]);

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

  /**
   * Current frame as JPEG. With `crop` the frame is narrowed to the viewfinder
   * box: boxes are scanned in stacks, so a full frame hands the model several
   * labels at once and no way to know which one was aimed at.
   *
   * The canvas is sized to the *upload* size, not the source region, so the one
   * drawImage both crops and downscales. Encoding at sensor resolution meant a
   * ~250KB upload the server immediately shrank again; this keeps it under
   * ~60KB, and on a portrait phone that is the largest single latency win in
   * the pipeline — the crop alone never narrows the width, because the padded
   * box always exceeds the frame's 1080px.
   *
   * Falls back to the full frame whenever the crop cannot be computed.
   */
  const captureFrame = useCallback(async (crop?: CropBox): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const rect = video.getBoundingClientRect();
    const region = crop
      ? computeCropRect(video.videoWidth, video.videoHeight, rect.width, rect.height, crop)
      : null;

    const sx = region?.sx ?? 0;
    const sy = region?.sy ?? 0;
    const sw = region?.sw ?? video.videoWidth;
    const sh = region?.sh ?? video.videoHeight;
    const target = fitWithin(sw, sh);

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (context) {
      // Bilinear-ish smoothing matters here: nearest-neighbour downscaling of
      // thin handwritten strokes is exactly what makes a 3 read as an 8.
      context.imageSmoothingQuality = 'high';
      context.drawImage(video, sx, sy, sw, sh, 0, 0, target.width, target.height);
    }
    // q0.8 rather than 0.9: the server re-encodes at 80 regardless, so the
    // extra bytes never reach the model.
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  }, []);

  return { setVideoRef, status, torchSupported, torchOn, toggleTorch, captureFrame };
}
