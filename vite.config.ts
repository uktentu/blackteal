import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built bundle works on any static host (Vercel/Netlify/subpath).
  base: './',
  test: {
    // The simulator and rule engine are pure — no DOM needed to test the graded logic.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
