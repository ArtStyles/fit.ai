import { defineConfig } from 'vitest/config'
import tsconfigPaths   from 'vite-tsconfig-paths'

const baseExclude = [
  '**/node_modules/**',
  '**/.next/**',
  '**/.worktrees/**',
  '**/android/**/build/**',
  '**/tests/e2e/**',
]

const browserFixtureTests = [
  'src/components/coaching/__tests__/applicationForm.test.tsx',
  'src/components/coaching/__tests__/coachInsightsAnalytics.test.ts',
  'src/components/coaching/__tests__/coachingRequestForm.test.tsx',
  'src/components/coaching/__tests__/coachingContextAcceptance.test.tsx',
  'src/components/coaching/__tests__/consentManager.test.tsx',
  'src/components/coaching/__tests__/programTemplateEditor.test.tsx',
  'src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts',
  'src/components/coaching/__tests__/trainerAssignmentUi.test.tsx',
  'src/components/dashboard/__tests__/SecondaryMetricsResponsive.test.tsx',
  'src/components/dashboard/__tests__/MusicNowPlayingResponsive.test.tsx',
  'src/components/settings/__tests__/MusicIntegrationSettingsInteraction.test.tsx',
  'src/lib/native/__tests__/useNowPlayingSessionInteraction.test.tsx',
  'src/components/plan/__tests__/planInteractions.test.tsx',
  'src/components/notifications/__tests__/dismissibleAttentionNoticeInteraction.test.tsx',
  'src/components/notifications/__tests__/notificationCenterInteraction.test.tsx',
  'src/components/notifications/__tests__/swipeDismissPlanNoticeInteraction.test.tsx',
  'src/components/navigation/__tests__/AccountWorkspaceResponsive.test.ts',
]

export default defineConfig({
  plugins: [tsconfigPaths()],
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          setupFiles: ['./src/lib/ai/__tests__/setup.ts'],
          exclude: [...baseExclude, ...browserFixtureTests],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'browser-fixtures',
          environment: 'node',
          setupFiles: ['./src/lib/ai/__tests__/setup.ts'],
          include: browserFixtureTests,
          exclude: baseExclude,
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 30_000,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
})
