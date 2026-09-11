import { execFileSync } from 'node:child_process'

execFileSync('tar', ['-xJf', 'transsalomao-source.txz'], { stdio: 'inherit' })
execFileSync('node', ['scripts/with-app-env.mjs', 'node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit', env: process.env })
execFileSync('npm', ['run', 'db:migrate'], { stdio: 'inherit', env: process.env })
