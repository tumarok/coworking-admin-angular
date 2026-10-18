import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Vite reads `paths` only from the tsconfig that includes the importing file; the server code
    // reaches the contract through the same alias the Angular app uses.
    alias: { '@shared': fileURLToPath(new URL('./src/app/shared', import.meta.url)) },
  },
  test: {
    name: 'server',
    environment: 'node',
    include: ['server/**/*.test.ts'],
  },
});
