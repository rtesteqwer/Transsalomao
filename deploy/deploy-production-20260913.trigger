deploy requested 2026-09-19 driver bulk acceptance persistence fix retry
changes: each accepted driver report creates and links its own real trip; duplicate ticket codes receive the next free numeric ticket; compatibility with daily freight/report patch restored
preserve existing production data; no destructive SQL
source fix commit: 955444ba44fc07a24d2d83bc39e1503b912bb552
publish same Vercel project: transsalomao
compatibility: daily/report patch accepts already-transformed bulk acceptance logic
validated-build: accepted-trip fix compile passed after literal SQL injection repair
