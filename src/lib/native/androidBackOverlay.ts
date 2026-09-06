export const OPEN_RADIX_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(', ')

export function dismissOpenRadixOverlay(root: Document = document): boolean {
  if (!root.querySelector(OPEN_RADIX_OVERLAY_SELECTOR)) return false
  root.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  }))
  return true
}
