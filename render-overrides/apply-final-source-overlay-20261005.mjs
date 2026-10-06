import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const work = process.argv[2];
if (!work || !fs.existsSync(work)) {
  throw new Error('Final source overlay: reconstructed work directory is required');
}

const repo = process.cwd();
const payloadPath = path.join(repo, 'render-overrides', 'final-source-overlay-20261005.tar.xz.b64');
if (!fs.existsSync(payloadPath)) {
  throw new Error('Final source overlay payload is missing');
}

const b64 = fs.readFileSync(payloadPath, 'utf8').trim();
const archive = Buffer.from(b64, 'base64');
const expectedHash = '740880b98f2640a5f8493163ab5980b850176f5c3e275b7183ce333f7e04cdb9';
const actualHash = crypto.createHash('sha256').update(archive).digest('hex');
if (actualHash !== expectedHash) {
  throw new Error(`Final source overlay hash mismatch: ${actualHash}`);
}

const archivePath = path.join(os.tmpdir(), `transsalomao-final-source-${process.pid}.tar.xz`);
fs.writeFileSync(archivePath, archive);
try {
  execFileSync('xz', ['-t', archivePath], { stdio: 'inherit' });
  execFileSync('tar', ['-xJf', archivePath, '-C', work], { stdio: 'inherit' });
} finally {
  fs.rmSync(archivePath, { force: true });
}

const forbidden = [
  'km_start',
  'km_end',
  'reports.km',
  'fuelings.km',
  'km_carreta',
  'odometer_km',
  'fleet_odometer_history',
];
const srcRoot = path.join(work, 'src');
const hits = [];
const visit = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      visit(full);
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const term of forbidden) {
      if (text.includes(term)) hits.push(`${path.relative(work, full)}: ${term}`);
    }
  }
};
visit(srcRoot);
if (hits.length) {
  throw new Error('Final source overlay still contains odometer references:\n' + hits.join('\n'));
}

console.log('[final-source-overlay] 51 corrected/no-odometer files applied and verified');
