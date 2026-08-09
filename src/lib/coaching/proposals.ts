export type ProposedAssignmentRow = { id: string; status: string; created_at: string }

/** Mirrors the database's created_at, id ordering for a stable client review. */
export function selectLatestProposedAssignment<T extends ProposedAssignmentRow>(assignments: T[] | null | undefined): T | undefined {
  return (assignments ?? [])
    .filter(assignment => assignment.status === 'proposed')
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))[0]
}
