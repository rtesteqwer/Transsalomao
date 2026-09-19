deploy requested 2026-09-19 persist accepted driver reports as real trips
changes: bulk accept now creates and links one real trip per accepted driver report; avoids ticket collisions and preserves existing trips
recovery: no destructive SQL; existing trips remain untouched
validation: corrected acceptReports snippet committed as ec9f8c10273ce3d2feaa40a22290c7d43c27f023
publish same Vercel project: transsalomao
