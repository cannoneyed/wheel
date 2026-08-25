# Wheel

Wheel is a local-first Solid application framework. One package exposes separate surfaces so clients only import the layers they use:

> **Alpha software:** Wheel is in active v0 development. APIs and stored data formats can change between releases. Pin an exact version and test upgrades before deployment.

```sh
bun add wheel@npm:@cannoneyed/wheel@0.1.0 solid-js
```

`wheel` is the local npm alias for `@cannoneyed/wheel`. The exact version keeps every Wheel surface on one release.

Install `better-sqlite3` separately when Node code calls `betterSqlite3Driver` or uses `wheel/testing`.

```ts
import { defineAuthenticator } from 'wheel/auth';
import { defineConfig, z } from 'wheel/config';
import { Service, connect } from 'wheel/core';
import { createWebSocketTransport, table, query, mutation } from 'wheel/sync';
import { createSyncServer } from 'wheel/sync/server';
import { createCloudflareSyncBackend } from 'wheel/sync/server/cloudflare';
import { DialogService, LayoutService } from 'wheel/kit';
import { Button, Dialog } from 'wheel/components';
import { createRouter } from 'wheel/router';
```

Import `wheel/components/styles` once to apply the default Mira zinc theme. Each of the 38 component families also has a deep entry such as `wheel/components/dialog`. Override `--wheel-component-*` tokens or the stable `wheel-*` part classes to customize the theme.

The remaining runtime entries are `wheel/debug` for development inspection, `wheel/testing` for deterministic sync tests, and `wheel/testing/playwright` for browser behavior harnesses. `wheel/vite` configures local development, and `wheel/eslint` exports the plain ESM lint plugin. `wheel/auth` defines provider-neutral server authentication contracts. `wheel/config` validates JSON boot sources; `wheel/router` owns typed application routing. `wheel/components/styles` is the component CSS entry.

npm publishes Wheel under the `alpha` tag.

See the [repository documentation](https://github.com/cannoneyed/wheel) for concepts, examples, and runtime support.
