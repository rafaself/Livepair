import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/renderer/test/setup.ts'],
    env: {
      VITE_LIVE_MODEL: 'models/gemini-2.0-flash-exp',
      VITE_LIVE_API_VERSION: 'v1alpha',
      VITE_LIVE_VOICE_RESPONSE_MODALITY: 'AUDIO',
    },
    include: ['./src/**/*.test.ts?(x)'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts?(x)',
        'src/renderer/test/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
