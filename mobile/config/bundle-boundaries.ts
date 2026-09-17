/** A compiled-module check, not a string scan of the emitted/minified bundle. */
export function findForbiddenMobileModules(modules: string[], personalActions: string[]): string[] {
  return modules.filter(raw => {
    const id = raw.replaceAll('\\', '/')
    return id.endsWith('/src/app/onboarding/actions.ts')
      || ['companions', 'trainerApplications', 'trainerProfile', 'chat', 'admin', 'adminTrainers', 'dashboardBanner', ...personalActions].some(name => id.endsWith(`/src/app/actions/${name}.ts`))
      || /\/src\/lib\/(?:mobile-api\/|auth\/(?:admin|adminOverview|adminTrainers)\.ts)/.test(id)
      || /\/src\/lib\/(supabase\/service|anthropic\/client|ai\/(?:real-coachGenerator|chatGenerator|mock-chatGenerator)|coaching\/trainerPhotoOwner)\.ts$/.test(id)
      || /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(?:firebase-admin|@anthropic-ai\/sdk)\//.test(id)
  })
}
