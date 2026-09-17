import { RETIRED_WEB_CACHES } from '@/lib/marketing/webCache'
/** Same URL as the former PWA worker so installed copies can retire themselves. */
export function GET() {
  return new Response(`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  const retired = ${JSON.stringify(RETIRED_WEB_CACHES)};
  await Promise.all(names.filter(name => retired.includes(name) || /^(workbox-|next-pwa)/.test(name)).map(name => caches.delete(name)));
  await self.registration.unregister();
  const windows = await self.clients.matchAll({ type: 'window' });
  await Promise.all(windows.map(client => client.navigate(client.url)));
})()));`, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' } })
}
