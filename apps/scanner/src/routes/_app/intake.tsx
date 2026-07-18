import {
  intakeResultSchema,
  tagRecognitionSchema,
  type IntakeInput,
  type TagRecognition,
} from '@madiro/shared';
import { api } from '@madiro/web-core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CameraScreen } from '../../components/intake/CameraScreen';
import { ConfirmForm, type SaveMode } from '../../components/intake/ConfirmForm';
import { RecognitionError } from '../../components/intake/RecognitionError';

export const Route = createFileRoute('/_app/intake')({
  component: IntakePage,
});

/**
 * Intake flow: camera (or file fallback) → vision recognition → prefilled
 * confirmation that persists the pair (PR 2). Batch mode ("scan next") loops
 * back to the camera; "save and finish" returns home. Recognition results are
 * ephemeral component state, so there is no deep-linkable confirm route.
 */
function IntakePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'capture' | 'error' | 'confirm'>('capture');
  const [recognition, setRecognition] = useState<TagRecognition | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      // Batch: confirm briefly, then back to the camera for the next pair.
      setToast(result.awaitingPrice ? t('intake.savedDraft') : t('intake.savedToStock'));
      recognize.reset();
      setRecognition(null);
      setStep('capture');
      setTimeout(() => setToast(null), 2500);
    },
    onError: () => setToast(t('intake.saveError')),
  });

  const goManual = () => void navigate({ to: '/manual' });
  const rescan = () => {
    recognize.reset();
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
      {step === 'confirm' && recognition ? (
        <ConfirmForm
          recognition={recognition}
          saving={save.isPending}
          onSave={onSave}
          onRescan={rescan}
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
