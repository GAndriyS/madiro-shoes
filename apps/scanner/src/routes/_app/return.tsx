import {
  checkoutResultSchema,
  returnLookupResponseSchema,
  tagRecognitionSchema,
  type CheckoutResult,
  type PairLookupInput,
  type ReturnLookupResponse,
  type TagRecognition,
} from '@madiro/shared';
import { ApiError, api, money } from '@madiro/web-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CameraScreen } from '../../components/intake/CameraScreen';
import { RecognitionError } from '../../components/intake/RecognitionError';
import { ReturnConfirm } from '../../components/return/ReturnConfirm';
import type { ComboChoice } from '../../components/sale/SaleConfirm';
import { useFlashStore } from '../../lib/flash';

export const Route = createFileRoute('/_app/return')({
  component: ReturnPage,
});

/**
 * Customer return flow (FR-S-14): scan the tag → find the last sale of that
 * pair → confirm → the pair goes back to stock and the sale is netted out in
 * statistics. Camera and recognition are shared with the other flows.
 */
function ReturnPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showFlash = useFlashStore((s) => s.show);
  const [step, setStep] = useState<'capture' | 'error' | 'confirm'>('capture');
  const [fields, setFields] = useState({ size: '', color: '', style: '' });
  // Narrowing to a material/insulation combination when the tag alone matches
  // several sold variants (rule 3.3 #5) — the same choice as on checkout.
  const [combo, setCombo] = useState<ComboChoice | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const recognize = useMutation({
    mutationFn: async (photo: Blob) => {
      const fd = new FormData();
      fd.set('photo', photo, 'label.jpg');
      return tagRecognitionSchema.parse(
        await api.postForm<TagRecognition>('/tags/recognize', fd, { timeoutMs: 45_000 }),
      );
    },
    onSuccess: (result) => {
      setFields({ size: String(result.size), color: result.color, style: result.style });
      setStep('confirm');
    },
    onError: () => setStep('error'),
  });

  const sizeNum = Number(fields.size);
  const fieldsValid =
    Number.isInteger(sizeNum) &&
    sizeNum >= 16 &&
    sizeNum <= 50 &&
    fields.color.length > 0 &&
    fields.style.length > 0;

  const lookup = useQuery({
    queryKey: ['returns', 'lookup', fields.size, fields.color, fields.style, combo ?? null],
    enabled: step === 'confirm' && fieldsValid,
    queryFn: async () => {
      const body: PairLookupInput = {
        size: sizeNum,
        color: fields.color,
        style: fields.style,
        ...(combo ? { material: combo.material, season: combo.season } : {}),
      };
      return returnLookupResponseSchema.parse(
        await api.post<ReturnLookupResponse>('/returns/lookup', body),
      );
    },
  });

  const register = useMutation({
    mutationFn: async (operationId: string) =>
      checkoutResultSchema.parse(await api.post<CheckoutResult>('/returns', { operationId })),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'summary'] });
      showFlash({
        title: t('return.registeredToast'),
        subtitle: `${result.style} · ${result.color} · р. ${result.size} — ${money(-(result.salePrice ?? 0))}`,
      });
      void navigate({ to: '/' });
    },
    onError: (err) => {
      setToast(
        err instanceof ApiError && err.status === 409
          ? t('return.conflict')
          : t('return.saveError'),
      );
      void lookup.refetch();
      setTimeout(() => setToast(null), 3500);
    },
  });

  const goManual = () => void navigate({ to: '/manual' });
  const rescan = () => {
    recognize.reset();
    setStep('capture');
  };

  return (
    <>
      {toast && (
        <div className="fixed inset-x-0 top-4 z-30 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-page shadow-modal">
          {toast}
        </div>
      )}
      {step === 'confirm' ? (
        <ReturnConfirm
          size={fields.size}
          color={fields.color}
          style={fields.style}
          onFieldChange={(field, value) => {
            // Editing the tag invalidates a narrowing made for the old fields.
            setCombo(undefined);
            setFields((f) => ({ ...f, [field]: value }));
          }}
          lookup={lookup.data}
          loading={lookup.isFetching}
          saving={register.isPending}
          selectedCombo={combo}
          onComboSelect={setCombo}
          onConfirm={(operationId) => register.mutate(operationId)}
          onRescan={rescan}
          onBack={() => void navigate({ to: '/' })}
        />
      ) : step === 'error' ? (
        <RecognitionError onRetry={rescan} onManual={goManual} />
      ) : (
        <CameraScreen
          title={t('return.title')}
          processing={recognize.isPending}
          onCapture={(photo) => recognize.mutate(photo)}
          onManual={goManual}
        />
      )}
    </>
  );
}
