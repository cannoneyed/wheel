/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { FloatingDelayGroup } from '../../floating-ui-solid';
import { TooltipProviderContext } from './TooltipProviderContext';

/**
 * Provides a shared delay for multiple tooltips. The grouping logic ensures that
 * once a tooltip becomes visible, the adjacent tooltips will be shown instantly.
 *
 * Documentation: [Base UI Tooltip](https://base-ui.com/react/components/tooltip)
 */
export function TooltipProvider(props: TooltipProvider.Props): JSX.Element {
  const timeout = () => props.timeout ?? 400;

  // Getters keep the context value live without needing a signal — descendants read
  // `providerContext.delay`/`closeDelay` directly (see CONVENTIONS.md #3).
  const contextValue: TooltipProviderContext = {
    get delay() {
      return props.delay;
    },
    get closeDelay() {
      return props.closeDelay;
    },
  };

  return (
    <TooltipProviderContext.Provider value={contextValue}>
      <FloatingDelayGroup
        delay={() => ({ open: props.delay, close: props.closeDelay })}
        timeoutMs={timeout}
      >
        {props.children}
      </FloatingDelayGroup>
    </TooltipProviderContext.Provider>
  );
}

export interface TooltipProviderState {}

export interface TooltipProviderProps {
  children?: JSX.Element;
  /**
   * How long to wait before opening the tooltip on hover. Specified in milliseconds.
   */
  delay?: number | undefined;
  /**
   * How long to wait before closing a tooltip. Specified in milliseconds.
   */
  closeDelay?: number | undefined;
  /**
   * Another tooltip will open instantly if the previous tooltip
   * is closed within this timeout. Specified in milliseconds.
   * @default 400
   */
  timeout?: number | undefined;
}

export namespace TooltipProvider {
  export type State = TooltipProviderState;
  export type Props = TooltipProviderProps;
}
