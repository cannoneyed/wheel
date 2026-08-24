import { defineProject } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineProject({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    name: 'components',
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/vitest-setup.ts'],
    include: ['packages/wheel/src/components/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
