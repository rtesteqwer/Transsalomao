import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const target = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(target, 'src'))) throw new Error('Expected reconstructed application directory');
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'minimal-ui');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
for (const entry of manifest.files) {
  if (!entry.path.startsWith('src/') || entry.path.includes('..')) throw new Error('Invalid UI path');
  const destination = path.join(target, entry.path);
  const payload = fs.readFileSync(path.join(source, entry.path));
  const payloadHash = sha(payload);
  const current = fs.existsSync(destination) ? sha(fs.readFileSync(destination)) : null;
  if (current !== entry.before && current !== entry.after && current !== payloadHash) throw new Error(`Minimal UI baseline changed: ${entry.path}. Rebase the presentation layer before deploying.`);
}
for (const entry of manifest.files) {
  const destination = path.join(target, entry.path);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(source, entry.path), destination);
}
if (process.env.TRANS_UI_ONLY_DEPLOY === '1') {
  const packagePath = path.join(target, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const original = pkg.scripts.build;
  const suffix = ' && npm run db:migrate';
  if (!original.endsWith(suffix)) throw new Error('Unexpected build pipeline: cannot safely skip migrations');
  pkg.scripts.build = original.slice(0, -suffix.length);
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('[minimal-ui] Presentation-only release: database migrations and group-binding scripts will NOT run.');
}
console.log('[minimal-ui] Approved white/blue interface installed; business APIs, calculation functions and database schema unchanged.');
