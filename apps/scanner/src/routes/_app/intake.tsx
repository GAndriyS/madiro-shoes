import { tagRecognitionSchema, type TagRecognition } from '@madiro/shared';
import { api } from '@madiro/web-core';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { CameraScreen } from '../../components/intake/CameraScreen';
import { ConfirmForm } from '../../components/intake/ConfirmForm';
import { RecognitionError } from '../../components/intake/RecognitionError';

export const Route = createFileRoute('/_app/intake')({
  component: IntakePage,
});

/**
 * Intake step 1 — label recognition (FR-S-04/05): camera (or file fallback) →
 * upload → vision → prefilled confirmation. Result lives in component state:
 * it is ephemeral, so a deep-linkable confirm route would have nothing to show.
 */
function IntakePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'capture' | 'error' | 'confirm'>('capture');
  const [recognition, setRecognition] = useState<TagRecognition | null>(null);

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

  const goManual = () => void navigate({ to: '/manual' });
  const rescan = () => {
    recognize.reset();
    setStep('capture');
  };

  if (step === 'confirm' && recognition) {
    return (
      <ConfirmForm
        recognition={recognition}
        onRescan={rescan}
        onBack={() => void navigate({ to: '/' })}
      />
    );
  }
  if (step === 'error') {
    return <RecognitionError onRetry={rescan} onManual={goManual} />;
  }
  return (
    <CameraScreen
      processing={recognize.isPending}
      onCapture={(photo) => recognize.mutate(photo)}
      onManual={goManual}
    />
  );
}
