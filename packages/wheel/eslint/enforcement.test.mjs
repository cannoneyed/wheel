import { ESLint, Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

import wheel from './index.mjs';

const linter = new Linter({ configType: 'flat' });

/** Same as `verify`, but with a parser that understands TSX — needed by JSX rules. */
function verifyTsx(code, rule, options = [], filename = 'fixture.tsx') {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.{js,ts,tsx}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' }
        },
        plugins: { wheel },
        rules: { [`wheel/${rule}`]: ['error', ...options] }
      }
    ],
    { filename }
  );
}

function verify(code, rule, options = [], filename = 'fixture.tsx') {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.{js,ts,tsx}'],
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module'
        },
        plugins: { wheel },
        rules: { [`wheel/${rule}`]: ['error', ...options] }
      }
    ],
    { filename }
  );
}

describe('architecture lint regressions', () => {
  it('rejects whole services in direct and aliased view bags', () => {
    const direct = verify(
      `const connectX = connect('X', (c) => {
        const service = c.service(TodoService);
        return view({ service });
      });`,
      'no-whole-service-injection'
    );
    expect(direct.map((message) => message.ruleId)).toEqual([
      'wheel/no-whole-service-injection'
    ]);

    const aliased = verify(
      `const connectX = connect('X', (c) => {
        const service = c.service(TodoService);
        const alias = service;
        const reads = { state: alias };
        return view(reads);
      });`,
      'no-whole-service-injection'
    );
    expect(aliased.map((message) => message.ruleId)).toEqual([
      'wheel/no-whole-service-injection'
    ]);
  });

  it('allows view bags containing only service members', () => {
    const messages = verify(
      `const connectX = connect('X', (c) => {
        const service = c.service(TodoService);
        return view({ count: service.count }, { save: service.save });
      });`,
      'no-whole-service-injection'
    );
    expect(messages).toEqual([]);
  });

  it('rejects raw Wheel contexts, including import aliases', () => {
    const messages = verify(
      `import { useContext as readContext } from 'solid-js';
       import { WheelContext as RawWheelContext } from './context.js';
       const value = readContext(RawWheelContext);`,
      'connect-only'
    );
    expect(messages.map((message) => message.ruleId)).toEqual(['wheel/connect-only']);
  });

  it('allows unrelated Solid contexts', () => {
    const messages = verify(
      `import { useContext } from 'solid-js';
       const value = useContext(ThemeContext);`,
      'connect-only'
    );
    expect(messages).toEqual([]);
  });

  it('requires a substantive reason for native TSX view timing', () => {
    expect(
      verify(`const later = () => setTimeout(close, 10);`, 'no-raw-timers', [
        { allowViewTimingReasons: true }
      ]).map((message) => message.ruleId)
    ).toEqual(['wheel/no-raw-timers']);
    expect(
      verify(
        `const later = () => {
          // wheel-view-timing: keep the transient success state visible long enough to read
          return setTimeout(close, 10);
        };`,
        'no-raw-timers',
        [{ allowViewTimingReasons: true }]
      )
    ).toEqual([]);
  });

  it('allows raw browser timing only in the component runtime seam', () => {
    expect(
      verify(
        `export const now = () => Date.now();`,
        'no-raw-timers',
        [],
        'packages/wheel/src/components/base-utils/runtime.ts'
      )
    ).toEqual([]);
    expect(
      verify(
        `export const now = () => Date.now();`,
        'no-raw-timers',
        [],
        'packages/wheel/src/components/button/runtime.ts'
      ).map((message) => message.ruleId)
    ).toEqual(['wheel/no-raw-timers']);
  });

  it('keeps config independent, and lets router reach down to core only', () => {
    // config depends on nothing internal.
    expect(
      verify(
        `import { Service } from 'wheel/core'; void Service;`,
        'no-cross-layer-imports',
        [],
        'packages/wheel/src/config/bad.ts'
      ).map((message) => message.ruleId)
    ).toEqual(['wheel/no-cross-layer-imports']);

    // router builds on core (RouterService is a Service) but nothing above it.
    expect(
      verify(
        `import { Service } from 'wheel/core'; void Service;`,
        'no-cross-layer-imports',
        [],
        'packages/wheel/src/router/good.ts'
      )
    ).toEqual([]);
    expect(
      verify(
        `import { liveQuery } from 'wheel/sync'; void liveQuery;`,
        'no-cross-layer-imports',
        [],
        'packages/wheel/src/router/bad.ts'
      ).map((message) => message.ruleId)
    ).toEqual(['wheel/no-cross-layer-imports']);

    expect(
      verify(
        `import { z } from 'zod'; void z;`,
        'no-cross-layer-imports',
        [],
        'packages/wheel/src/config/good.ts'
      )
    ).toEqual([]);
  });
});

describe('effective repo config', () => {
  const eslint = new ESLint({ cwd: process.cwd() });

  it.each([
    ['packages/wheel/src/kit/toast.tsx', 'wheel/single-connect'],
    ['packages/wheel/src/debug/inspector.tsx', 'wheel/require-component-root'],
    ['packages/tracker/src/components/list/issue-row.tsx', 'wheel/require-component-root'],
    ['packages/tracker/src/services/search-service.ts', 'wheel/no-raw-timers']
  ])('%s enables %s', async (filename, rule) => {
    const config = await eslint.calculateConfigForFile(filename);
    expect(config.rules[rule][0]).toBe(2);
  });
});

describe('fixed dev-mode branch enforcement', () => {
  it('rejects direct and aliased isWheelDevMode calls in Show conditions', () => {
    const direct = verifyTsx(
      `import { Show } from 'solid-js';
       import { isWheelDevMode } from './dev-mode';
       const App = (props) => <Show when={isWheelDevMode()}>{props.children}</Show>;`,
      'no-dev-mode-show'
    );
    expect(direct.map((message) => message.ruleId)).toEqual(['wheel/no-dev-mode-show']);

    const aliased = verifyTsx(
      `import { Show as SolidShow } from 'solid-js';
       import { isWheelDevMode as devMode } from './dev-mode';
       const App = (props) => <SolidShow when={devMode()}>{props.children}</SolidShow>;`,
      'no-dev-mode-show'
    );
    expect(aliased.map((message) => message.ruleId)).toEqual(['wheel/no-dev-mode-show']);
  });

  it('allows a plain dev-mode branch and reactive Show conditions', () => {
    expect(
      verifyTsx(
        `import { Show } from 'solid-js';
         import { isWheelDevMode } from './dev-mode';
         const App = (props) => isWheelDevMode() ? <Dev>{props.children}</Dev> : props.children;
         const Dialog = () => <Show when={open()}>dialog</Show>;`,
        'no-dev-mode-show'
      )
    ).toEqual([]);
  });
});

describe('router enforcement', () => {
  it('flags location and history navigation outside the router seam', () => {
    const cases = [
      `window.location.href = '/teams/a';`,
      `location.assign('/teams/a');`,
      `window.history.pushState(null, '', '/teams/a');`,
      `history.replaceState(null, '', url);`,
      `const p = window.location.pathname;`,
      `history.back();`
    ];
    for (const code of cases) {
      expect(verify(code, 'no-raw-location').map((m) => m.ruleId), code).toEqual([
        'wheel/no-raw-location'
      ]);
    }
  });

  it('allows router navigation, unrelated members, and the blessed seam', () => {
    expect(
      verify(`router.navigate('team', { params: { teamId: id } });`, 'no-raw-location')
    ).toEqual([]);
    expect(verify(`const o = window.location.origin;`, 'no-raw-location')).toEqual([]);
    expect(verify(`const s = state.history.push;`, 'no-raw-location')).toEqual([]);
    expect(
      verify(
        `window.history.pushState(null, '', url);`,
        'no-raw-location',
        [],
        'packages/wheel/src/router/history.ts'
      )
    ).toEqual([]);
  });

  it('accepts a written reason for a deliberate raw navigation', () => {
    expect(
      verify(
        `// wheel-raw-location: hard reload on sign-out, deliberately drops app state\nwindow.location.assign('/login');`,
        'no-raw-location'
      )
    ).toEqual([]);
  });

  it('flags a plain anchor pointing at an in-app path', () => {
    expect(
      verifyTsx(`const A = () => <a href="/teams/core/issues">Issues</a>;`, 'no-raw-anchor-navigation').map(
        (m) => m.ruleId
      )
    ).toEqual(['wheel/no-raw-anchor-navigation']);
  });

  it('leaves external, protocol-relative, fragment, and dynamic hrefs alone', () => {
    const allowed = [
      `const A = () => <a href="https://example.com">Docs</a>;`,
      `const A = () => <a href="//cdn.example.com/x">CDN</a>;`,
      `const A = () => <a href="#section">Jump</a>;`,
      `const A = () => <a href="mailto:x@example.com">Mail</a>;`,
      `const A = () => <a href={someUrl}>Dynamic</a>;`,
      `const A = () => <Link to="team.issues" params={{ teamId }}>Issues</Link>;`
    ];
    for (const code of allowed) {
      expect(verifyTsx(code, 'no-raw-anchor-navigation'), code).toEqual([]);
    }
  });

  it('accepts a written reason for a deliberate full page load', () => {
    expect(
      verifyTsx(
        `const A = () => (<div>{/* wheel-raw-anchor: full load, proves the SPA fallback */}<a href="/nope">x</a></div>);`,
        'no-raw-anchor-navigation'
      )
    ).toEqual([]);
  });
});

describe('field-initialization order enforcement', () => {
  const BAD = `class FilterService extends Service {
    private readonly boardService: BoardService;
    readonly tags = this.computed(() => this.boardService.tags());
    constructor(context: ServiceContext) {
      super(context);
      this.boardService = this.service(BoardService);
    }
  }`;

  it('flags the exact bug that crashed the kanban demo', () => {
    const messages = verifyTsx(BAD, 'no-early-field-read');
    expect(messages.map((m) => m.ruleId)).toEqual(['wheel/no-early-field-read']);
    expect(messages[0].message).toContain('boardService');
  });

  it('flags a direct read in the initializer expression itself', () => {
    expect(
      verifyTsx(
        `class S extends Service {
           private readonly dep: Dep;
           readonly seed = this.atom(this.dep.initial(), 'seed');
           constructor(c) { super(c); this.dep = this.service(Dep); }
         }`,
        'no-early-field-read'
      ).map((m) => m.ruleId)
    ).toEqual(['wheel/no-early-field-read']);
  });

  it('accepts the same dependency declared as a field', () => {
    expect(
      verifyTsx(
        `class S extends Service {
           private readonly dep = this.service(Dep);
           readonly tags = this.computed(() => this.dep.tags());
           constructor(c) { super(c); this.addCleanup(() => this.dep.stop()); }
         }`,
        'no-early-field-read'
      )
    ).toEqual([]);
  });

  it('leaves deferred callbacks alone — they run after the constructor', () => {
    const allowed = [
      `class S extends Service {
         private readonly dep: Dep;
         readonly clear = this.action(() => this.dep.reset(), 'clear');
         readonly cardsIn = this.computedFor((id: string) => this.dep.in(id));
         readonly late = () => this.dep.value();
         constructor(c) { super(c); this.dep = this.service(Dep); }
       }`,
      // A field with BOTH an initializer and a later constructor assignment is
      // already defined before anything can read it.
      `class S extends Service {
         private dep = null;
         readonly tags = this.computed(() => this.dep?.tags() ?? []);
         constructor(c) { super(c); this.dep = this.service(Dep); }
       }`,
      // No constructor at all: nothing can be out of order.
      `class S extends Service {
         private readonly dep = this.service(Dep);
         readonly tags = this.computed(() => this.dep.tags());
       }`
    ];
    for (const code of allowed) {
      expect(verifyTsx(code, 'no-early-field-read'), code).toEqual([]);
    }
  });
});

describe('latest async task await enforcement', () => {
  it('flags a bare await after a service method opens a latest async task', () => {
    const messages = verifyTsx(
      `class SearchService extends Service {
         readonly load = async () => {
           const task = this.latestAsyncTask();
           const result = await fetchResult();
           return result;
         };
       }`,
      'require-latest-async-task-wait'
    );
    expect(messages.map((message) => message.ruleId)).toEqual([
      'wheel/require-latest-async-task-wait'
    ]);
    expect(messages[0].message).toContain('task.wait');
  });

  it('accepts direct and grouped waits that include the task token', () => {
    const allowed = [
      `class SearchService extends Service {
         async load() {
           const token = this.latestAsyncTask();
           return await token.wait(fetchResult());
         }
       }`,
      `class SearchService extends Service {
         readonly load = async () => {
           const task = this.latestAsyncTask();
           return await Promise.all([task.wait(loadA()), task.wait(loadB())]);
         };
       }`,
      `class SearchService extends Service {
         readonly load = async () => await this.latestAsyncTask().wait(fetchResult());
       }`
    ];
    for (const code of allowed) {
      expect(verifyTsx(code, 'require-latest-async-task-wait'), code).toEqual([]);
    }
  });

  it('checks awaits in nested continuations and action callbacks', () => {
    const messages = verifyTsx(
      `class SearchService extends Service {
         readonly load = this.action(async () => {
           const task = this.latestAsyncTask();
           return items.map(async (item) => await loadItem(item));
         });
       }`,
      'require-latest-async-task-wait'
    );
    expect(messages.map((message) => message.ruleId)).toEqual([
      'wheel/require-latest-async-task-wait'
    ]);
  });

  it('leaves async service methods without a latest async task unchanged', () => {
    expect(
      verifyTsx(
        `class DialogService extends Service {
           readonly confirm = async () => await openDialog();
         }`,
        'require-latest-async-task-wait'
      )
    ).toEqual([]);
  });
});

describe('tracked service field enforcement', () => {
  it('flags mutable private fields on direct and same-file Service subclasses', () => {
    const messages = verifyTsx(
      `class PlaybackService extends Service {
         private retries = 0;
         private handle: AudioContext | null = null;
       }
       class SpecializedPlayback extends PlaybackService {
         private epoch = 0;
       }`,
      'require-tracked-service-fields'
    );
    expect(messages.map((message) => message.ruleId)).toEqual([
      'wheel/require-tracked-service-fields',
      'wheel/require-tracked-service-fields',
      'wheel/require-tracked-service-fields'
    ]);
  });

  it('allows tracked fields, readonly dependencies, and unrelated classes', () => {
    const messages = verifyTsx(
      `class PlaybackService extends Service {
         private readonly retries = this.field(0);
         private readonly audio = this.field<AudioContext | null>(null);
         private readonly router = this.service(RouterService);
       }
       class PlainStore { private retries = 0; }`,
      'require-tracked-service-fields'
    );
    expect(messages).toEqual([]);
  });
});

describe('theme-color enforcement', () => {
  it('rejects literal UI colors and allows token fallbacks', () => {
    expect(
      verify(
        `const styles = {
          bad: { background: '#172033' },
          good: { background: 'var(--wheel-stage, #172033)' }
        };`,
        'no-hardcoded-color'
      ).map((message) => message.ruleId)
    ).toEqual(['wheel/no-hardcoded-color']);
  });

  it('allows Canvas 2D paint properties and gradient stops', () => {
    expect(
      verify(
        `ctx.fillStyle = condition ? 'rgba(0, 255, 128, 0.35)' : '#ff00cc';
         ctx.strokeStyle = \`rgba(196, 214, 235, \${alpha})\`;
         ctx.shadowColor = '#0008';
         gradient.addColorStop(0, 'rgba(1, 0, 6, 0.92)');`,
        'no-hardcoded-color'
      )
    ).toEqual([]);
  });

  it('allows WebGL renderer color receivers', () => {
    expect(
      verify(
        `renderer.setClearColor('#10131c', 1);
         const color = new THREE.Color('#818cf8');
         const material = new MeshBasicMaterial({ color: '#34d399' });
         material.color.set('#f59e0b');`,
        'no-hardcoded-color'
      )
    ).toEqual([]);
  });

  it('does not exempt ordinary styles in a canvas component', () => {
    expect(
      verify(
        `const ctx = canvas.getContext('2d');
         ctx.fillStyle = '#172033';
         element.style.background = '#172033';
         const labelColor = '#172033';`,
        'no-hardcoded-color'
      ).map((message) => message.ruleId)
    ).toEqual(['wheel/no-hardcoded-color', 'wheel/no-hardcoded-color']);
  });

  it('accepts a written reason for non-paint color data', () => {
    expect(
      verify(
        `// wheel-color: identity hue comes from an external participant record
         const peerColor = '#818cf8';`,
        'no-hardcoded-color'
      )
    ).toEqual([]);
  });
});
