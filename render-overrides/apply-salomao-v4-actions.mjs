import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('salomao-v4: target missing');
const repo = process.cwd();

const copies = [
  ['assistant-v4/management-auth.server.ts', 'src/lib/management-auth.server.ts'],
  ['assistant-v4/assistant-auth.server.ts', 'src/lib/assistant-auth.server.ts'],
  ['assistant-v4/api-assistant-auth.ts', 'src/routes/api/assistant/auth.ts'],
  ['assistant-v4/api-assistant.ts', 'src/routes/api/assistant.ts'],
  ['assistant-v4/api-assistant-status.ts', 'src/routes/api/assistant/status.ts'],
  ['assistant-v4/0012_management_users_assistant_sessions.sql', 'migrations/0012_management_users_assistant_sessions.sql'],
];
for (const [srcRel, dstRel] of copies) {
  const src = path.join(repo, srcRel);
  const dst = path.join(target, dstRel);
  if (!fs.existsSync(src)) throw new Error('salomao-v4 missing ' + srcRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
console.log('[salomao-v4] auth, actions, assistant API and migration installed');
