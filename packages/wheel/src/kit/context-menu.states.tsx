/**
 * ContextMenuSystem's enumerated states — a JSX menu open at a point
 * (pointer anchor), a data menu drawn stacked and as flyouts, and closed. The registration is a hand-built record whose element
 * is detached — fine for the pointer anchor, which positions by coordinates.
 */
import { defineStates } from '../core/states';

import { ContextMenuSystem, connectContextMenuSystem } from './context-menu';
import type { MenuLevel } from './menu-stack';

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

/** A data menu: slots split by dividers, a shortcut, a reason, a submenu. */
const level: MenuLevel = {
  title: 'Cell',
  items: [
    { id: 'clipboard.cut', label: 'Cut', shortcut: '⌘X', run: () => {} },
    { id: 'clipboard.copy', label: 'Copy', shortcut: '⌘C', run: () => {} },
    { id: 'clipboard.paste', label: 'Paste', shortcut: '⌘V', disabled: true, disabledReason: 'The clipboard is empty', run: () => {} },
    {
      id: 'submenu:insert',
      label: 'Insert',
      separatorBefore: true,
      submenu: {
        title: 'Insert',
        items: [
          { id: 'rows.above', label: 'Row above', run: () => {} },
          { id: 'rows.below', label: 'Row below', run: () => {} }
        ]
      }
    },
    { id: 'widget.approve', label: 'Approve', source: 'Image selector', separatorBefore: true, run: () => {} }
  ]
};

const dataRegistration = {
  id: 'cell:demo',
  element: typeof document === 'undefined' ? (null as never) : document.createElement('div'),
  level: () => level,
  label: 'Cell menu',
  anchor: 'pointer' as const,
  owner: null,
  declaredAt: 'context-menu.states.tsx'
};

const inert = {
  close: () => {},
  anchorElementOf: () => undefined,
  schedule: () => () => {},
  enterOverlay: () => () => {},
  trapOverlayTab: () => false
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
        openedAtElement: false,
        registrationOf: () => registration,
        ...inert
      }
    },
    'data menu, stacked': {
      note: 'a MenuService target: dividers between slots, shortcut text, a disabled reason, a runtime item with its source',
      props: { submenus: 'stacked' },
      shape: {
        openId: 'cell:demo',
        anchorPoint: { x: 160, y: 120 },
        openedAtElement: false,
        registrationOf: () => dataRegistration,
        ...inert
      }
    },
    'data menu, flyout': {
      note: 'the same data drawn with flyout submenus',
      props: { submenus: 'flyout' },
      shape: {
        openId: 'cell:demo',
        anchorPoint: { x: 160, y: 120 },
        openedAtElement: false,
        registrationOf: () => dataRegistration,
        ...inert
      }
    },
    closed: {
      note: 'renders nothing',
      shape: {
        openId: null,
        anchorPoint: null,
        openedAtElement: false,
        registrationOf: () => undefined,
        ...inert
      }
    }
  }
});
