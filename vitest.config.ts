import { defineConfig } from 'vitest/config'
import tsconfigPaths   from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    environment: 'node',
    setupFiles:  ['./src/lib/ai/__tests__/setup.ts'],
    // Excluir archivos de Next.js (app/, pages/) que no son tests
    exclude:     [
      '**/node_modules/**',
      '**/.next/**',
      '**/.worktrees/**',
      '**/android/**/build/**',
      '**/tests/e2e/**',
    ],
  },
})
