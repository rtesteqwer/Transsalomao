import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error('fix-excel-driver-tabs-syntax: target missing');
const p = path.join(target, 'src/routes/dono/totais.tsx');
let s = fs.readFileSync(p, 'utf8');

const blockMarker = 'const driverGroupedSheetTrips = Array.from(';
const blockAt = s.indexOf(blockMarker);
if (blockAt < 0) throw new Error('fix-excel-driver-tabs-syntax: grouped driver block missing');

const headerAt = s.indexOf('const header = sheet.addRow([', blockAt);
if (headerAt < 0) throw new Error('fix-excel-driver-tabs-syntax: grouped driver header missing');
const styleAt = s.indexOf('styleHeader(header);', headerAt);
if (styleAt < 0) throw new Error('fix-excel-driver-tabs-syntax: grouped driver header style missing');

s = s.slice(0, headerAt) + s.slice(headerAt).replace('const header = sheet.addRow([', 'const driverTripsHeader = sheet.addRow([');
const adjustedStyleAt = s.indexOf('styleHeader(header);', headerAt);
s = s.slice(0, adjustedStyleAt) + s.slice(adjustedStyleAt).replace('styleHeader(header);', 'styleHeader(driverTripsHeader);');

if (!s.includes('const driverTripsHeader = sheet.addRow([') || !s.includes('styleHeader(driverTripsHeader);')) {
  throw new Error('fix-excel-driver-tabs-syntax: rename audit failed');
}

fs.writeFileSync(p, s);
console.log('[excel-driver-tabs-syntax] grouped driver header variable de-duplicated');
