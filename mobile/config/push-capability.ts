/** Client Firebase configuration only; never accepts or bundles a service key. */
export function hasAndroidPushConfiguration(input: unknown, packageName = 'com.fitai.app'): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const config = input as Record<string, any>
  if (config.type === 'service_account' || config.private_key || !/^\d+$/.test(String(config.project_info?.project_number ?? '')) || !config.project_info?.project_id) return false
  return Array.isArray(config.client) && config.client.some((client: any) => (
    client?.client_info?.android_client_info?.package_name === packageName
    && typeof client.client_info.mobilesdk_app_id === 'string' && /^1:\d+:android:[a-zA-Z0-9]+$/.test(client.client_info.mobilesdk_app_id)
    && Array.isArray(client.api_key) && client.api_key.some((key: any) => typeof key?.current_key === 'string' && key.current_key.trim().length > 0)
  ))
}
