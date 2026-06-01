// @ts-nocheck
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
    forks: {
      singleFork: true,
    },
    threads: {
      singleThread: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
