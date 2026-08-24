/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { onCleanup, onMount } from 'solid-js';
import { platform } from '../../base-utils/platform/index';
import { createTimeout } from '../../base-utils/createTimeout';

// Word Joiner is invisible and zero-width, so it forces a text mutation without shifting layout.
const LIVE_REGION_MARKER = '⁠';
// Safari VoiceOver needed roughly 200ms to reliably notice the initial polite live-region change.
export const INITIAL_LIVE_REGION_TEXT_MUTATION_RESET_DELAY = 200;

function findLastTextNode(root: HTMLElement): Text | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let lastTextNode: Text | null = null;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (textNode.nodeValue !== '') {
      lastTextNode = textNode;
    }
  }

  return lastTextNode;
}

/**
 * Solid port of upstream's `useInitialLiveRegionTextMutation`.
 *
 * Returns a ref-callback setter (rather than a React ref object) to plug into `renderElement`'s
 * `ref` array; the mutation runs once on mount for whichever element that ref lands on.
 */
export function createInitialLiveRegionTextMutation<T extends HTMLElement>(): (el: T | null) => void {
  const timeout = createTimeout();
  let root: T | null = null;

  onMount(() => {
    if (platform.os.ios || root == null) {
      return;
    }

    const textNode = findLastTextNode(root);
    if (textNode == null) {
      return;
    }

    const originalValue = textNode.nodeValue ?? '';
    const markedValue = `${originalValue}${LIVE_REGION_MARKER}`;
    textNode.nodeValue = markedValue;

    timeout.start(INITIAL_LIVE_REGION_TEXT_MUTATION_RESET_DELAY, () => {
      if (textNode.nodeValue === markedValue) {
        textNode.nodeValue = originalValue;
      }
    });

    onCleanup(() => {
      timeout.clear();
      if (textNode.nodeValue === markedValue) {
        textNode.nodeValue = originalValue;
      }
    });
  });

  return (el: T | null) => {
    root = el;
  };
}
