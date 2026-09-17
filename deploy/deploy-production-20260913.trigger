deploy requested 2026-09-17 automatic ticket + Caixa edit/select + trip ton details + fueling cleanup
changes: remove manual ticket field from driver freight launch and always use sequential automatic ticket; preserve automatic ticket as read-only in Caixa; keep and clarify Caixa selection checkboxes/select-all; add Edit button for pending freights with driver, fleet, mode, ton weight or daily value editing without accepting the report; add per-ton-trip details in Viagens cards/groups including net weight, exact price per ton, total freight and commission; remove KM entre abastecimentos, Média KM/L, KM rodado and KM/L derived metrics from Abastecimentos
validation: reconstructed source assertions passed and final source compiled successfully
preserve existing Neon production data; no destructive SQL
publish same Vercel project: transsalomao
