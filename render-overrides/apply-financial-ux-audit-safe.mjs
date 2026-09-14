import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('financial-ux-audit-safe: target missing');
const repo = process.cwd();
const original = path.join(repo, 'render-overrides', 'apply-financial-ux-audit.mjs');
let source = fs.readFileSync(original, 'utf8');

const tooSpecific = `    '<Badge>{group.count} viagem{group.count === 1 ? "" : "s"}</Badge>',\n`;
if (!source.includes(tooSpecific)) throw new Error('financial-ux-audit-safe: expected grouping marker missing');
source = source.replace(tooSpecific, `    'group.count',\n`);

const temp = path.join(os.tmpdir(), `financial-ux-audit-${Date.now()}.mjs`);
fs.writeFileSync(temp, source);
try {
  execFileSync(process.execPath, [temp, target], { cwd: repo, stdio: 'inherit' });
} finally {
  fs.rmSync(temp, { force: true });
}
