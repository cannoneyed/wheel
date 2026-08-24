/**
 * The catalog, standalone. wheel.dev serves the same `ComponentAudit` under
 * the site's own theme (packages/website/src/components-main.tsx); this entry
 * is the bare version for local review.
 *
 * `wheel/styles` comes first and is not optional: the sheet below reads the
 * theme aliases (`--wheel-ink`, `--wheel-bg`, `--wheel-sans`) that file
 * defines, and they are what flip on `<html data-theme>`.
 */
import { render } from 'solid-js/web';

import 'wheel/styles';
import 'wheel/components/styles';
import './component-audit.css';
import { ComponentAudit } from './component-audit';

render(() => <ComponentAudit />, document.getElementById('root')!);
