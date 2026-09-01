/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import type { JSX } from 'solid-js';
import { Menubar, Menu } from 'wheel/components';

// Wheel supplies the component recipe classes.
// Each Menu.Root's Trigger/Popup/Item reuse the Menu recipe's classes
// (wheel-Button, wheel-Menu-*) since Menubar just lays out ordinary menus in a row.
export default function ExampleMenubar() {
  return (
    <Menubar>
      <Menu.Root>
        <Menu.Trigger>File</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4}>
            <Menu.Popup>
              <Menu.Item onClick={handleClick('New')}>
                New
              </Menu.Item>
              <Menu.Item onClick={handleClick('Open')}>
                Open
              </Menu.Item>
              <Menu.Item onClick={handleClick('Save')}>
                Save
              </Menu.Item>

              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger>
                  Export
                  <CaretRightIcon />
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={-4} alignOffset={-4}>
                    <Menu.Popup>
                      <Menu.Item onClick={handleClick('PDF')}>
                        PDF
                      </Menu.Item>
                      <Menu.Item onClick={handleClick('PNG')}>
                        PNG
                      </Menu.Item>
                      <Menu.Item onClick={handleClick('SVG')}>
                        SVG
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>

              <Menu.Separator style={{ margin: '0.25rem 0' }} />
              <Menu.Item onClick={handleClick('Print')}>
                Print
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Menu.Root>
        <Menu.Trigger>Edit</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4}>
            <Menu.Popup>
              <Menu.Item onClick={handleClick('Cut')}>
                Cut
              </Menu.Item>
              <Menu.Item onClick={handleClick('Copy')}>
                Copy
              </Menu.Item>
              <Menu.Item onClick={handleClick('Paste')}>
                Paste
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Menu.Root>
        <Menu.Trigger>View</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4}>
            <Menu.Popup>
              <Menu.Item onClick={handleClick('Zoom In')}>
                Zoom In
              </Menu.Item>
              <Menu.Item onClick={handleClick('Zoom Out')}>
                Zoom Out
              </Menu.Item>

              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger>
                  Layout
                  <CaretRightIcon />
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner sideOffset={-4} alignOffset={-4}>
                    <Menu.Popup>
                      <Menu.Item onClick={handleClick('Single Page')}>
                        Single Page
                      </Menu.Item>
                      <Menu.Item onClick={handleClick('Two Pages')}>
                        Two Pages
                      </Menu.Item>
                      <Menu.Item onClick={handleClick('Continuous')}>
                        Continuous
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>

              <Menu.Separator style={{ margin: '0.25rem 0' }} />
              <Menu.Item onClick={handleClick('Full Screen')}>
                Full Screen
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <Menu.Root disabled>
        <Menu.Trigger>Help</Menu.Trigger>
      </Menu.Root>
    </Menubar>
  );
}

function handleClick(label: string) {
  return () => {
    void label;
  };
}

function CaretRightIcon(props: JSX.IntrinsicElements['svg']) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
      style={{ display: 'block', ...(typeof props.style === 'object' ? props.style : {}) }}
    >
      <path d="M6 12V4l4.5 4z" />
    </svg>
  );
}
