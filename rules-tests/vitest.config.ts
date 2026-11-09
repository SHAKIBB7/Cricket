import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Standalone config for the Firestore rules tests (rules-tests/).
 * Run from the REPO ROOT via the firebase emulator — see README.md.
 * Kept separate from the app vitest config: no jsdom setup file, and
 * it only includes this folder.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['rules-tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
