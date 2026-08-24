/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '../../../base-utils/empty';
import { renderElement, type RenderElementComponentProps } from '../../renderElement';
import type { StateAttributesMapping } from '../../getStateAttributesProps';
import type { HTMLProps } from '../../types';
import { useDirection } from '../../direction-context/DirectionContext';
import { CompositeList, type CompositeMetadata } from '../list/CompositeList';
import { createCompositeRoot } from './createCompositeRoot';
import { CompositeRootContext, type CompositeRootContext as CompositeRootContextValue } from './CompositeRootContext';
import type { ModifierKey } from '../composite';
import type { CompositeGridNavigator } from './gridNavigation';

/**
 * @internal
 */
export function CompositeRoot<Metadata extends {}, State extends Record<string, any>>(
  componentProps: CompositeRoot.Props<Metadata, State>,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'refs',
    'props',
    'state',
    'stateAttributesMapping',
    'defaultClass',
    'slot',
    'highlightedIndex',
    'onHighlightedIndexChange',
    'orientation',
    'grid',
    'loopFocus',
    'onLoop',
    'enableHomeAndEndKeys',
    'onMapChange',
    'stopEventPropagation',
    'rootRef',
    'disabledIndices',
    'modifierKeys',
    'highlightItemOnHover',
    'tag',
  ]);

  const direction = useDirection();

  // Shared, mutable, index-ordered list of registered item elements — owned
  // here, mutated by `CompositeList`, read by the keyboard navigation logic.
  const elements: Array<HTMLElement | null> = [];

  const {
    props: defaultProps,
    highlightedIndex,
    onHighlightedIndexChange,
    onMapChange: onMapChangeUnwrapped,
    relayKeyboardEvent,
    rootRef,
  } = createCompositeRoot({
    grid: () => componentProps.grid,
    loopFocus: () => componentProps.loopFocus,
    onLoop: componentProps.onLoop,
    orientation: () => componentProps.orientation,
    highlightedIndex: () => componentProps.highlightedIndex,
    onHighlightedIndexChange: componentProps.onHighlightedIndexChange,
    rootRef: componentProps.rootRef,
    stopEventPropagation: () => componentProps.stopEventPropagation,
    enableHomeAndEndKeys: () => componentProps.enableHomeAndEndKeys,
    direction,
    disabledIndices: () => componentProps.disabledIndices,
    modifierKeys: () => componentProps.modifierKeys,
    elements,
  });

  const highlightItemOnHover = () => componentProps.highlightItemOnHover ?? false;

  const contextValue: CompositeRootContextValue = {
    highlightedIndex,
    onHighlightedIndexChange,
    highlightItemOnHover,
    relayKeyboardEvent,
  };

  return (
    <CompositeRootContext.Provider value={contextValue}>
      <CompositeList<Metadata>
        elements={elements}
        onMapChange={(newMap) => {
          componentProps.onMapChange?.(newMap);
          onMapChangeUnwrapped(newMap);
        }}
      >
        {renderElement(() => componentProps.tag ?? 'div', componentProps, {
          defaultClass: componentProps.defaultClass,
          slot: componentProps.slot,
          state: componentProps.state ?? (EMPTY_OBJECT as State),
          ref: [...(componentProps.refs ?? (EMPTY_ARRAY as [])), rootRef],
          props: [defaultProps, ...(componentProps.props ?? (EMPTY_ARRAY as [])), elementProps],
          stateAttributesMapping: componentProps.stateAttributesMapping,
        })}
      </CompositeList>
    </CompositeRootContext.Provider>
  );
}

export interface CompositeRootState {}

export interface CompositeRootProps<Metadata, State extends Record<string, any>>
  extends Pick<RenderElementComponentProps<State>, 'class' | 'style' | 'as' | 'asChild' | 'children'> {
  props?: Array<HTMLProps | (() => HTMLProps)> | undefined;
  defaultClass?: string | undefined;
  slot?: string | undefined;
  state?: State | undefined;
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  refs?: Array<(el: any) => void> | undefined;
  tag?: keyof JSX.IntrinsicElements | undefined;
  orientation?: 'horizontal' | 'vertical' | 'both' | undefined;
  grid?: CompositeGridNavigator | undefined;
  loopFocus?: boolean | undefined;
  onLoop?:
    | ((
        event: KeyboardEvent,
        prevIndex: number,
        nextIndex: number,
        elements: Array<HTMLElement | null>,
      ) => number)
    | undefined;
  highlightedIndex?: number | undefined;
  onHighlightedIndexChange?: ((index: number) => void) | undefined;
  enableHomeAndEndKeys?: boolean | undefined;
  onMapChange?: ((newMap: Map<Element, CompositeMetadata<Metadata> | null>) => void) | undefined;
  stopEventPropagation?: boolean | undefined;
  rootRef?: ((el: HTMLElement | null) => void) | undefined;
  disabledIndices?: number[] | undefined;
  modifierKeys?: ModifierKey[] | undefined;
  highlightItemOnHover?: boolean | undefined;
}

export namespace CompositeRoot {
  export type State = CompositeRootState;
  export type Props<Metadata, TState extends Record<string, any> = CompositeRootState> =
    CompositeRootProps<Metadata, TState>;
}
