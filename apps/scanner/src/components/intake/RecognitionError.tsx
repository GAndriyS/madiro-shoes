import { AlertIcon } from '@madiro/web-core';
import { useTranslation } from 'react-i18next';

interface RecognitionErrorProps {
  onRetry: () => void;
  onManual: () => void;
}

/** Bottom sheet over the dark camera backdrop (design 2b): recognition failed. */
export function RecognitionError({ onRetry, onManual }: RecognitionErrorProps) {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-1 flex-col bg-[#1b1712]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,#3a2f1e_0%,#201a12_70%)]" />
      <div className="relative mt-auto flex flex-col gap-3.5 rounded-t-3xl bg-page px-5 pt-[22px] pb-9">
        <div className="flex items-center gap-2.5">
          <AlertIcon size={22} className="text-danger" strokeWidth={2} />
          <span className="text-[15px] font-bold text-[#7c4530]">{t('intake.errorTitle')}</span>
        </div>
        <div className="text-[13px] leading-normal text-text-secondary">
          {t('intake.errorBody')}
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-[14px] bg-ink p-4 text-center text-[15px] font-bold text-page"
          >
            {t('intake.errorRetry')}
          </button>
          <button
            type="button"
            onClick={onManual}
            className="text-center text-[13px] font-semibold text-text-secondary"
          >
            {t('intake.errorManual')}
          </button>
        </div>
      </div>
    </div>
  );
}
