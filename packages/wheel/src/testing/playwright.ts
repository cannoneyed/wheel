/**
 * Browser behavior tests for Wheel apps.
 *
 * The harness is structurally typed against Playwright. Wheel does not load
 * Playwright, but an app can pass Playwright's `test` function directly.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { wheelDriver, type DriverPage, type WheelDriver } from './driver';

interface BehaviorBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The locator methods used by recorded behavior actions. */
export interface BehaviorLocator {
  /** Read the target box for the recorded cursor position. */
  boundingBox(): Promise<BehaviorBox | null>;
  /** Click the target. */
  click(options?: { readonly button?: 'right'; readonly force?: boolean }): Promise<void>;
  /** Double-click the target. */
  dblclick(): Promise<void>;
  /** Move the pointer over the target. */
  hover(): Promise<void>;
  /** Replace the target value. */
  fill(value: string): Promise<void>;
  /** Press one key on the target. */
  press(key: string): Promise<void>;
}

interface BehaviorVideo {
  path(): Promise<string>;
}

/** The page methods used by the behavior harness and `wheelDriver`. */
export interface BehaviorPage extends DriverPage {
  /** Install an external-provider test double before app code runs. */
  addInitScript(script: () => void | Promise<void>): Promise<unknown>;
  /** Navigate the page. */
  goto(url: string): Promise<unknown>;
  /** Send page-level key presses. */
  readonly keyboard: { press(key: string): Promise<void> };
  /** Read the Playwright video for this page. */
  video(): BehaviorVideo | null;
  /** Read and close this page's isolated browser context. */
  context(): { close(): Promise<void> };
}

/** The response methods used by behavior setup hooks. */
export interface BehaviorResponse {
  /** True for an HTTP success response. */
  ok(): boolean;
  /** The HTTP response status. */
  status(): number;
}

/** The request methods used by behavior setup hooks. */
export interface BehaviorRequest {
  /** Send a POST request before a behavior starts. */
  post(url: string): Promise<BehaviorResponse>;
}

/** The Playwright test information used by recording metadata. */
export interface BehaviorTestInfo {
  /** The complete test title. */
  readonly title: string;
}

/** The Playwright fixtures used by each generated behavior test. */
export interface BehaviorFixtures<
  Page extends BehaviorPage = BehaviorPage,
  Request extends BehaviorRequest = BehaviorRequest
> {
  /** The isolated page fixture. */
  readonly page: Page;
  /** The HTTP request fixture. */
  readonly request: Request;
}

/** A Playwright-compatible test declaration function. */
export interface BehaviorTest<
  Page extends BehaviorPage = BehaviorPage,
  Request extends BehaviorRequest = BehaviorRequest
> {
  /** Declare one generated test. */
  (
    title: string,
    run: (fixtures: BehaviorFixtures<Page, Request>, testInfo: BehaviorTestInfo) => Promise<void>
  ): void;
}

/** One serving topology a behavior must pass against. */
export interface BehaviorHost {
  /** Stable name used in test titles and recording paths. */
  readonly name: string;
  /** Absolute app origin. */
  readonly origin: string;
  /** Optional path prefix applied by `BehaviorContext.goto()`. */
  readonly prefix?: string;
}

interface TimelineStep {
  readonly step: number;
  readonly action: string;
  readonly label: string;
  readonly cursor: { x: number; y: number } | null;
  readonly tStartMs: number;
  readonly tEndMs: number;
}

/** Values passed to an app-specific setup hook before each behavior. */
export interface BeforeBehaviorContext<
  Page extends BehaviorPage = BehaviorPage,
  Request extends BehaviorRequest = BehaviorRequest
> {
  /** The behavior ID. */
  readonly id: string;
  /** The current serving topology. */
  readonly host: BehaviorHost;
  /** The isolated page, before the behavior navigates it. */
  readonly page: Page;
  /** The Playwright request fixture. */
  readonly request: Request;
}

/** Configuration for `createBehaviorHarness()`. */
export interface BehaviorHarnessOptions<
  Page extends BehaviorPage = BehaviorPage,
  Request extends BehaviorRequest = BehaviorRequest
> {
  /** Playwright's `test` declaration function. */
  readonly test: BehaviorTest<Page, Request>;
  /** Serving topologies. Each declared behavior runs once per host. */
  readonly hosts: readonly BehaviorHost[];
  /** Recording root. Defaults to `recordings` under the current directory. */
  readonly recordingsDir?: string;
  /** Behavior ID format. Defaults to `<NAME>-<NN>`. */
  readonly idPattern?: RegExp;
  /** App-specific reset or provider setup before each behavior. */
  readonly beforeBehavior?: (context: BeforeBehaviorContext<Page, Request>) => Promise<void>;
}

/** Per-behavior options. */
export interface BehaviorOptions {
  /** Extra title tags, such as `@smoke`. */
  readonly tags?: readonly string[];
}

/** The functions returned by `createBehaviorHarness()`. */
export interface BehaviorHarness<Page extends BehaviorPage = BehaviorPage> {
  /** Declare one behavior. The harness creates one test per configured host. */
  behavior(
    id: string,
    title: string,
    run: (context: BehaviorContext<Page>) => Promise<void>,
    options?: BehaviorOptions
  ): void;
}

/** The recorded action surface for one browser behavior. */
export class BehaviorContext<Page extends BehaviorPage = BehaviorPage> {
  private readonly steps: TimelineStep[] = [];
  private readonly startedAt = performance.now();
  private appErrorsAllowed = false;

  /** A Wheel debug-bridge driver for state reads and service actions. */
  readonly wheel: WheelDriver;

  constructor(
    /** The isolated browser page. */
    readonly page: Page,
    /** The current serving topology. */
    readonly host: BehaviorHost,
    private readonly behaviorId: string,
    private readonly testInfo: BehaviorTestInfo,
    private readonly recordingsDir: string
  ) {
    this.wheel = wheelDriver(page, { ignoreAppErrors: true });
  }

  private async record<T>(
    action: string,
    label: string,
    target: BehaviorLocator | null,
    run: () => Promise<T>
  ): Promise<T> {
    const box = target ? await target.boundingBox() : null;
    const cursor = box ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) } : null;
    const tStartMs = Math.round(performance.now() - this.startedAt);
    const result = await run();
    this.steps.push({
      step: this.steps.length + 1,
      action,
      label,
      cursor,
      tStartMs,
      tEndMs: Math.round(performance.now() - this.startedAt)
    });
    return result;
  }

  /** Record a provider event, driver action, or other action without a pointer target. */
  step<T>(label: string, run: () => Promise<T>): Promise<T> {
    return this.record('step', label, null, run);
  }

  /** Navigate within the app. The host path prefix is applied. */
  goto(path: string): Promise<unknown> {
    return this.record('goto', path, null, () =>
      this.page.goto(`${this.host.origin}${this.host.prefix ?? ''}${path}`)
    );
  }

  /** Record and run a click. */
  click(label: string, target: BehaviorLocator): Promise<void> {
    return this.record('click', label, target, () => target.click());
  }

  /** Record and run a right-click. */
  rightClick(label: string, target: BehaviorLocator, options: { readonly force?: boolean } = {}): Promise<void> {
    return this.record('rightClick', label, target, () =>
      target.click({ button: 'right', force: options.force })
    );
  }

  /** Record and run a double-click. */
  dblclick(label: string, target: BehaviorLocator): Promise<void> {
    return this.record('dblclick', label, target, () => target.dblclick());
  }

  /** Record and run a hover. */
  hover(label: string, target: BehaviorLocator): Promise<void> {
    return this.record('hover', label, target, () => target.hover());
  }

  /** Record and run an input fill. */
  fill(label: string, target: BehaviorLocator, value: string): Promise<void> {
    return this.record('fill', label, target, () => target.fill(value));
  }

  /** Record and run a key press on a target. */
  press(label: string, target: BehaviorLocator, key: string): Promise<void> {
    return this.record('press', `${label} [${key}]`, target, () => target.press(key));
  }

  /** Record and run a page-level key press. */
  pressGlobal(key: string): Promise<void> {
    return this.record('press', `global [${key}]`, null, () => this.page.keyboard.press(key));
  }

  /** Allow captured application errors for a behavior that tests an error path. */
  allowAppErrors(): void {
    this.appErrorsAllowed = true;
  }

  /** Fail when the Wheel debug bridge captured an application error. */
  async assertNoAppErrors(): Promise<void> {
    if (this.appErrorsAllowed) return;
    const entries = await this.page.evaluate(() => {
      const w = window as Window & { __wheel?: { errors(): Array<Record<string, unknown>> } };
      return w.__wheel?.errors() ?? [];
    }, undefined);
    const failures = entries.filter((entry) => entry.level === 'error');
    if (failures.length > 0) {
      const detail = failures
        .map((entry) => `[${entry.id}] (${entry.source}) ${entry.message}\n  ${(entry.stack as string[]).join('\n  ')}`)
        .join('\n');
      throw new Error(
        `behavior passed but the app captured ${failures.length} error(s) — a green test over a broken app is a lie:\n${detail}`
      );
    }
  }

  /** Save the action timeline and Playwright video. */
  async save(): Promise<void> {
    const dir = join(this.recordingsDir, this.host.name);
    mkdirSync(dir, { recursive: true });
    const video = this.page.video();
    await this.page.context().close();
    let videoFile: string | null = null;
    if (video) {
      try {
        videoFile = join(dir, `${this.behaviorId}.webm`);
        copyFileSync(await video.path(), videoFile);
      } catch {
        videoFile = null;
      }
    }
    writeFileSync(
      join(dir, `${this.behaviorId}.timeline.json`),
      `${JSON.stringify(
        {
          behaviorId: this.behaviorId,
          host: this.host.name,
          test: this.testInfo.title,
          video: videoFile,
          durationMs: Math.round(performance.now() - this.startedAt),
          steps: this.steps
        },
        null,
        2
      )}\n`
    );
  }
}

const DEFAULT_BEHAVIOR_ID = /^[A-Z]+-\d{2,}$/;
const SAFE_FILE_PART = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Create a recorded behavior declaration for one or more app hosts. */
export function createBehaviorHarness<
  Page extends BehaviorPage,
  Request extends BehaviorRequest
>(options: BehaviorHarnessOptions<Page, Request>): BehaviorHarness<Page> {
  if (options.hosts.length === 0) {
    throw new Error('behavior harness needs at least one host');
  }
  for (const host of options.hosts) {
    if (!SAFE_FILE_PART.test(host.name)) {
      throw new Error(`behavior host name "${host.name}" must contain only letters, numbers, underscores, or hyphens`);
    }
  }
  const idPattern = options.idPattern ?? DEFAULT_BEHAVIOR_ID;
  const recordingsDir = resolve(options.recordingsDir ?? 'recordings');

  return {
    behavior(id, title, run, behaviorOptions = {}) {
      idPattern.lastIndex = 0;
      if (!idPattern.test(id)) {
        throw new Error(`behavior id "${id}" does not match ${idPattern}`);
      }
      if (!SAFE_FILE_PART.test(id)) {
        throw new Error(`behavior id "${id}" cannot be used as a recording filename`);
      }
      for (const host of options.hosts) {
        const tags = behaviorOptions.tags?.length ? ` ${behaviorOptions.tags.join(' ')}` : '';
        options.test(`${id} @${host.name}${tags}: ${title}`, async ({ page, request }, testInfo) => {
          await options.beforeBehavior?.({ id, host, page, request });
          const context = new BehaviorContext(page, host, id, testInfo, recordingsDir);
          try {
            await run(context);
            await context.assertNoAppErrors();
          } finally {
            await context.save();
          }
        });
      }
    }
  };
}
