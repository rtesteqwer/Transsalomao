import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const parts = ['00', '01', '02', '03', '04', '05'].map((n) => readFileSync(`deploy/chunk-${n}.txt`, 'utf8').trim())
writeFileSync('transsalomao-source.txz', Buffer.from(parts.join(''), 'base64'))
execFileSync('tar', ['-xJf', 'transsalomao-source.txz'], { stdio: 'inherit' })
execFileSync('node', ['scripts/with-app-env.mjs', 'vite', 'build'], { stdio: 'inherit', env: process.env })
execFileSync('npm', ['run', 'db:migrate'], { stdio: 'inherit', env: process.env })
