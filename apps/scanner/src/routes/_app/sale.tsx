import {
  checkoutResultSchema,
  saleLookupResponseSchema,
  tagRecognitionSchema,
  type CheckoutResult,
  type PairLookupInput,
  type SaleLookupResponse,
  type TagRecognition,
} from '@madiro/shared';
import { ApiError, api, money } from '@madiro/web-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CameraScreen } from '../../components/intake/CameraScreen';
import { RecognitionError } from '../../components/intake/RecognitionError';
import { SaleConfirm, type ComboChoice } from '../../components/sale/SaleConfirm';
import { SaleDetails, type CheckoutPayload } from '../../components/sale/SaleDetails';
import { useFlashStore } from '../../lib/flash';

export const Route = createFileRoute('/_app/sale')({
  component: SalePage,
});

/**
 * Scan-to-sell flow (design 2a/2b): camera → recognition → confirm against
 * stock (narrowing + FIFO pair) → checkout details (sale or write-off) →
 * home with a success toast. The camera/recognition steps are shared with
 * intake; the confirm step adds live stock lookup.
 */
function SalePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showFlash = useFlashStore((s) => s.show);
  const [step, setStep] = useState<'capture' | 'error' | 'confirm' | 'details'>('capture');
  const [fields, setFields] = useState({ size: '', color: '', style: '' });
  const [combo, setCombo] = useState<ComboChoice | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const photoUrlRef = useRef<string | null>(null);

  // The captured tag photo backs the «ФОТО БІРКИ» banner; free it on unmount.
  useEffect(
    () => () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    },
    [],
  );

  const recognize = useMutation({
    mutationFn: async (photo: Blob) => {
      const fd = new FormData();
      fd.set('photo', photo, 'label.jpg');
      const result = tagRecognitionSchema.parse(
        await api.postForm<TagRecognition>('/tags/recognize', fd, { timeoutMs: 45_000 }),
      );
      return { result, photo };
    },
    onSuccess: ({ result, photo }) => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = URL.createObjectURL(photo);
      setPhotoUrl(photoUrlRef.current);
      setFields({ size: String(result.size), color: result.color, style: result.style });
      setCombo(undefined);
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
    queryKey: ['sale', 'lookup', fields.size, fields.color, fields.style, combo ?? null],
    enabled: (step === 'confirm' || step === 'details') && fieldsValid,
    queryFn: async () => {
      const body: PairLookupInput = {
        size: sizeNum,
        color: fields.color,
        style: fields.style,
        ...(combo ? { material: combo.material, season: combo.season } : {}),
      };
      return saleLookupResponseSchema.parse(
        await api.post<SaleLookupResponse>('/sale/lookup', body),
      );
    },
  });

  const checkout = useMutation({
    mutationFn: async (payload: CheckoutPayload) => {
      const pairId = lookup.data?.pair?.pairId;
      if (!pairId) throw new Error('no pair');
      if (payload.kind === 'sale') {
        return checkoutResultSchema.parse(
          await api.post<CheckoutResult>('/sale', {
            pairId,
            salePrice: payload.salePrice,
            paymentMethod: payload.paymentMethod,
          }),
        );
      }
      return checkoutResultSchema.parse(
        await api.post<CheckoutResult>('/sale/writeoff', {
          pairId,
          ...(payload.comment ? { comment: payload.comment } : {}),
        }),
      );
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'summary'] });
      const sold = result.status === 'SOLD';
      const paymentWord =
        result.paymentMethod === 'CARD'
          ? t('sale.paymentCard').toLowerCase()
          : t('sale.paymentCash').toLowerCase();
      showFlash({
        title: sold ? t('sale.soldToast') : t('sale.writtenOffToast'),
        subtitle: sold
          ? `${result.style} · ${result.color} · р. ${result.size} — ${money(result.salePrice ?? 0)} · ${paymentWord}`
          : `${result.style} · ${result.color} · р. ${result.size}`,
      });
      void navigate({ to: '/' });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        // Someone checked this pair out first — back to confirm with fresh stock.
        setToast(t('sale.conflict'));
        setStep('confirm');
        void lookup.refetch();
      } else {
        setToast(t('sale.saveError'));
      }
      setTimeout(() => setToast(null), 3500);
    },
  });

  const goManual = () => void navigate({ to: '/manual' });
  const rescan = () => {
    recognize.reset();
    setCombo(undefined);
    setStep('capture');
  };
  const onFieldChange = (field: 'size' | 'color' | 'style', value: string) => {
    setFields((f) => ({ ...f, [field]: value }));
    setCombo(undefined);
  };

  return (
    <>
      {toast && (
        <div className="fixed inset-x-0 top-4 z-30 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-page shadow-modal">
          {toast}
        </div>
      )}
      {step === 'details' && lookup.data?.pair ? (
        <SaleDetails
          pair={lookup.data.pair}
          salePriceHint={lookup.data.salePriceHint}
          saving={checkout.isPending}
          onConfirm={(payload) => checkout.mutate(payload)}
          onBack={() => setStep('confirm')}
        />
      ) : step === 'confirm' || step === 'details' ? (
        <SaleConfirm
          photoUrl={photoUrl}
          size={fields.size}
          color={fields.color}
          style={fields.style}
          onFieldChange={onFieldChange}
          lookup={lookup.data}
          loading={lookup.isFetching}
          selectedCombo={combo}
          onComboSelect={setCombo}
          onSizeSelect={(s) => setFields((f) => ({ ...f, size: String(s) }))}
          onNext={() => setStep('details')}
          onRescan={rescan}
          onManualSearch={() => void navigate({ to: '/search' })}
          onBack={() => void navigate({ to: '/' })}
        />
      ) : step === 'error' ? (
        <RecognitionError onRetry={rescan} onManual={goManual} />
      ) : (
        <CameraScreen
          title={t('sale.title')}
          processing={recognize.isPending}
          onCapture={(photo) => recognize.mutate(photo)}
          onManual={goManual}
        />
      )}
    </>
  );
}
