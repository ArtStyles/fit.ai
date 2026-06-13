export type Rect = { top: number; left: number; width: number; height: number }
export type MenuPlacement = 'above' | 'below'

export function movedBeyondTolerance(
  start: { x: number; y: number },
  current: { x: number; y: number },
  tolerance: number,
): boolean {
  return Math.abs(current.x - start.x) > tolerance || Math.abs(current.y - start.y) > tolerance
}

export function computeMenuPosition(args: {
  trigger: Rect
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  gap?: number
  margin?: number
}): { top: number; left: number; placement: MenuPlacement } {
  const { trigger, menuWidth, menuHeight, viewportWidth, viewportHeight } = args
  const gap = args.gap ?? 10
  const margin = args.margin ?? 8

  const belowTop = trigger.top + trigger.height + gap
  const fitsBelow = belowTop + menuHeight <= viewportHeight - margin
  const placement: MenuPlacement = fitsBelow ? 'below' : 'above'
  const top = placement === 'below'
    ? belowTop
    : Math.max(margin, trigger.top - gap - menuHeight)

  const centered = trigger.left + trigger.width / 2 - menuWidth / 2
  const left = Math.max(margin, Math.min(centered, viewportWidth - menuWidth - margin))

  return { top, left, placement }
}
