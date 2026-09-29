import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('salomao-v4: target missing');
const repo = process.cwd();

const copies = [
  ['assistant-v4/management-auth.server.ts', 'src/lib/management-auth.server.ts'],
  ['assistant-v4/assistant-auth.server.ts', 'src/lib/assistant-auth.server.ts'],
  ['assistant-v4/salomao-ai.server.ts', 'src/lib/salomao-ai.server.ts'],
  ['assistant-v4/api-assistant-auth.ts', 'src/routes/api/assistant/auth.ts'],
  ['assistant-v4/api-assistant.ts', 'src/routes/api/assistant.ts'],
  ['assistant-v4/api-assistant-status.ts', 'src/routes/api/assistant/status.ts'],
  ['assistant-v4/api-document-intake.ts', 'src/routes/api/assistant/document-intake.ts'],
  ['assistant-v4/api-assistant-developer.ts', 'src/routes/api/assistant/developer.ts'],
  ['assistant-v4/api-assistant-programmer-proxy.ts', 'src/routes/api/assistant/programmer-proxy.ts'],
  ['assistant-v4/api-axor-sample-import.ts', 'src/routes/api/assistant/axor-sample-import.ts'],
  ['assistant-v4/document-uploader.tsx', 'src/components/document-uploader.tsx'],
  ['assistant-v4/salomao-web.tsx', 'src/routes/salomao-ia.tsx'],
  ['assistant-v4/0012_management_users_assistant_sessions.sql', 'migrations/0012_management_users_assistant_sessions.sql'],
];
for (const [srcRel, dstRel] of copies) {
  const src = path.join(repo, srcRel);
  const dst = path.join(target, dstRel);
  if (!fs.existsSync(src)) throw new Error('salomao-v4 missing ' + srcRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
// The security hardening patch was authored against the pre-branding generated files.
// Normalize only the generated copies here, then re-apply the public Trans Salomão IA
// wording after security hardening. This keeps the security patch intact and buildable.
for (const rel of [
  'src/routes/api/assistant/developer.ts',
  'src/routes/api/assistant.ts',
  'src/routes/api/assistant/document-intake.ts',
  'src/routes/salomao-ia.tsx',
]) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replaceAll('Trans Salomão IA', 'Salomão IA');
  if (after !== before) fs.writeFileSync(file, after);
}
console.log('[salomao-v4] generated assistant files normalized for security hardening');

console.log('[salomao-v4] auth, actions, assistant API and migration installed');


// Keep the legacy /salomao-ia route and expose the new branded URL as well.
const legacyAssistantRoute = path.join(target, 'src/routes/salomao-ia.tsx');
const brandedAssistantRoute = path.join(target, 'src/routes/trans-salomao-ia.tsx');
if (fs.existsSync(legacyAssistantRoute)) {
  const brandedSource = fs.readFileSync(legacyAssistantRoute, 'utf8')
    .replace('createFileRoute("/salomao-ia")', 'createFileRoute("/trans-salomao-ia")');
  fs.writeFileSync(brandedAssistantRoute, brandedSource);
}
console.log('[salomao-v4] Trans Salomão IA route installed at /trans-salomao-ia');
