// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Avatar } from './index';

type MockImage = {
  complete: boolean;
  naturalWidth: number;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  referrerPolicy: string;
  crossOrigin: string | null;
  sizes: string;
  src: string;
  srcset: string;
};

/**
 * When `completeOnSet` is true, simulates cached-image behavior: setting a
 * source immediately marks the image as complete before an async load event.
 */
function mockImageLoading({ completeOnSet = false, naturalWidth = 100 } = {}) {
  const OriginalImage = window.Image;
  const images: MockImage[] = [];

  window.Image = function MockImageCtor() {
    let srcValue = '';
    let srcSetValue = '';
    const obj: MockImage = {
      complete: false,
      naturalWidth: 0,
      onload: null,
      onerror: null,
      referrerPolicy: '',
      crossOrigin: null,
      sizes: '',
      get src() {
        return srcValue;
      },
      set src(value: string) {
        srcValue = value;
        if (completeOnSet) {
          obj.complete = true;
          obj.naturalWidth = naturalWidth;
        }
      },
      get srcset() {
        return srcSetValue;
      },
      set srcset(value: string) {
        srcSetValue = value;
        if (completeOnSet) {
          obj.complete = true;
          obj.naturalWidth = naturalWidth;
        }
      },
    };
    images.push(obj);
    return obj;
  } as unknown as typeof window.Image;

  return {
    images,
    restore() {
      window.Image = OriginalImage;
    },
  };
}

describe('<Avatar.Root />', () => {
  it('renders a span', () => {
    const { getByTestId } = render(() => <Avatar.Root data-testid="root" />);
    expect(getByTestId('root').tagName).toBe('SPAN');
  });

  it('shares size and shape with every rendered part', () => {
    const { getByTestId } = render(() => (
      <Avatar.Root size="xl" shape="rounded" data-testid="root">
        <Avatar.Fallback data-testid="fallback">AC</Avatar.Fallback>
      </Avatar.Root>
    ));

    for (const testId of ['root', 'fallback']) {
      expect(getByTestId(testId)).toHaveAttribute('data-size', 'xl');
      expect(getByTestId(testId)).toHaveAttribute('data-shape', 'rounded');
    }
  });
});

describe('<Avatar.Image />', () => {
  let restoreImage: () => void;

  beforeEach(() => {
    restoreImage = mockImageLoading({ completeOnSet: true }).restore;
  });

  afterEach(() => {
    restoreImage();
  });

  it('passes native image props to the rendered image', async () => {
    const { getByTestId } = render(() => (
      <Avatar.Root>
        <Avatar.Image
          crossOrigin="anonymous"
          data-testid="image"
          referrerPolicy="no-referrer"
          sizes="48px"
          src="avatar.png"
          srcSet="avatar.png 1x, avatar@2x.png 2x"
        />
      </Avatar.Root>
    ));

    await waitFor(() => {
      const image = getByTestId('image');
      expect(image).toHaveAttribute('crossorigin', 'anonymous');
      expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(image).toHaveAttribute('sizes', '48px');
      expect(image).toHaveAttribute('srcset', 'avatar.png 1x, avatar@2x.png 2x');
    });
  });

  it('shows the image immediately for a cached src', async () => {
    const { getByRole, queryByText } = render(() => (
      <Avatar.Root>
        <Avatar.Image src="https://example.com/cached-avatar.png" alt="Jane Doe" />
        <Avatar.Fallback>JD</Avatar.Fallback>
      </Avatar.Root>
    ));

    await waitFor(() => {
      expect(getByRole('img')).toHaveAttribute('src', 'https://example.com/cached-avatar.png');
    });
    expect(queryByText('JD')).toBe(null);
  });

  it('shows the image when only srcSet is provided', async () => {
    const { getByTestId, queryByText } = render(() => (
      <Avatar.Root>
        <Avatar.Image data-testid="image" sizes="48px" srcSet="avatar.png 1x" />
        <Avatar.Fallback>JD</Avatar.Fallback>
      </Avatar.Root>
    ));

    await waitFor(() => {
      expect(getByTestId('image')).toHaveAttribute('srcset', 'avatar.png 1x');
    });
    expect(queryByText('JD')).toBe(null);
  });

  describe('prop: onLoadingStatusChange', () => {
    it('fires when the image loads', async () => {
      restoreImage();
      const imageMock = mockImageLoading();
      restoreImage = imageMock.restore;
      const onLoadingStatusChange = vi.fn();

      render(() => (
        <Avatar.Root>
          <Avatar.Image src="avatar.png" onLoadingStatusChange={onLoadingStatusChange} />
        </Avatar.Root>
      ));

      await waitFor(() => {
        expect(onLoadingStatusChange).toHaveBeenCalledWith('loading');
      });

      imageMock.images.at(-1)?.onload?.();

      await waitFor(() => {
        expect(onLoadingStatusChange.mock.calls.map(([status]) => status)).toEqual([
          'loading',
          'loaded',
        ]);
      });
    });

    it('fires when the image errors', async () => {
      restoreImage();
      const imageMock = mockImageLoading();
      restoreImage = imageMock.restore;
      const onLoadingStatusChange = vi.fn();

      render(() => (
        <Avatar.Root>
          <Avatar.Image src="avatar.png" onLoadingStatusChange={onLoadingStatusChange} />
        </Avatar.Root>
      ));

      await waitFor(() => {
        expect(onLoadingStatusChange).toHaveBeenCalledWith('loading');
      });

      imageMock.images.at(-1)?.onerror?.();

      await waitFor(() => {
        expect(onLoadingStatusChange.mock.calls.map(([status]) => status)).toEqual([
          'loading',
          'error',
        ]);
      });
    });

    it('fires for cached image errors without emitting idle', async () => {
      restoreImage();
      const imageMock = mockImageLoading({ completeOnSet: true, naturalWidth: 0 });
      restoreImage = imageMock.restore;
      const onLoadingStatusChange = vi.fn();

      render(() => (
        <Avatar.Root>
          <Avatar.Image src="avatar.png" onLoadingStatusChange={onLoadingStatusChange} />
        </Avatar.Root>
      ));

      await waitFor(() => {
        expect(onLoadingStatusChange).toHaveBeenCalledWith('error');
      });

      expect(onLoadingStatusChange).not.toHaveBeenCalledWith('idle');
    });
  });
});

describe('<Avatar.Fallback />', () => {
  it('does not render once the image has loaded', async () => {
    const imageMock = mockImageLoading({ completeOnSet: true });

    const { queryByTestId } = render(() => (
      <Avatar.Root>
        <Avatar.Image src="avatar.png" />
        <Avatar.Fallback data-testid="fallback" />
      </Avatar.Root>
    ));

    await waitFor(() => {
      expect(queryByTestId('fallback')).toBe(null);
    });

    imageMock.restore();
  });

  it('renders when the image fails to load', async () => {
    // No `src`/`srcSet`: the loading-status probe resolves to `error` immediately.
    const { getByText } = render(() => (
      <Avatar.Root>
        <Avatar.Image />
        <Avatar.Fallback>AC</Avatar.Fallback>
      </Avatar.Root>
    ));

    await waitFor(() => {
      expect(getByText('AC')).not.toBe(null);
    });
  });

  it('shows the fallback again when a loaded image is removed', async () => {
    const imageMock = mockImageLoading({ completeOnSet: true });
    const [showImage, setShowImage] = createSignal(true);

    const { queryByTestId, getByTestId } = render(() => (
      <Avatar.Root>
        {showImage() && <Avatar.Image data-testid="image" src="avatar.png" />}
        <Avatar.Fallback data-testid="fallback">AC</Avatar.Fallback>
      </Avatar.Root>
    ));

    await waitFor(() => {
      expect(queryByTestId('fallback')).toBe(null);
    });
    expect(getByTestId('image')).not.toBe(null);

    setShowImage(false);

    await waitFor(() => {
      expect(getByTestId('fallback')).not.toBe(null);
    });
    expect(queryByTestId('image')).toBe(null);

    imageMock.restore();
  });

  it('keeps the fallback mounted and the image unmounted while the image is loading', async () => {
    // No `completeOnSet`, and `onload`/`onerror` are never invoked: the status stays 'loading'
    // indefinitely, so `Avatar.Image` never becomes visible.
    const imageMock = mockImageLoading();

    const { queryByTestId, getByTestId } = render(() => (
      <Avatar.Root>
        <Avatar.Image data-testid="image" src="avatar.png" />
        <Avatar.Fallback data-testid="fallback">AC</Avatar.Fallback>
      </Avatar.Root>
    ));

    await waitFor(() => {
      expect(getByTestId('fallback')).not.toBe(null);
    });
    expect(queryByTestId('image')).toBe(null);

    imageMock.restore();
  });

  describe('prop: delay', () => {
    it('shows the fallback when the delay has elapsed', () => {
      vi.useFakeTimers();
      try {
        const { queryByText } = render(() => (
          <Avatar.Root>
            <Avatar.Image />
            <Avatar.Fallback delay={100}>AC</Avatar.Fallback>
          </Avatar.Root>
        ));

        expect(queryByText('AC')).toBe(null);

        vi.advanceTimersByTime(100);

        expect(queryByText('AC')).not.toBe(null);
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows the fallback immediately when delay is 0', () => {
      const { queryByText } = render(() => (
        <Avatar.Root>
          <Avatar.Image />
          <Avatar.Fallback delay={0}>AC</Avatar.Fallback>
        </Avatar.Root>
      ));

      // No timers are advanced: `delay={0}` must render synchronously on mount.
      expect(queryByText('AC')).not.toBe(null);
    });

    it('keeps the fallback visible across a number -> undefined -> number delay change', () => {
      vi.useFakeTimers();
      try {
        const [delay, setDelay] = createSignal<number | undefined>(100);

        const { queryByText } = render(() => (
          <Avatar.Root>
            <Avatar.Image />
            <Avatar.Fallback delay={delay()}>AC</Avatar.Fallback>
          </Avatar.Root>
        ));

        // Fallback is hidden until the delay elapses.
        expect(queryByText('AC')).toBe(null);

        // Removing the delay before it elapses shows the fallback immediately.
        setDelay(undefined);
        expect(queryByText('AC')).not.toBe(null);

        // Restoring the delay must not re-hide the already-visible fallback.
        setDelay(100);
        expect(queryByText('AC')).not.toBe(null);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
