import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createBehaviorHarness,
  type BehaviorPage,
  type BehaviorRequest,
  type BehaviorTest,
  type BehaviorTestInfo
} from './playwright';

interface RegisteredTest {
  readonly title: string;
  readonly run: Parameters<BehaviorTest>[1];
}

class FakePage implements BehaviorPage {
  readonly visits: string[] = [];
  readonly keys: string[] = [];
  closed = false;

  constructor(private readonly appErrors: Array<Record<string, unknown>> = []) {}

  async evaluate<R, Arg>(_fn: (arg: Arg) => R | Promise<R>, _arg: Arg): Promise<R> {
    return this.appErrors as R;
  }

  async addInitScript(_script: () => void | Promise<void>): Promise<void> {}

  async goto(url: string): Promise<unknown> {
    this.visits.push(url);
    return null;
  }

  readonly keyboard = {
    press: async (key: string): Promise<void> => {
      this.keys.push(key);
    }
  };

  video(): null {
    return null;
  }

  context(): { close(): Promise<void> } {
    return {
      close: async () => {
        this.closed = true;
      }
    };
  }
}

const request: BehaviorRequest = {
  post: async () => ({ ok: () => true, status: () => 200 })
};

function registry(): { readonly tests: RegisteredTest[]; readonly test: BehaviorTest } {
  const tests: RegisteredTest[] = [];
  return {
    tests,
    test: (title, run) => {
      tests.push({ title, run });
    }
  };
}

function info(title: string): BehaviorTestInfo {
  return { title };
}

describe('createBehaviorHarness', () => {
  it('expands hosts, runs app setup, and records generic steps', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wheel-behavior-'));
    try {
      const { tests, test } = registry();
      const setup: string[] = [];
      const harness = createBehaviorHarness({
        test,
        hosts: [
          { name: 'standalone', origin: 'http://app.test' },
          { name: 'embedded', origin: 'http://site.test', prefix: '/demo' }
        ],
        recordingsDir: dir,
        beforeBehavior: async ({ id, host }) => {
          setup.push(`${id}:${host.name}`);
        }
      });

      harness.behavior(
        'PLAYER-01',
        'late provider completion cannot restart playback',
        async (behavior) => {
          await behavior.goto('/player');
          await behavior.step('provider reports playing before audio', async () => undefined);
          expect(behavior.wheel).toBeDefined();
        },
        { tags: ['@smoke'] }
      );

      expect(tests.map((entry) => entry.title)).toEqual([
        'PLAYER-01 @standalone @smoke: late provider completion cannot restart playback',
        'PLAYER-01 @embedded @smoke: late provider completion cannot restart playback'
      ]);

      const page = new FakePage();
      await tests[0]!.run({ page, request }, info(tests[0]!.title));

      expect(setup).toEqual(['PLAYER-01:standalone']);
      expect(page.visits).toEqual(['http://app.test/player']);
      expect(page.closed).toBe(true);
      const timeline = JSON.parse(
        readFileSync(join(dir, 'standalone', 'PLAYER-01.timeline.json'), 'utf8')
      ) as { steps: Array<{ action: string; label: string }> };
      expect(timeline.steps).toEqual([
        { action: 'goto', label: '/player', cursor: null, step: 1, tEndMs: expect.any(Number), tStartMs: expect.any(Number) },
        {
          action: 'step',
          label: 'provider reports playing before audio',
          cursor: null,
          step: 2,
          tEndMs: expect.any(Number),
          tStartMs: expect.any(Number)
        }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails after the behavior when the app captured an error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wheel-behavior-errors-'));
    try {
      const { tests, test } = registry();
      const harness = createBehaviorHarness({
        test,
        hosts: [{ name: 'app', origin: 'http://app.test' }],
        recordingsDir: dir
      });
      harness.behavior('PLAYER-02', 'captured errors fail a green assertion path', async () => undefined);
      const page = new FakePage([
        { id: 'err_1', level: 'error', source: 'unhandledrejection', message: 'provider failed', stack: ['player.ts:42'] }
      ]);

      await expect(tests[0]!.run({ page, request }, info(tests[0]!.title))).rejects.toThrow(
        'behavior passed but the app captured 1 error(s)'
      );
      expect(page.closed).toBe(true);
      expect(existsSync(join(dir, 'app', 'PLAYER-02.timeline.json'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe host and behavior names before writing recordings', () => {
    const { test } = registry();
    expect(() =>
      createBehaviorHarness({ test, hosts: [{ name: '../outside', origin: 'http://app.test' }] })
    ).toThrow('behavior host name');

    const harness = createBehaviorHarness({
      test,
      hosts: [{ name: 'app', origin: 'http://app.test' }],
      idPattern: /.+/
    });
    expect(() => harness.behavior('../PLAYER-03', 'unsafe id', async () => undefined)).toThrow(
      'cannot be used as a recording filename'
    );
  });
});
