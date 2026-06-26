export type FollowState = 'follow' | 'request' | 'requested' | 'following'

export function followButtonState(
  input: { isPrivate: boolean; status: 'none' | 'pending' | 'accepted' },
): FollowState {
  if (input.status === 'accepted') return 'following'
  if (input.status === 'pending') return 'requested'
  return input.isPrivate ? 'request' : 'follow'
}
