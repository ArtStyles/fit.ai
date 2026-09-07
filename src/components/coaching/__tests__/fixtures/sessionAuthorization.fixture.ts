// These presentation-only fixtures never release a real workout authorization.
// Fail explicitly if a new interaction crosses that server-action boundary.
export async function releaseSessionAuthorization(): Promise<never> {
  throw new Error('Workout authorization release is outside the accessibility fixture.')
}
