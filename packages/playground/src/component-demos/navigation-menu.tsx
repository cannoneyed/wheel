/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { For, type JSX } from 'solid-js';
import { NavigationMenu } from 'wheel/components';

const overviewLinks = [
  {
    href: '/react/overview/quick-start',
    title: 'Quick Start',
    description: 'Install and assemble your first component.',
  },
  {
    href: '/react/overview/accessibility',
    title: 'Accessibility',
    description: 'Learn how we build accessible components.',
  },
  {
    href: '/react/overview/releases',
    title: 'Releases',
    description: 'See what’s new in the latest Base UI versions.',
  },
  {
    href: '/react/overview/about',
    title: 'About',
    description: 'Learn more about Base UI and our mission.',
  },
];

const handbookLinks = [
  {
    href: '/react/handbook/styling',
    title: 'Styling',
    description:
      'Base UI components can be styled with plain CSS, Tailwind CSS, CSS-in-JS, or CSS Modules.',
  },
  {
    href: '/react/handbook/animation',
    title: 'Animation',
    description:
      'Base UI components can be animated with CSS transitions, CSS animations, or JavaScript libraries.',
  },
  {
    href: '/react/handbook/composition',
    title: 'Composition',
    description:
      'Base UI components can be replaced and composed with your own existing components.',
  },
];

// Wheel supplies the component recipe classes.
export default function ExampleNavigationMenu() {
  return (
    <NavigationMenu.Root>
      <NavigationMenu.List>
        <NavigationMenu.Item>
          <NavigationMenu.Trigger data-testid="nav-overview">
            Overview
            <NavigationMenu.Icon>
              <CaretDownIcon />
            </NavigationMenu.Icon>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content>
            <ul
              style={{
                display: 'grid',
                'grid-template-columns': '1fr 1fr',
                'list-style': 'none',
                padding: 0,
                margin: 0,
              }}
            >
              <For each={overviewLinks}>{(item) => <LinkCard {...item} />}</For>
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>

        <NavigationMenu.Item>
          <NavigationMenu.Trigger data-testid="nav-handbook">
            Handbook
            <NavigationMenu.Icon>
              <CaretDownIcon />
            </NavigationMenu.Icon>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content>
            <ul
              style={{
                display: 'flex',
                'flex-direction': 'column',
                'max-width': '25rem',
                padding: 0,
                margin: 0,
                'list-style': 'none',
              }}
            >
              <For each={handbookLinks}>{(item) => <LinkCard {...item} />}</For>
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>

        <NavigationMenu.Item>
          <NavigationMenu.Link href="https://github.com/mui/base-ui">
            GitHub
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner
          data-testid="nav-positioner"
          sideOffset={10}
          collisionPadding={{ top: 5, bottom: 5, left: 20, right: 20 }}
          collisionAvoidance={{ side: 'none' }}
        >
          <NavigationMenu.Popup>
            <NavigationMenu.Arrow />
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function LinkCard(props: { href: string; title: string; description: string }) {
  return (
    <li>
      <NavigationMenu.Link href={props.href} style={{ display: 'block', padding: '0.5rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', 'font-size': 'var(--wheel-component-text-base)', 'font-weight': 500 }}>
          {props.title}
        </h3>
        <p style={{ margin: 0, 'font-size': 'var(--wheel-component-text-sm)', color: 'var(--wheel-component-fg-muted)' }}>
          {props.description}
        </p>
      </NavigationMenu.Link>
    </li>
  );
}

function CaretDownIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
      style={{ display: 'block', ...(typeof props.style === 'object' ? props.style : {}) }}
    >
      <path d="M12 6H4l4 4.5z" />
    </svg>
  );
}
