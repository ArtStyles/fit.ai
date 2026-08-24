const SWIPE_DISTANCE_PX = 88
const SWIPE_VELOCITY_PX_PER_SECOND = 650

export function shouldDismissNotificationSwipe(offsetX: number, velocityX: number): boolean {
  return offsetX <= -SWIPE_DISTANCE_PX || velocityX <= -SWIPE_VELOCITY_PX_PER_SECOND
}
