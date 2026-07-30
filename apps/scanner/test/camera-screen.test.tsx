import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CameraScreen } from '../src/components/intake/CameraScreen';
import { initI18n } from '../src/i18n';

// No router in a unit render — the back link is not what these tests are about.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

/** jsdom implements neither `srcObject` nor a working `play()`. */
function stubMediaElement() {
  const play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    get() {
      return (this as { _srcObject?: MediaStream })._srcObject ?? null;
    },
    set(value: MediaStream | null) {
      (this as { _srcObject?: MediaStream | null })._srcObject = value;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: play,
  });
  return play;
}

function fakeStream() {
  const track = {
    stop: vi.fn(),
    getCapabilities: () => ({ torch: false }),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

const noop = () => {};

describe('CameraScreen', () => {
  beforeAll(() => {
    initI18n();
  });
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(cleanup);

  // The bug this guards: `srcObject` used to be assigned inside the
  // getUserMedia callback, while the <video> was still behind the 'pending'
  // spinner and the ref was null. The assignment no-opped, nothing retried it,
  // and every scanner screen showed a black viewfinder on a real phone.
  it('прив’язує потік до <video>, коли камера стартує раніше за монтування елемента', async () => {
    const play = stubMediaElement();
    const { stream } = fakeStream();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    render(<CameraScreen processing={false} onCapture={noop} onManual={noop} />);

    const video = await screen.findByTestId<HTMLVideoElement>('camera-video');
    await waitFor(() => expect(video.srcObject).toBe(stream));
    expect(play).toHaveBeenCalled();
  });

  it('без mediaDevices показує картку недоступної камери з файловим інпутом', async () => {
    stubMediaElement();
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });

    render(<CameraScreen processing={false} onCapture={noop} onManual={noop} />);

    expect(await screen.findByText('Камера недоступна')).toBeInTheDocument();
    expect(screen.getByTestId('tag-photo-input')).toBeInTheDocument();
    expect(screen.queryByTestId('camera-video')).not.toBeInTheDocument();
  });

  it('зупиняє треки камери при розмонтуванні', async () => {
    stubMediaElement();
    const { stream, track } = fakeStream();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const { unmount } = render(
      <CameraScreen processing={false} onCapture={noop} onManual={noop} />,
    );
    await screen.findByTestId('camera-video');

    unmount();
    expect(track.stop).toHaveBeenCalled();
  });
});
