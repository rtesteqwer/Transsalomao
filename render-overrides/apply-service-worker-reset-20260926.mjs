import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.argv[2] || '');
if (!target || !fs.existsSync(target)) throw new Error('Expected reconstructed application directory');

const publicDir = path.join(target, 'public');
fs.mkdirSync(publicDir, { recursive: true });

const sw = `const CACHE_PREFIX = "transsalomao-";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", () => {});
`;

fs.writeFileSync(path.join(publicDir, 'sw.js'), sw);
console.log('[service-worker-reset] public/sw.js installed');
