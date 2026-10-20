import {
  checkoutResultSchema,
  saleLookupResponseSchema,
  tagRecognitionSchema,
  type CheckoutResult,
  type PairLookupInput,
  type SaleLookupResponse,
  type TagRecognition,
} from '@madiro/shared';
import { ApiError, api, money, outcomeUnknown } from '@madiro/web-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CameraScreen } from '../intake/CameraScreen';
import { RecognitionError } from '../intake/RecognitionError';
import { failedWithUnknownOutcome, retryUnknownOutcome, useAttemptKey } from '../../lib/attempt';
import { useFlashStore } from '../../lib/flash';
import { SaleConfirm, type ComboChoice } from './SaleConfirm';
import { SaleDetails, type CheckoutPayload } from './SaleDetails';

interface CheckoutFlowProps {
  /** Manual entry (FR-S-15): skip the camera, start from empty editable fields. */
  manual?: boolean;
}

/**
 * Scan-to-sell / manual checkout flow (design 2a/2b, FR-S-06..08, FR-S-15):
 * camera → recognition (scan mode) or empty fields (manual mode) → confirm
 * against stock → checkout details (sale or write-off) → home with a toast.
 */
export function CheckoutFlow({ manual = false }: CheckoutFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showFlash = useFlashStore((s) => s.show);
  const [step, setStep] = useState<'capture' | 'error' | 'confirm' | 'details'>(
    manual ? 'confirm' : 'capture',
  );
  const [fields, setFields] = useState({ size: '', color: '', style: '' });
  const [combo, setCombo] = useState<ComboChoice | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const photoUrlRef = useRef<string | null>(null);
  const attempt = useAttemptKey();

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

  const checkout = useMutation({
    ...retryUnknownOutcome,
    // The pair travels with the attempt rather than being read from the lookup
    // at send time: the automatic retry must check out the pair the seller
    // confirmed, whatever the lookup has refetched since.
    mutationFn: async ({
      pairId,
      payload,
      idempotencyKey,
    }: {
      pairId: string;
      payload: CheckoutPayload;
      idempotencyKey: string;
    }) => {
      if (payload.kind === 'sale') {
        return checkoutResultSchema.parse(
          await api.post<CheckoutResult>(
            '/sale',
            { pairId, salePrice: payload.salePrice, paymentMethod: payload.paymentMethod },
            { idempotencyKey },
          ),
        );
      }
      return checkoutResultSchema.parse(
        await api.post<CheckoutResult>(
          '/sale/writeoff',
          { pairId, ...(payload.comment ? { comment: payload.comment } : {}) },
          { idempotencyKey },
        ),
      );
    },
    onSuccess: (result) => {
      attempt.settle();
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
      // No answer: the details screen says the sale may have gone through and
      // keeps everything as it was for the retry — not «не вдалося зберегти».
      if (outcomeUnknown(err)) return;
      if (err instanceof ApiError && err.status === 422) {
        // The earlier tap did go through, with other details (the price was
        // edited, or sale became write-off). Nothing left to do on this pair.
        attempt.settle();
        void queryClient.invalidateQueries({ queryKey: ['me', 'summary'] });
        showFlash({ title: t('sale.alreadySavedTitle'), subtitle: t('sale.alreadySavedBody') });
        void navigate({ to: '/' });
        return;
      }
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
  // While a checkout is in flight or got no answer, the lookup holds still. A
  // refetch on reconnect would otherwise swap in the next identical pair if the
  // first sale did land — and the seller's retry would sell that one too.
  const attemptOpen = checkout.isPending || failedWithUnknownOutcome(checkout);

  // A different tag is a different attempt: the unknown outcome was about the
  // pair on screen, and the new fields need a live lookup. Rescanning the same
  // tag changes nothing here, so it lands back on the same pair and key.
  useEffect(() => {
    checkout.reset();
  }, [fields.size, fields.color, fields.style, combo]);

  const lookup = useQuery({
    queryKey: ['sale', 'lookup', fields.size, fields.color, fields.style, combo ?? null],
    enabled: (step === 'confirm' || step === 'details') && fieldsValid && !attemptOpen,
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

  const foundPair = lookup.data?.pair ?? null;

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
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+1rem)] z-30 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-page shadow-modal">
          {toast}
        </div>
      )}
      {step === 'details' && foundPair ? (
        <SaleDetails
          pair={foundPair}
          salePriceHint={lookup.data?.salePriceHint ?? null}
          saving={checkout.isPending}
          outcomeUnknown={failedWithUnknownOutcome(checkout)}
          onConfirm={(payload) =>
            checkout.mutate({
              pairId: foundPair.pairId,
              payload,
              idempotencyKey: attempt.keyFor(foundPair.pairId),
            })
          }
          onBack={() => setStep('confirm')}
        />
      ) : step === 'confirm' || step === 'details' ? (
        <SaleConfirm
          title={manual ? t('manual.title') : undefined}
          photoUrl={photoUrl}
          size={fields.size}
          color={fields.color}
          style={fields.style}
          onFieldChange={onFieldChange}
          lookup={lookup.data}
          loading={lookup.isFetching}
          lookupError={lookup.isError}
          onRetry={() => void lookup.refetch()}
          selectedCombo={combo}
          onComboSelect={setCombo}
          onSizeSelect={(s) => setFields((f) => ({ ...f, size: String(s) }))}
          onNext={() => setStep('details')}
          onRescan={manual ? undefined : rescan}
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
