export interface PlanLibraryQueryResult<T> {
  data: T | null
  error: { message?: string } | null
}

export function requirePlanLibraryResults<TActive, TPlan>(
  activeResult: PlanLibraryQueryResult<TActive>,
  libraryResult: PlanLibraryQueryResult<TPlan[]>,
): { activePlan: TActive | null; plans: TPlan[] } {
  const queryError = activeResult.error ?? libraryResult.error
  if (queryError) {
    throw new Error(`PLAN_LIBRARY_QUERY_FAILED: ${queryError.message ?? 'unknown database error'}`)
  }

  return {
    activePlan: activeResult.data,
    plans: libraryResult.data ?? [],
  }
}
