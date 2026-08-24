/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { Accessor } from 'solid-js';
import type { HTMLProps } from '../../internals/types';
import { createButton } from '../../internals/use-button/createButton';
import { mergeProps } from '../../merge-props/mergeProps';
import type { MenuStore } from '../store/MenuStore';
import { createMenuItemCommonProps } from './createMenuItemCommonProps';

export type UseMenuItemMetadata =
  | { type: 'regular-item' }
  | { type: 'submenu-trigger'; setActive: () => void };

export const REGULAR_ITEM: UseMenuItemMetadata = { type: 'regular-item' };

export interface CreateMenuItemParameters {
  closeOnClick: Accessor<boolean>;
  disabled: Accessor<boolean>;
  highlighted: Accessor<boolean>;
  id: Accessor<string | undefined>;
  nativeButton: Accessor<boolean>;
  itemMetadata: UseMenuItemMetadata;
  nodeId: string | undefined;
  store: MenuStore<any>;
  typingRef?: { current: boolean } | undefined;
}

export interface CreateMenuItemReturnValue {
  getItemProps: (externalProps: HTMLProps) => HTMLProps;
  itemRef: (el: HTMLElement) => void;
}

/**
 * Composes button semantics with the shared item props into a single `getItemProps` resolver.
 * Solid port of upstream's `useMenuItem`.
 */
export function createMenuItem(params: CreateMenuItemParameters): CreateMenuItemReturnValue {
  const rootDisabled = params.store.useState('disabled');
  const disabled = () => params.disabled() || rootDisabled();

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled: () => true,
    native: params.nativeButton,
    composite: () => true,
  });

  const commonProps = createMenuItemCommonProps({
    closeOnClick: params.closeOnClick,
    highlighted: params.highlighted,
    id: params.id,
    nodeId: params.nodeId,
    store: params.store,
    typingRef: params.typingRef,
  });

  function getItemProps(externalProps: HTMLProps): HTMLProps {
    return mergeProps(
      commonProps,
      {
        onMouseEnter() {
          if (params.itemMetadata.type === 'submenu-trigger') {
            params.itemMetadata.setActive();
          }
        },
      },
      externalProps,
      getButtonProps,
    );
  }

  return { getItemProps, itemRef: buttonRef };
}
