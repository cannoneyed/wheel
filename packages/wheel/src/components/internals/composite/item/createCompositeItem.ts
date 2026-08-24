/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';
import { useCompositeRootContext } from '../root/CompositeRootContext';
import {
  createCompositeListItem,
  type CreateCompositeListItemParameters,
} from '../list/createCompositeListItem';
import type { HTMLProps } from '../../types';

export interface CreateCompositeItemParameters<Metadata>
  extends Pick<CreateCompositeListItemParameters<Metadata>, 'metadata' | 'indexGuessBehavior'> {}

export interface CreateCompositeItemReturnValue {
  /** Reactive thunk producing the roving-tabindex/focus/hover props for the item. */
  compositeProps: () => HTMLProps;
  /** Ref callback that must be attached to the item's DOM element. */
  compositeRef: (node: HTMLElement | null) => void;
  index: Accessor<number>;
}

/**
 * Solid port of upstream's `useCompositeItem`.
 */
export function createCompositeItem<Metadata>(
  params: CreateCompositeItemParameters<Metadata> = {},
): CreateCompositeItemReturnValue {
  const { highlightItemOnHover, highlightedIndex, onHighlightedIndexChange } =
    useCompositeRootContext();
  const { ref, index } = createCompositeListItem(params);

  let itemElement: HTMLElement | null = null;

  const compositeRef = (node: HTMLElement | null) => {
    itemElement = node;
    ref(node);
  };

  const isHighlighted = () => highlightedIndex() === index();

  const compositeProps = (): HTMLProps => ({
    tabIndex: isHighlighted() ? 0 : -1,
    onFocus() {
      onHighlightedIndexChange(index());
    },
    onMouseMove() {
      const item = itemElement;
      if (!highlightItemOnHover() || !item) {
        return;
      }

      const disabled = item.hasAttribute('disabled') || item.ariaDisabled === 'true';
      if (!isHighlighted() && !disabled) {
        item.focus();
      }
    },
  });

  return { compositeProps, compositeRef, index };
}
