/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../../core/local-state';
import { createMemo, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../../internals/types';
import { CompositeRoot } from '../../internals/composite/root/CompositeRoot';
import type { CompositeMetadata } from '../../internals/composite/list/CompositeList';
import {
  ToolbarRootContext,
  type ToolbarRootContext as ToolbarRootContextValue,
} from './ToolbarRootContext';

/**
 * A container for grouping a set of controls, such as buttons, toggle groups, or menus.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export function ToolbarRoot(componentProps: ToolbarRoot.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'loopFocus',
    'orientation',
  ]);

  const disabled = () => componentProps.disabled ?? false;
  const loopFocus = () => componentProps.loopFocus ?? true;
  const orientation = (): Orientation => componentProps.orientation ?? 'horizontal';

  const [itemMap, setItemMap] = useSignal(
    new Map<Element, CompositeMetadata<ToolbarRoot.ItemMetadata> | null>(), 'itemMap');

  const disabledIndices = createMemo(() => {
    const output: number[] = [];
    for (const itemMetadata of itemMap().values()) {
      // Only items that are disabled and not focusable when disabled
      // are removed from roving focus.
      if (
        itemMetadata?.index != null &&
        itemMetadata.disabled &&
        !itemMetadata.focusableWhenDisabled
      ) {
        output.push(itemMetadata.index);
      }
    }
    return output;
  });

  const toolbarRootContext: ToolbarRootContextValue = {
    disabled,
    orientation,
    setItemMap,
  };

  const state: ToolbarRoot.State = {
    get disabled() {
      return disabled();
    },
    get orientation() {
      return orientation();
    },
  };

  const defaultProps = (): HTMLProps => ({
    'aria-orientation': orientation(),
    role: 'toolbar',
  });

  // The context Provider must wrap the actual rendered element (created inside
  // `CompositeRoot`) so that descendants — the toolbar items that read
  // `ToolbarRootContext` while rendering — see the context.
  return (
    <ToolbarRootContext.Provider value={toolbarRootContext}>
      <CompositeRoot<ToolbarRoot.ItemMetadata, ToolbarRoot.State>
        defaultClass="wheel-Toolbar-Root"
        slot="toolbar-root"
        tag="div"
        as={componentProps.as}
        asChild={componentProps.asChild}
        class={componentProps.class}
        style={componentProps.style}
        state={state}
        refs={componentProps.ref ? [componentProps.ref] : undefined}
        props={[defaultProps, elementProps as HTMLProps]}
        disabledIndices={disabledIndices()}
        loopFocus={loopFocus()}
        onMapChange={setItemMap}
        orientation={orientation()}
      >
        {componentProps.children}
      </CompositeRoot>
    </ToolbarRootContext.Provider>
  );
}

export interface ToolbarRootItemMetadata {
  disabled: boolean;
  focusableWhenDisabled: boolean;
}

export type ToolbarRootOrientation = Orientation;

export interface ToolbarRootState {
  /**
   * Whether the component is disabled.
   */
  disabled: boolean;
  /**
   * The component orientation.
   */
  orientation: ToolbarRoot.Orientation;
}

export interface ToolbarRootProps extends BaseUIComponentProps<'div', ToolbarRootState> {
  disabled?: boolean | undefined;
  /**
   * The orientation of the toolbar.
   * @default 'horizontal'
   */
  orientation?: ToolbarRoot.Orientation | undefined;
  /**
   * If `true`, using keyboard navigation will wrap focus to the other end of the toolbar once the end is reached.
   *
   * @default true
   */
  loopFocus?: boolean | undefined;
}

export namespace ToolbarRoot {
  export type ItemMetadata = ToolbarRootItemMetadata;
  export type Orientation = ToolbarRootOrientation;
  export type State = ToolbarRootState;
  export type Props = ToolbarRootProps;
}
