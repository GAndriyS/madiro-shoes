import {
  intakeResultSchema,
  tagRecognitionSchema,
  type IntakeInput,
  type TagRecognition,
} from '@madiro/shared';
import { api } from '@madiro/web-core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CameraScreen } from './CameraScreen';
import { ConfirmForm, type SaveMode } from './ConfirmForm';
import { RecognitionError } from './RecognitionError';

interface IntakeFlowProps {
  /**
   * Manual entry (S-1.2): open on the empty form instead of the camera, the way
   * /manual does it for checkout. It is the same form the recognition path
   * confirms into — big style/colour fields and a size grid — because a person
   * typing a delivery in is receiving the same run of sizes as a person
   * photographing its label.
   */
  manual?: boolean;
}

/**
 * Intake flow: camera (or file fallback) → vision recognition → prefilled
 * confirmation that persists the pair (PR 2). Batch mode ("scan next") loops
 * back to the camera; "save and finish" returns home. Recognition results are
 * ephemeral component state, so there is no deep-linkable confirm route.
 */
export function IntakeFlow({ manual = false }: IntakeFlowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'capture' | 'error' | 'confirm'>(manual ? 'confirm' : 'capture');
  const [recognition, setRecognition] = useState<TagRecognition | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Manual entry never leaves the form, so a saved batch cannot be cleared by
  // unmounting the way the camera path clears it. Remount it by key instead.
  const [formKey, setFormKey] = useState(0);

  // Every toast self-dismisses; a new one restarts the clock (S-9).
  const showToast = (message: string, ms: number) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const recognize = useMutation({
    mutationFn: async (photo: Blob) => {
      const fd = new FormData();
      fd.set('photo', photo, 'label.jpg');
      // The backend waits for the vision provider for up to 25s — give the
      // request a budget safely above that instead of the default 15s.
      return tagRecognitionSchema.parse(
        await api.postForm<TagRecognition>('/tags/recognize', fd, { timeoutMs: 45_000 }),
      );
    },
    onSuccess: (result) => {
      setRecognition(result);
      setStep('confirm');
    },
    onError: () => setStep('error'),
  });

  const save = useMutation({
    mutationFn: async ({ input }: { input: IntakeInput; mode: SaveMode }) =>
      intakeResultSchema.parse(await api.post('/intake', input)),
    onSuccess: (result, { mode }) => {
      // The home summary counts drafts in the queue — keep it fresh.
      void queryClient.invalidateQueries({ queryKey: ['me', 'summary'] });
      if (mode === 'finish') {
        void navigate({ to: '/' });
        return;
      }
      // Batch: confirm briefly, then on to the next model.
      // The count is the point — one scan can now take in a whole run of sizes,
      // and «збережено» alone would not say how many pairs that turned into.
      const count = result.pairs.length;
      showToast(
        result.awaitingPrice
          ? t('intake.savedDraft', { count })
          : t('intake.savedToStock', { count }),
        2500,
      );
      if (manual) {
        // Back to a blank form, not to the camera the person chose to skip.
        setFormKey((key) => key + 1);
        return;
      }
      recognize.reset();
      setRecognition(null);
      setStep('capture');
    },
    onError: () => showToast(t('intake.saveError'), 3500),
  });

  // Manual entry stays INSIDE the intake flow (S-1.2/S-1.3): an empty confirm
  // form, not /manual — that route is the checkout flow and selling a pair is
  // the opposite of receiving one.
  const goManual = () => {
    recognize.reset();
    setRecognition(null);
    setStep('confirm');
  };
  const rescan = () => {
    recognize.reset();
    setRecognition(null);
    setStep('capture');
  };

  const onSave = (input: IntakeInput, mode: SaveMode) => {
    save.mutate({ input, mode });
  };

  return (
    <>
      {toast && (
        <div className="fixed inset-x-0 top-4 z-30 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-page shadow-modal">
          {toast}
        </div>
      )}
      {step === 'confirm' ? (
        <ConfirmForm
          key={formKey}
          {...(recognition ? { recognition } : {})}
          manual={manual}
          saving={save.isPending}
          onSave={onSave}
          {...(manual ? {} : { onRescan: rescan })}
          onBack={() => void navigate({ to: '/' })}
        />
      ) : step === 'error' ? (
        <RecognitionError onRetry={rescan} onManual={goManual} />
      ) : (
        <CameraScreen
          processing={recognize.isPending}
          onCapture={(photo) => recognize.mutate(photo)}
          onManual={goManual}
        />
      )}
    </>
  );
}
