import { BoltIcon, CameraIcon, ChevronRightIcon, cn } from '@madiro/web-core';
import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { normalizePhoto } from '../../lib/normalizePhoto';
import { useCamera } from '../../lib/useCamera';

interface CameraScreenProps {
  /** Header title — the flow name («Поступлення» / «Продаж / вихід»). */
  title?: string;
  processing: boolean;
  onCapture: (photo: Blob) => void;
  onManual: () => void;
}

/**
 * Dark camera screen (design 3a): live viewfinder with gold corner brackets,
 * torch (where supported), 72px shutter, manual-entry escape hatch. When the
 * camera is unavailable (desktop, denied) a file-input card takes its place.
 */
export function CameraScreen({ title, processing, onCapture, onManual }: CameraScreenProps) {
  const { t } = useTranslation();
  const { videoRef, status, torchSupported, torchOn, toggleTorch, captureFrame } = useCamera();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shoot = async () => {
    const frame = await captureFrame();
    if (frame) onCapture(frame);
  };

  const pickFile = async (file: File | null) => {
    if (!file) return;
    onCapture(await normalizePhoto(file));
  };

  return (
    <div className="relative flex flex-1 flex-col bg-[#1b1712]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,#3a2f1e_0%,#201a12_70%)]" />

      <div className="relative flex items-center gap-2 px-5 pt-4 pb-3.5">
        <Link
          to="/"
          aria-label={t('common.back')}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(255,255,255,.1)] text-[#e8dfd0]"
        >
          <ChevronRightIcon size={16} className="rotate-180" />
        </Link>
        <span className="text-sm font-bold text-[#e8dfd0]">{title ?? t('intake.title')}</span>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        {status === 'unavailable' ? (
          <div className="mx-6 flex flex-col items-center gap-4 rounded-2xl bg-[rgba(255,255,255,.06)] px-6 py-8 text-center">
            <CameraIcon size={32} className="text-[#e8dfd0]" />
            <div className="text-[15px] font-bold text-[#e8dfd0]">
              {t('intake.cameraUnavailableTitle')}
            </div>
            <div className="text-[12.5px] leading-relaxed text-[rgba(232,223,208,.75)]">
              {t('intake.cameraUnavailableBody')}
            </div>
            <label className="cursor-pointer rounded-[14px] bg-queue-badge px-6 py-3.5 text-[15px] font-bold text-ink">
              {t('intake.choosePhoto')}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={processing}
                onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="relative h-[190px] w-[300px]">
              <div className="absolute top-0 left-0 h-7 w-7 rounded-tl-md border-t-[2.5px] border-l-[2.5px] border-queue-badge" />
              <div className="absolute top-0 right-0 h-7 w-7 rounded-tr-md border-t-[2.5px] border-r-[2.5px] border-queue-badge" />
              <div className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-md border-b-[2.5px] border-l-[2.5px] border-queue-badge" />
              <div className="absolute right-0 bottom-0 h-7 w-7 rounded-br-md border-r-[2.5px] border-b-[2.5px] border-queue-badge" />
            </div>
            <div className="absolute bottom-[18px] rounded-[18px] bg-[rgba(0,0,0,.35)] px-3.5 py-[7px] text-[12.5px] text-[rgba(232,223,208,.75)]">
              {t('intake.aimHint')}
            </div>
          </>
        )}
      </div>

      <div className="relative flex items-center justify-center gap-[38px] px-5 pt-3.5 pb-8">
        {status === 'streaming' && torchSupported ? (
          <button
            type="button"
            aria-label={t('intake.torch')}
            aria-pressed={torchOn}
            onClick={() => void toggleTorch()}
            className={cn(
              'flex h-[34px] w-[34px] items-center justify-center rounded-full',
              torchOn ? 'bg-queue-badge text-ink' : 'bg-[rgba(255,255,255,.1)] text-[#e8dfd0]',
            )}
          >
            <BoltIcon size={16} />
          </button>
        ) : (
          <span className="h-[34px] w-[34px]" />
        )}

        <button
          type="button"
          aria-label={t('intake.shutter')}
          disabled={processing || status !== 'streaming'}
          onClick={() => void shoot()}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3.5px] border-[#e8dfd0] disabled:opacity-40"
        >
          <span className="h-[58px] w-[58px] rounded-full bg-queue-badge" />
        </button>

        <button
          type="button"
          onClick={onManual}
          className="w-[60px] text-center text-[11.5px] leading-snug text-[rgba(232,223,208,.6)]"
        >
          {t('intake.manual')}
        </button>
      </div>

      {processing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[rgba(27,23,18,.72)]">
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-queue-badge border-t-transparent" />
          <span className="text-[13.5px] font-semibold text-[#e8dfd0]">
            {t('intake.processing')}
          </span>
        </div>
      )}
    </div>
  );
}
