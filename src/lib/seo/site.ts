export const SITE_URL = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
)

export const absoluteUrl = (path: string) => new URL(path, SITE_URL).toString()
