/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { Separator } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleSeparator() {
  return (
    <div style={{ display: 'flex', gap: '1rem', 'text-wrap': 'nowrap' }}>
      <a href="#" style={{ 'font-size': '0.875rem' }}>
        Home
      </a>
      <a href="#" style={{ 'font-size': '0.875rem' }}>
        Pricing
      </a>
      <a href="#" style={{ 'font-size': '0.875rem' }}>
        Blog
      </a>
      <a href="#" style={{ 'font-size': '0.875rem' }}>
        Support
      </a>

      <Separator orientation="vertical" />

      <a href="#" style={{ 'font-size': '0.875rem' }}>
        Log in
      </a>
      <a href="#" style={{ 'font-size': '0.875rem' }}>
        Sign up
      </a>
    </div>
  );
}
