import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { wheelDevTools } from 'wheel/vite';

export default defineConfig({
  resolve: { dedupe: ['solid-js'] },
  plugins: [solid(), wheelDevTools()],
  server: {
    proxy: {
      '/sync': {
        target: 'http://localhost:4795',
        ws: true
      }
    }
  }
});
