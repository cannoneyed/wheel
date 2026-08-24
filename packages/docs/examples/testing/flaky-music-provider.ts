import type { BehaviorPage } from 'wheel/testing/playwright';

interface MusicProvider {
  play(): Promise<void>;
  onPlaybackState(listener: (state: 'playing' | 'stopped') => void): void;
}

interface MusicProviderTestControl {
  finishPlay(): void;
  reportPlaying(): void;
}

declare global {
  interface Window {
    musicProvider: MusicProvider;
    musicProviderTest: MusicProviderTestControl;
  }
}

/** Install a provider that can report `playing` before `play()` completes. */
export async function installFlakyMusicProvider(page: BehaviorPage): Promise<void> {
  await page.addInitScript(() => {
    let playbackListener: ((state: 'playing' | 'stopped') => void) | undefined;
    let finishPlay: (() => void) | undefined;

    window.musicProvider = {
      play: () =>
        new Promise<void>((resolve) => {
          finishPlay = resolve;
        }),
      onPlaybackState: (listener) => {
        playbackListener = listener;
      }
    };

    window.musicProviderTest = {
      reportPlaying: () => playbackListener?.('playing'),
      finishPlay: () => {
        finishPlay?.();
        finishPlay = undefined;
      }
    };
  });
}
