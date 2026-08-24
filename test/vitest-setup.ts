import '@testing-library/jest-dom/vitest';

// jsdom does not provide PointerEvent. Component tests dispatch pointer events.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  Object.defineProperty(window, 'PointerEvent', { value: window.MouseEvent });
}
