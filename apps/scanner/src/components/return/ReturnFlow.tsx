import {
  checkoutResultSchema,
  returnLookupResponseSchema,
  tagRecognitionSchema,
  type CheckoutResult,
  type PairLookupInput,
  type ReturnLookupResponse,
  type TagRecognition,
} from '@madiro/shared';
import { ApiError, api, money, outcomeUnknown } from '@madiro/web-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CameraScreen } from '../intake/CameraScreen';
import { RecognitionError } from '../intake/RecognitionError';
import type { ComboChoice } from '../sale/SaleConfirm';
import { failedWithUnknownOutcome, retryUnknownOutcome, useAttemptKey } from '../../lib/attempt';
import { useFlashStore } from '../../lib/flash';
import { ReturnConfirm } from './ReturnConfirm';

interface RegisterVariables {
  operationId: string;
  idempotencyKey: string;
}

/**
 * Customer return flow (FR-S-14): scan the tag → find the last sale of that
 * pair → confirm → the pair goes back to stock and the sale is netted out in
 * statistics. Camera and recognition are shared with the other flows.
 */
export function ReturnFlow() {
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
  const attempt = useAttemptKey();

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

  const register = useMutation({
    ...retryUnknownOutcome,
    mutationFn: async ({ operationId, idempotencyKey }: RegisterVariables) =>
      checkoutResultSchema.parse(
        await api.post<CheckoutResult>('/returns', { operationId }, { idempotencyKey }),
      ),
    onSuccess: (result) => {
      attempt.settle();
      void queryClient.invalidateQueries({ queryKey: ['me', 'summary'] });
      showFlash({
        title: t('return.registeredToast'),
        subtitle: `${result.style} · ${result.color} · р. ${result.size} — ${money(-(result.salePrice ?? 0))}`,
      });
      void navigate({ to: '/' });
    },
    onError: (err) => {
      // No answer: keep the sale on screen for the retry, which carries the
      // same key. Refetching here would be the bug itself — if the return did
      // land, the lookup now shows the next identical sale, and the retry
      // would reverse that one too.
      if (outcomeUnknown(err)) return;
      setToast(
        err instanceof ApiError && err.status === 409
          ? t('return.conflict')
          : t('return.saveError'),
      );
      void lookup.refetch();
      setTimeout(() => setToast(null), 3500);
    },
  });
  // While a return is in flight or got no answer, the lookup holds still: a
  // refetch on reconnect would swap the sale under the seller's retry.
  const attemptOpen = register.isPending || failedWithUnknownOutcome(register);

  // A different tag is a different attempt (see CheckoutFlow).
  useEffect(() => {
    register.reset();
  }, [fields.size, fields.color, fields.style, combo]);

  const lookup = useQuery({
    queryKey: ['returns', 'lookup', fields.size, fields.color, fields.style, combo ?? null],
    enabled: step === 'confirm' && fieldsValid && !attemptOpen,
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

  // Manual entry stays INSIDE the return flow (S-2.1): empty editable fields
  // above the same lookup — /manual is the checkout flow, and dropping a
  // return there was two taps away from selling the pair instead.
  const goManual = () => {
    recognize.reset();
    setFields({ size: '', color: '', style: '' });
    setCombo(undefined);
    setStep('confirm');
  };
  const rescan = () => {
    recognize.reset();
    setCombo(undefined);
    setStep('capture');
  };

  return (
    <>
      {toast && (
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+1rem)] z-30 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-page shadow-modal">
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
          lookupError={lookup.isError}
          onRetry={() => void lookup.refetch()}
          saving={register.isPending}
          outcomeUnknown={failedWithUnknownOutcome(register)}
          selectedCombo={combo}
          onComboSelect={setCombo}
          onConfirm={(operationId) =>
            register.mutate({ operationId, idempotencyKey: attempt.keyFor(operationId) })
          }
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
