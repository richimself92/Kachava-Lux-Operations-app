import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['shared/**/*.test.ts', 'src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          environment: 'node',
          // Rules tests share emulator state; run files serially.
          fileParallelism: false,
          testTimeout: 20000,
        },
      },
      {
        test: {
          name: 'functions',
          include: ['tests/functions/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30000,
        },
      },
    ],
  },
});
