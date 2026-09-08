import { state } from './generatePlanReadinessActions.fixture'

const router = {
  replace: (href: string) => { state.navigation.push(href) },
  refresh: () => { state.refreshes += 1 },
}

export function useRouter() { return router }
