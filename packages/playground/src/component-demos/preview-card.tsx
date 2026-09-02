/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { PreviewCard } from 'wheel/components';

// Wheel supplies the component recipe classes.
// The elevated popup deliberately has no arrow, matching the Popover exemplar.
export default function ExamplePreviewCard() {
  return (
    <PreviewCard.Root>
      <p style={{ margin: 0, 'text-wrap': 'balance' }}>
        The principles of good{' '}
        <PreviewCard.Trigger href="https://en.wikipedia.org/wiki/Typography">
          typography
        </PreviewCard.Trigger>{' '}
        remain in the digital age.
      </p>

      <PreviewCard.Portal>
        <PreviewCard.Positioner sideOffset={8}>
          <PreviewCard.Popup>
            <div
              style={{
                width: 'min-content',
                display: 'flex',
                'flex-direction': 'column',
                gap: '0.5rem',
                padding: '0.5rem',
              }}
            >
              <img
                width="224"
                height="150"
                style={{ display: 'block', 'max-width': 'none', 'border-radius': 'var(--wheel-component-radius-md)' }}
                src="https://images.unsplash.com/photo-1619615391095-dfa29e1672ef?q=80&w=448&h=300"
                alt="Station Hofplein signage in Rotterdam, Netherlands"
              />
              <p style={{ margin: 0, 'font-size': 'var(--wheel-component-text-sm)', 'line-height': 'var(--wheel-component-text-sm--lh)' }}>
                <strong>Typography</strong> is the art and science of arranging type to make written
                language clear, visually appealing, and effective in communication.
              </p>
            </div>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
