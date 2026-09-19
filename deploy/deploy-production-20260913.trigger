deploy requested 2026-09-19 driver bulk acceptance integrity fix
changes: each accepted driver report creates its own trip; reused ticket numbers are reassigned to the next free numeric ticket; new driver launches use the highest existing numeric ticket/report code plus one
incident: seven driver launches at 2026-09-19 08:33:56–08:34:02 BRT were followed by a bulk accept at 08:34:29 BRT returning HTTP 200 without creating independent trips when ticket codes collided
preserve existing production data; no destructive SQL
publish same Vercel project: transsalomao
