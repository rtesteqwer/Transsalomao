import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';

const cwd = process.cwd();
const repo = fs.existsSync(path.join(cwd, 'deploy')) ? cwd : path.resolve(cwd, '..');
const deploy = path.join(repo, 'deploy');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'transsalomao-build-'));

function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function read(rel) { return fs.readFileSync(path.join(deploy, rel), 'utf8'); }
function layer(parts, b64Hash, xzHash, xzSize, name) {
  const b64 = parts.map((p) => typeof p === 'string' ? read(p) : read(p.file).slice(0, p.take)).join('');
  if (sha(b64) !== b64Hash) throw new Error(`${name}: base64 hash mismatch`);
  const xz = Buffer.from(b64, 'base64');
  if (xz.length !== xzSize || sha(xz) !== xzHash) throw new Error(`${name}: xz hash mismatch`);
  const archive = path.join(os.tmpdir(), `${name}-${Date.now()}.tar.xz`);
  fs.writeFileSync(archive, xz);
  execFileSync('xz', ['-t', archive], { stdio: 'inherit' });
  execFileSync('tar', ['-xJf', archive, '-C', work], { stdio: 'inherit' });
}

layer([
  'release-exact-20260911/part-00.txt','release-exact-20260911/part-01.txt','release-exact-20260911/part-02.txt','release-exact-20260911/part-03.txt','release-exact-20260911/part-04.txt','release-exact-20260911/part-05a.txt','release-exact-20260911/part-05b.txt','release-exact-20260911/part-05c.txt','release-exact-20260911/part-06.txt','release-exact-20260911/part-07.txt','release-exact-20260911/part-08.txt','release-exact-20260911/part-09.txt','release-exact-20260911/part-10.txt','release-exact-20260911/part-11a.txt',{file:'release-exact-20260911/part-11b.txt',take:5000},'release-exact-20260911/part-11c.txt','release-exact-20260911/part-12a.txt','release-exact-20260911/part-12b.txt'
], '8135125e22be35abc6c8269aa2b9262982e0b3a016759e30d7a33b5495440fab', '5e82558aae1e340041952bacfe7e34ccbd25d779a8ff8ad167cefd3c4c609272', 141284, 'base');

layer([
  'reform-20260911-viagens-kml/part-00.txt','reform-20260911-viagens-kml/part-01.txt','reform-20260911-viagens-kml/part-02.txt','reform-20260911-viagens-kml/part-03.txt','reform-20260911-viagens-kml/part-04.txt','reform-20260911-viagens-kml/part-05.txt','reform-20260911-viagens-kml/part-06.txt'
], '6cbf727ad86e43397d70344a2dc553e06d7c4f9c7397c0a919ea9e170e6fb9ae', 'bd0173a9b373c4883d3e6593928e9e785ac5e98b07f511fa94bb9e16f872be30', 23384, 'reform');

layer(['reform-fix2-20260911/part-00.txt','reform-fix2-20260911/part-01.txt','reform-fix2-20260911/part-02.txt'], '19307bcf4c0e772c7acc73321b05331a2e3a1757140f2c92e736299a72274803', '7db6a17595058a84d39f68328c5e741d3149c8cc636e6d60ba90ea36586c3aeb', 9356, 'fix2');

layer(['reform-final2-20260911/part-00.txt','reform-final2-20260911/part-01.txt','reform-final2-20260911/part-02.txt','reform-final2-20260911/part-03.txt'], 'af9d4bc77acbc9618017c6370a4875c30f5b30638be935c9960cc85c2930d0af', '2c6d85831cfd378c249f007ca20c5aba255fe004d0bf4d10a0e9b6bf2b09fb36', 21968, 'final2');

layer([
  'update-20260913/part-00.txt','update-20260913/part-01.txt','update-20260913/part-02.txt','update-20260913/part-03.txt','update-20260913/part-04.txt','update-20260913/part-05.txt'
], 'f5d879ae93a307e6d1268e3dd8c129402ba407998f72e58a8ddf4702600b564b', '878fbeb480886d101aabf8b66ab950db5ad1b3888c78d8ee4b6f4867c0b14161', 30976, 'update-20260913');

console.log('[bootstrap] exact source reconstructed with 2026-09-13 update');
execSync('npm install --ignore-scripts --no-audit --no-fund', { cwd: work, stdio: 'inherit', env: process.env });
execSync('npm run build', { cwd: work, stdio: 'inherit', env: process.env });
const from = path.join(work, '.vercel', 'output');
const to = path.join(cwd, '.vercel', 'output');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.cpSync(from, to, { recursive: true });
console.log('[bootstrap] Vercel output copied');
