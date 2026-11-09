import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    // Firestore emulator rules tests live outside the app suite —
    // they need Java + the firebase emulator (see rules-tests/README.md).
    exclude: [...configDefaults.exclude, 'rules-tests/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
