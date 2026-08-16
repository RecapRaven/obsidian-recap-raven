import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL('./tests/mocks/obsidian.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/api/contract.ts',
        'src/api/recap-raven-client.ts',
        'src/api/recap-raven-error.ts',
        'src/api/obsidian-transport.ts',
        'src/import/import-service.ts',
        'src/import/session-identity.ts',
        'src/main.ts',
        'src/settings/settings.ts',
        'src/settings/settings-tab.ts',
        'src/ui/**/*.ts',
        'src/utils/**/*.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
      reporter: ['text', 'json-summary'],
    },
  },
});
