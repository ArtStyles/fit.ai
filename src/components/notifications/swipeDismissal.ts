const SWIPE_DISTANCE_PX = 88
const SWIPE_VELOCITY_PX_PER_SECOND = 650

export function notificationDismissalMotion(reduceMotion: boolean | null) {
  return {
    initial: { opacity: 1, x: 0 },
    animate: { opacity: 1, x: 0 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, x: -180 },
    transition: { duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' as const },
  }
}

export function shouldDismissNotificationSwipe(offsetX: number, velocityX: number): boolean {
  return offsetX <= -SWIPE_DISTANCE_PX || velocityX <= -SWIPE_VELOCITY_PX_PER_SECOND
}
