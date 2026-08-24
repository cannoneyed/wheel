/**
 * ContextMenuSystem's enumerated states — a menu open at a point (pointer
 * anchor) and closed. The registration is a hand-built record whose element
 * is detached — fine for the pointer anchor, which positions by coordinates.
 */
import { defineStates } from '../core/states';

import { ContextMenuSystem, connectContextMenuSystem } from './context-menu';

const menuContent = (
  <ul role="menu" style={{ margin: '0', padding: '4px 0', 'list-style': 'none' }}>
    <li role="menuitem" style={{ padding: '4px 14px' }}>
      Rename
    </li>
    <li role="menuitem" style={{ padding: '4px 14px' }}>
      Duplicate
    </li>
    <li role="menuitem" style={{ padding: '4px 14px', color: 'var(--wheel-danger-deep, #b91c1c)' }}>
      Delete
    </li>
  </ul>
);

const registration = {
  id: 'card:demo',
  element: typeof document === 'undefined' ? (null as never) : document.createElement('div'),
  render: () => menuContent,
  anchor: 'pointer' as const,
  owner: null,
  declaredAt: 'context-menu.states.tsx'
};

/** ContextMenuSystem states: a three-item menu open at a point, and closed. */
export default defineStates({
  name: 'ContextMenuSystem',
  component: ContextMenuSystem,
  connection: connectContextMenuSystem,
  states: {
    'open at pointer': {
      note: 'three items anchored at (160, 120)',
      shape: {
        openId: 'card:demo',
        anchorPoint: { x: 160, y: 120 },
        close: () => {},
        registrationOf: () => registration,
        enterOverlay: () => () => {},
        trapOverlayTab: () => false
      }
    },
    closed: {
      note: 'renders nothing',
      shape: {
        openId: null,
        anchorPoint: null,
        close: () => {},
        registrationOf: () => undefined,
        enterOverlay: () => () => {},
        trapOverlayTab: () => false
      }
    }
  }
});
