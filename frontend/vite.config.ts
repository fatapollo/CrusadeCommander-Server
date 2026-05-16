import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Honor a PORT assigned by the environment (e.g. the preview harness) so the
// dev server can be tunneled to; fall back to 5173 for plain local dev.
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    strictPort: Boolean(process.env.PORT),
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, secure: false },
    },
  },
});
