deploy requested 2026-09-19 validated driver bulk acceptance persistence fix
changes: each accepted driver report creates and links its own real trip; duplicate ticket codes receive the next free numeric ticket; daily freight/report compatibility retained
preserve existing production data; no destructive SQL
validated source commit: 0dd20e107c9fa51e13e450a895d2dc83bad474fa
validation: reconstruction, operational assertions and final production build all passed
publish same Vercel project: transsalomao
recovery: apply idempotent 0011 repair for Sep 19 08:33 BRT Cegonha reports mislinked by old ticket-collision acceptance
assistant-v3: publish direct-data /api/assistant and Salomao IA chat integration
validation: reconstructed production site build passed; Android v3 build and APK verification passed
security: read-only assistant data tools; management session required; no destructive SQL
salomao-v4: publish intent routing, editable management users, independent assistant sessions and write tools
validation: reconstructed production build passed; Android v4 build and APK verification passed
security: password not embedded in source/APK; Android stores only revocable token encrypted with Keystore; destructive actions require confirmation
salomao-gpt56: redeploy after OPENAI_API_KEY configuration; verify /api/assistant/status
redeploy-2026-09-21: activate OpenAI runtime and assistant status validation
salomao-v52: intent accuracy fixes

openai-env-20260921T125318Z
activate-openai-production-2026-09-21
salomao-v53: billing error handling

whatsapp-20260922: publish validated ingestion bdfcb89d6c49f41dbe99fb6adc06883a19ef853f; 12 tests and full application build passed; Meta connection and explicit auto-post activation pending.
whatsapp-image-20260922: weigh-ticket vision, net-weight-only, group Caixa ingestion
whatsapp-management-mode-20260922: management selects trip type in Caixa before closing
real-weight-history-20260922: show exact trip tonnage with 3 decimal places in Lancamentos history
real-weight-history-retry-20260922: fix patch injection newline syntax
pf-auto-sync-20260922: secure Meu Capital PF endpoint; 3% company gross monthly + 20% Felipe driver freight commission; source IDs prevent duplicate PF income
felipe-owner-share-20260922: Felipe-only management tab for 3% company gross participation
felipe-owner-share-fix-20260922: fix newline escaping and redeploy 3% participation tab
felipe-owner-share-inline-20260922: move 3% participation into /dono dashboard for Felipe login
felipe-share-periods-20260922: restore standard billing options and add 7d 30d month all filters for Felipe 3%
