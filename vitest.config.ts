import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@domain': path.resolve(__dirname, './src/domain'),
      '@worker': path.resolve(__dirname, './src/worker'),
      '@web': path.resolve(__dirname, './src/web'),
    },
  },
});
