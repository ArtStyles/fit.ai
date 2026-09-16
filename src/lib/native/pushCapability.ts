export function productPushAvailable(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_APP !== 'true' || process.env.NEXT_PUBLIC_PRODUCT_PUSH_AVAILABLE === 'true'
}
