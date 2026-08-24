// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal, splitProps, type JSX } from 'solid-js';
import { renderElement } from './renderElement';
import type { BaseUIComponentProps } from './types';

interface DemoState {
  checked: boolean;
}

type DemoProps = BaseUIComponentProps<'span', DemoState> & {
  checked?: boolean;
};

/** A minimal component built on renderElement, mimicking a real part. */
function Demo(props: DemoProps) {
  const state: DemoState = {
    get checked() {
      return props.checked ?? false;
    },
  };

  return renderElement('span', props, {
    state,
    props: [
      () => ({
        role: 'switch',
        'aria-checked': state.checked ? 'true' : 'false',
      }),
      props as Record<string, any>,
    ],
  });
}

describe('renderElement', () => {
  it('renders the default tag with state data-* attributes', () => {
    const { container } = render(() => <Demo checked />);
    const el = container.firstElementChild!;
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveAttribute('data-checked', '');
    expect(el).toHaveAttribute('aria-checked', 'true');
  });

  it('updates data-* attributes reactively without recreating the element', () => {
    const [checked, setChecked] = createSignal(false);
    const { container } = render(() => <Demo checked={checked()} />);
    const el = container.firstElementChild!;
    expect(el).not.toHaveAttribute('data-checked');

    setChecked(true);
    expect(container.firstElementChild).toBe(el);
    expect(el).toHaveAttribute('data-checked', '');
    expect(el).toHaveAttribute('aria-checked', 'true');

    setChecked(false);
    expect(el).not.toHaveAttribute('data-checked');
    expect(el).toHaveAttribute('aria-checked', 'false');
  });

  it('resolves class functions against state and merges with internal class', () => {
    const [checked, setChecked] = createSignal(false);
    const { container } = render(() => (
      <Demo checked={checked()} class={(state) => (state.checked ? 'on' : 'off')} />
    ));
    const el = container.firstElementChild!;
    expect(el).toHaveClass('off');
    setChecked(true);
    expect(el).toHaveClass('on');
    expect(el).not.toHaveClass('off');
  });

  it('supports `as` with a different tag', () => {
    const { container } = render(() => <Demo as="div" />);
    expect(container.firstElementChild!.tagName).toBe('DIV');
  });

  it('supports `as` with a component', () => {
    function MyButton(props: JSX.HTMLAttributes<HTMLButtonElement>) {
      return <button data-custom="" {...props} />;
    }
    const { getByRole } = render(() => <Demo as={MyButton} />);
    const el = getByRole('switch');
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('data-custom');
  });

  it('supports `asChild` with a children render function receiving reactive props', () => {
    const [checked, setChecked] = createSignal(false);
    const { container } = render(() => (
      <Demo checked={checked()} asChild>
        {(props) => <button {...props}>toggle</button>}
      </Demo>
    ));
    const el = container.firstElementChild!;
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('role', 'switch');
    expect(el).not.toHaveAttribute('data-checked');
    setChecked(true);
    expect(el).toHaveAttribute('data-checked', '');
  });

  it('forwards asChild props into a second renderElement-based component', () => {
    // Regression: the spread proxy's getOwnPropertyDescriptor trap must carry
    // a live `get` — Solid's splitProps/mergeProps clone descriptors rather
    // than indexing through the proxy, so a data-less descriptor made every
    // prop forwarded into a nested Base UI component resolve to undefined.
    const [checked, setChecked] = createSignal(false);
    const { container } = render(() => (
      <Demo checked={checked()} asChild>
        {(props) => {
          // splitProps clones via descriptors — the exact path that broke.
          const [, rest] = splitProps(props as DemoProps, ['asChild', 'children']);
          return (
            <Demo as="button" {...rest}>
              nested
            </Demo>
          );
        }}
      </Demo>
    ));
    const el = container.firstElementChild!;
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('role', 'switch');
    expect(el).toHaveAttribute('aria-checked', 'false');
    setChecked(true);
    expect(el).toHaveAttribute('aria-checked', 'true');
    expect(el).toHaveAttribute('data-checked', '');
  });

  it('defaults button tags to type="button"', () => {
    const { container } = render(() => <Demo as="button" />);
    expect(container.firstElementChild!).toHaveAttribute('type', 'button');
  });

  it('chains external event handlers after internal ones (external first)', () => {
    const order: string[] = [];
    function Clickable(props: BaseUIComponentProps<'button', {}>) {
      return renderElement('button', props, {
        props: [{ onClick: () => order.push('internal') }, props as Record<string, any>],
      });
    }
    const { getByRole } = render(() => (
      <Clickable onClick={() => order.push('external')} />
    ));
    getByRole('button').click();
    expect(order).toEqual(['external', 'internal']);
  });

  it('lets external handlers cancel internal ones via preventBaseUIHandler', () => {
    const internal = vi.fn();
    function Clickable(props: BaseUIComponentProps<'button', {}>) {
      return renderElement('button', props, {
        props: [{ onClick: internal }, props as Record<string, any>],
      });
    }
    const { getByRole } = render(() => (
      <Clickable onClick={(event: any) => event.preventBaseUIHandler()} />
    ));
    getByRole('button').click();
    expect(internal).not.toHaveBeenCalled();
  });

  it('composes refs from params and the consumer', () => {
    let consumerRef: HTMLElement | undefined;
    let internalRef: HTMLElement | undefined;
    function WithRef(props: BaseUIComponentProps<'span', {}>) {
      return renderElement('span', props, {
        ref: (el) => {
          internalRef = el;
        },
      });
    }
    render(() => (
      <WithRef
        ref={(el: HTMLElement) => {
          consumerRef = el;
        }}
      />
    ));
    expect(internalRef).toBeInstanceOf(HTMLElement);
    expect(consumerRef).toBe(internalRef);
  });

  it('unmounts when enabled is false and remounts when true', () => {
    const [enabled, setEnabled] = createSignal(true);
    function Conditional(props: BaseUIComponentProps<'span', {}>) {
      return renderElement('span', props, { enabled });
    }
    const { container } = render(() => <Conditional />);
    expect(container.firstElementChild).not.toBeNull();
    setEnabled(false);
    expect(container.firstElementChild).toBeNull();
    setEnabled(true);
    expect(container.firstElementChild).not.toBeNull();
  });

  it('passes injected params.children through to asChild consumers', () => {
    function WithInjected(props: BaseUIComponentProps<'div', {}>) {
      return renderElement('div', props, {
        children: () => <span data-testid="injected">sr-only</span>,
      });
    }
    const { getByTestId, container } = render(() => (
      <WithInjected asChild>{(props) => <section {...props} />}</WithInjected>
    ));
    expect(container.firstElementChild!.tagName).toBe('SECTION');
    expect(getByTestId('injected')).toBeInTheDocument();
  });

  it('renders children through to the element', () => {
    function Parent(props: BaseUIComponentProps<'div', {}>) {
      return renderElement('div', props, {});
    }
    const { container } = render(() => <Parent>hello</Parent>);
    expect(container.firstElementChild!).toHaveTextContent('hello');
  });
});
