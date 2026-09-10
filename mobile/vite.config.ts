import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const original = (name: string) => fileURLToPath(new URL(`./src/original/${name}`, import.meta.url))
const personalActions = ['authorizeSession', 'saveSession', 'rescheduleWorkout', 'plan', 'generatePlan', 'adjustPlan', 'measurements', 'settings', 'readiness', 'avatar']
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [{
    name: 'original-app-local-boundaries',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './actions' && importer?.replaceAll('\\', '/').endsWith('/src/app/onboarding/OnboardingWizard.tsx')) return original('actions/onboarding.ts')
      if (importer && source.startsWith('.')) {
        const resolved = resolve(dirname(importer), source).replaceAll('\\', '/').replace(/\.tsx?$/, '')
        if (resolved.endsWith('/src/app/onboarding/actions')) return original('actions/onboarding.ts')
        if (resolved.endsWith('/src/lib/ai/real-coachGenerator') || resolved.endsWith('/src/lib/anthropic/client')) return original('server-boundary.ts')
      }
    },
    generateBundle(_options, bundle) {
      const modules = Object.values(bundle).flatMap(entry => entry.type === 'chunk' ? entry.moduleIds : []).map(id => id.replaceAll('\\', '/'))
      const forbidden = modules.filter(id =>
        id.endsWith('/src/app/onboarding/actions.ts') ||
        id.endsWith('/src/app/actions/companions.ts') ||
        personalActions.some(name => id.endsWith(`/src/app/actions/${name}.ts`)) ||
        /\/src\/lib\/(supabase\/service|anthropic\/client|ai\/real-coachGenerator)\.ts$/.test(id) ||
        /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:firebase-admin|@anthropic-ai\/sdk)\//.test(id),
      )
      if (forbidden.length) this.error(`Server dependency reached the Android bundle: ${forbidden.join(', ')}`)
    },
  }],
  resolve: { alias: [
    ...personalActions.map(name => ({ find: `@/app/actions/${name}`, replacement: original(`actions/${name}.ts`) })),
    ...['@/app/(auth)/actions', '@/app/actions/workspace', '@/app/actions/username', '@/app/actions/account'].map(find => ({ find, replacement: original('auxiliary-actions.ts') })),
    { find: '@/app/actions/notifications', replacement: original('notification-actions.ts') },
    { find: '@/app/actions/companions', replacement: original('companion-actions.ts') },
    { find: '@/lib/auth/server', replacement: original('auth-context.ts') },
    { find: '@/lib/coaching/clientSummary', replacement: original('coaching-summary.ts') },
    { find: '@/lib/supabase/server', replacement: original('bridge-client.ts') },
    { find: '@/lib/supabase/client', replacement: original('browser-client.ts') },
    { find: '@/lib/anthropic/client', replacement: original('server-boundary.ts') },
    ...['@/lib/supabase/service', '@/lib/notifications/product', '@/lib/notifications/socialPush', '@/lib/ai/real-coachGenerator', 'crypto', 'node:crypto'].map(find => ({ find, replacement: original('server-boundary.ts') })),
    { find: 'next/navigation', replacement: original('router.tsx') },
    { find: 'next/link', replacement: original('router.tsx') },
    { find: 'next/image', replacement: original('image.tsx') },
    { find: 'next/headers', replacement: original('platform.ts') },
    { find: 'next/cache', replacement: original('platform.ts') },
    { find: 'server-only', replacement: original('empty.ts') },
    { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
  ] },
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'production', NEXT_PUBLIC_COMMUNITY_ENABLED: 'false', NEXT_PUBLIC_LOCAL_APP: 'true' }) },
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
  preview: { host: '127.0.0.1', port: 4178, strictPort: true },
})
