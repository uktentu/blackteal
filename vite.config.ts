import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built bundle works on any static host (Vercel/Netlify/subpath).
  base: './',
  test: {
    // jsdom by default so component tests can run; the pure sim/rule tests are unaffected.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
