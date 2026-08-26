/* eslint-disable wheel/require-export-jsdoc -- This internal context mirrors the public group contract without repeating it. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { ButtonSize, ButtonVariant } from '../button/Button';
import type { Orientation } from '../internals/types';

export interface ButtonGroupContext {
  disabled: Accessor<boolean>;
  orientation: Accessor<Orientation>;
  size: Accessor<ButtonSize>;
  variant: Accessor<ButtonVariant>;
}

export const ButtonGroupContext = createContext<ButtonGroupContext | undefined>(undefined);

export function useButtonGroupContext() {
  return useContext(ButtonGroupContext);
}
