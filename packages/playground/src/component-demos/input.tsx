/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { Input } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleInput() {
  return (
    <label style={{ display: 'flex', 'flex-direction': 'column', 'align-items': 'flex-start', gap: '0.25rem' }}>
      <span style={{ 'font-size': 'var(--wheel-component-text-base)', 'font-weight': 500 }}>Name</span>
      <Input placeholder="e.g. Colm Tuite" style={{ width: '10rem' }} />
    </label>
  );
}
