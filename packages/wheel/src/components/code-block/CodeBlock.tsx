/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; repeated alias comments hide that contract. */
import { splitProps, type JSX } from 'solid-js';
import { renderElement } from '../internals/renderElement';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types';

/** Displays a highlighted or plain source block without owning a syntax engine. */
export function CodeBlock(componentProps: CodeBlock.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'code',
    'highlightedHtml',
    'label',
    'language',
    'wrap',
  ]);

  const language = () => componentProps.language;
  const wrap = () => componentProps.wrap ?? false;
  const state: CodeBlock.State = {
    get language() {
      return language();
    },
    get wrap() {
      return wrap();
    },
  };

  return renderElement('pre', componentProps, {
    defaultClass: 'wheel-CodeBlock',
    slot: 'code-block',
    state,
    props: [
      () => ({
        'aria-label': componentProps.label,
        'data-language': language(),
        'data-wrap': wrap() ? '' : undefined,
      }),
      elementProps as HTMLProps,
    ],
    children: () => (
      <Code
        code={componentProps.code}
        highlightedHtml={componentProps.highlightedHtml}
        language={language()}
      />
    ),
  });
}

/** Displays an inline code token, with optional trusted syntax-token markup. */
export function Code(componentProps: Code.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'code',
    'highlightedHtml',
    'language',
  ]);

  const language = () => componentProps.language;
  const state: Code.State = {
    get language() {
      return language();
    },
  };

  return renderElement('code', componentProps, {
    defaultClass: 'wheel-Code',
    slot: 'code',
    state,
    props: [
      () => ({
        'data-language': language(),
        innerHTML: componentProps.highlightedHtml,
      }),
      elementProps as HTMLProps,
    ],
    children: () => componentProps.highlightedHtml === undefined ? componentProps.code : undefined,
  });
}

export interface CodeBlockState {
  readonly language: string | undefined;
  readonly wrap: boolean;
}

export interface CodeBlockProps
  extends Omit<BaseUIComponentProps<'pre', CodeBlockState>, 'children'> {
  /** Plain source preserved as accessible text and as the fallback when no token markup is given. */
  code: string;
  /** Trusted syntax-token HTML generated from `code`. */
  highlightedHtml?: string | undefined;
  /** Accessible name for the source block. */
  label?: string | undefined;
  /** Language identifier exposed for inspection. */
  language?: string | undefined;
  /** Whether long lines wrap instead of scrolling horizontally. @default false */
  wrap?: boolean | undefined;
}

export interface CodeState {
  readonly language: string | undefined;
}

export interface CodeProps extends Omit<BaseUIComponentProps<'code', CodeState>, 'children'> {
  /** Plain inline source. */
  code: string;
  /** Trusted syntax-token HTML generated from `code`. */
  highlightedHtml?: string | undefined;
  /** Language identifier exposed for inspection. */
  language?: string | undefined;
}

export namespace CodeBlock {
  export type Props = CodeBlockProps;
  export type State = CodeBlockState;
}

export namespace Code {
  export type Props = CodeProps;
  export type State = CodeState;
}
