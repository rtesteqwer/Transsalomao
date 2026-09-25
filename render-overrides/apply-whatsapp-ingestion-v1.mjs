import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('whatsapp-ingestion-v1: target missing');
const repo = process.cwd();

const copies = [
  ['whatsapp-v1/api-whatsapp-webhook.ts', 'src/routes/api/whatsapp/webhook.ts'],
  ['whatsapp-v1/0013_whatsapp_messages.sql', 'migrations/0013_whatsapp_messages.sql'],
  ['whatsapp-v1/0014_whatsapp_group_context.sql', 'migrations/0014_whatsapp_group_context.sql'],
  ['whatsapp-v1/0018_whatsapp_group_drivers.sql', 'migrations/0018_whatsapp_group_drivers.sql'],
  ['whatsapp-v1/0019_whatsapp_group_driver_backfill.sql', 'migrations/0019_whatsapp_group_driver_backfill.sql'],
];

for (const [srcRel, dstRel] of copies) {
  const src = path.join(repo, srcRel);
  const dst = path.join(target, dstRel);
  if (!fs.existsSync(src)) throw new Error('whatsapp-ingestion-v1 missing ' + srcRel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

console.log('[whatsapp-ingestion-v1] webhook and migration installed');
