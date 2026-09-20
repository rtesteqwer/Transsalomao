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
