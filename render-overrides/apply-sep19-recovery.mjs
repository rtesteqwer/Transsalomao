import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('sep19-recovery: target missing');

const repo = process.cwd();
const source = path.join(repo, 'render-overrides', '0011_repair_sep19_driver_accepts.sql');
const destination = path.join(target, 'migrations', '0011_repair_sep19_driver_accepts.sql');

if (!fs.existsSync(source)) throw new Error('sep19-recovery: SQL migration missing');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log('[sep19-recovery] safe recovery migration installed');
