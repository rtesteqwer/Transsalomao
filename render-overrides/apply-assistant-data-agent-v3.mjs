import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('assistant-data-agent-v3: target missing');
const repo = process.cwd();
const source = path.join(repo, 'assistant-v3', 'api-assistant.ts');
if (!fs.existsSync(source)) throw new Error('assistant-data-agent-v3: API source missing');
const destination = path.join(target, 'src', 'routes', 'api', 'assistant.ts');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log('[assistant-data-agent-v3] /api/assistant installed');
