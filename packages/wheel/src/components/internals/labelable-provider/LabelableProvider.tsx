/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, type JSX } from 'solid-js';
import { createBaseUiId } from '../createBaseUiId';
import type { HTMLProps } from '../types';
import { LabelableContext, useLabelableContext, type LabelableContext as LabelableContextType } from './LabelableContext';

/**
 * @internal
 * Solid port of upstream's `LabelableProvider`.
 */
export function LabelableProvider(props: LabelableProvider.Props): JSX.Element {
  const parent = useLabelableContext();
  const defaultId = createBaseUiId();

  const [controlId, setControlIdState] = createSignal<string | null | undefined>(
    props.controlId === undefined ? defaultId() : props.controlId,
  );
  const [labelId, setLabelId] = createSignal<string | undefined>(props.labelId);
  const [messageIds, setMessageIdsState] = createSignal<string[]>([]);

  const registrations = new Map<symbol, string | null>();

  const registerControlId = (source: symbol, nextId: string | null | undefined) => {
    if (nextId === undefined) {
      registrations.delete(source);
      return;
    }

    registrations.set(source, nextId);

    // Only flush when registering, not when unregistering. This prevents loops during rapid
    // unmount/remount cycles. The next registration will pick up the correct state.
    setControlIdState((prev) => {
      if (registrations.size === 0) {
        return undefined;
      }

      let nextControlId: string | null | undefined;

      for (const id of registrations.values()) {
        if (prev !== undefined && id === prev) {
          return prev;
        }

        if (nextControlId === undefined) {
          nextControlId = id;
        }
      }

      return nextControlId;
    });
  };

  const setMessageIds = (updater: (prev: string[]) => string[]) => {
    setMessageIdsState(updater);
  };

  const getDescriptionProps = (externalProps: HTMLProps): HTMLProps => {
    const ids = externalProps['aria-describedby']
      ? (externalProps['aria-describedby'] as string).split(' ')
      : [];
    ids.push(...parent.messageIds(), ...messageIds());

    return {
      ...externalProps,
      'aria-describedby': Array.from(new Set(ids)).join(' ') || undefined,
    };
  };

  const contextValue: LabelableContextType = {
    controlId,
    registerControlId,
    labelId,
    setLabelId,
    messageIds,
    setMessageIds,
    getDescriptionProps,
  };

  return (
    <LabelableContext.Provider value={contextValue}>{props.children}</LabelableContext.Provider>
  );
}

export interface LabelableProviderProps {
  controlId?: string | null | undefined;
  labelId?: string | undefined;
  children?: JSX.Element;
}

export namespace LabelableProvider {
  export type Props = LabelableProviderProps;
}
