import { expect, test } from '@playwright/test';
import { createBehaviorHarness } from 'wheel/testing/playwright';

import { installFlakyMusicProvider } from './flaky-music-provider';

const { behavior } = createBehaviorHarness({
  test,
  hosts: [{ name: 'app', origin: 'http://127.0.0.1:4173' }],
  beforeBehavior: ({ page }) => installFlakyMusicProvider(page)
});

behavior('PLAYER-01', 'a late play completion cannot restart stopped audio', async (b) => {
  await b.goto('/player');
  await b.step('request playback', () => b.wheel.actService('PlayerService', 'requestPlay'));
  await b.step('provider reports playing before audio starts', () =>
    b.page.evaluate(() => window.musicProviderTest.reportPlaying(), undefined)
  );

  const [status] = await b.wheel.find('PlayerStatus');
  expect((await b.wheel.component(status!.instanceId))!.state.phase).toBe('buffering');

  await b.step('stop playback', () => b.wheel.actService('PlayerService', 'stop'));
  await b.step('the old play request completes late', () =>
    b.page.evaluate(() => window.musicProviderTest.finishPlay(), undefined)
  );

  expect((await b.wheel.component(status!.instanceId))!.state.phase).toBe('stopped');
});
