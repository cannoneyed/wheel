/**
 * Release warning shown above every human documentation page. Both docs
 * shells render this component, so the warning cannot drift between the
 * standalone docs build and wheel.dev/docs.
 */
import { viewRoot } from 'wheel/core';

export function AlphaBanner() {
  return (
    <aside
      use:viewRoot={'AlphaBanner'}
      class="aside warning alpha-banner"
      aria-label="Alpha software warning"
    >
      <span class="aside-label">Alpha software</span>
      <p>
        Wheel is in active v0 development. APIs and stored data formats can change between
        releases. Pin an exact version and test upgrades before deployment.
      </p>
    </aside>
  );
}
