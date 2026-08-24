/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '../../../base-utils/empty';
import { renderElement, type RenderElementComponentProps } from '../../renderElement';
import type { StateAttributesMapping } from '../../getStateAttributesProps';
import { createCompositeItem } from './createCompositeItem';

/**
 * @internal
 */
export function CompositeItem<Metadata, State extends Record<string, any>>(
  componentProps: CompositeItem.Props<Metadata, State>,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'state',
    'props',
    'refs',
    'metadata',
    'stateAttributesMapping',
    'defaultClass',
    'slot',
    'tag',
  ]);

  const { compositeProps, compositeRef } = createCompositeItem<Metadata>({
    metadata: () => componentProps.metadata,
  });

  return renderElement(() => componentProps.tag ?? 'div', componentProps, {
    defaultClass: componentProps.defaultClass,
    slot: componentProps.slot,
    state: componentProps.state ?? (EMPTY_OBJECT as State),
    ref: [...(componentProps.refs ?? (EMPTY_ARRAY as [])), compositeRef],
    props: [compositeProps, ...(componentProps.props ?? (EMPTY_ARRAY as [])), elementProps],
    stateAttributesMapping: componentProps.stateAttributesMapping,
  });
}

export interface CompositeItemState {}

export interface CompositeItemProps<Metadata, State extends Record<string, any>>
  extends Pick<RenderElementComponentProps<State>, 'class' | 'style' | 'as' | 'asChild' | 'children'> {
  metadata?: Metadata | undefined;
  defaultClass?: string | undefined;
  slot?: string | undefined;
  refs?: Array<(el: any) => void> | undefined;
  props?: Array<Record<string, any> | (() => Record<string, any>)> | undefined;
  state?: State | undefined;
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  tag?: keyof JSX.IntrinsicElements | undefined;
}

export namespace CompositeItem {
  export type State = CompositeItemState;
  export type Props<Metadata, TState extends Record<string, any> = CompositeItemState> =
    CompositeItemProps<Metadata, TState>;
}
