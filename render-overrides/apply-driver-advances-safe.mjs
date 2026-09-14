import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('apply-driver-advances-safe: target missing');

const repo = process.cwd();
const originalPath = path.join(repo, 'render-overrides', 'apply-driver-advances.mjs');
let source = fs.readFileSync(originalPath, 'utf8');

const marker1 = source.indexOf("'quick pdf advance rows'");
const marker2 = source.indexOf("'quick pdf advances'", marker1 + 1);
if (marker1 < 0 || marker2 < 0) throw new Error('apply-driver-advances-safe: quick PDF markers missing');

const start = source.lastIndexOf('  s = replaceRequired(', marker1);
const secondStart = source.lastIndexOf('  s = replaceRequired(', marker2);
const secondEndMarker = source.indexOf('\n  );', marker2);
if (start < 0 || secondStart < 0 || secondEndMarker < 0) {
  throw new Error('apply-driver-advances-safe: quick PDF patch block not found');
}
const end = secondEndMarker + '\n  );'.length;

const robustQuickPatch = `  {
    const quickStart = s.indexOf('  function quickPdf(');
    if (quickStart < 0) throw new Error('apply-driver-advances: quickPdf function not found');
    const nextFunction = s.indexOf('\\n  function ', quickStart + 20);
    const quickEnd = nextFunction < 0 ? s.length : nextFunction;
    let quick = s.slice(quickStart, quickEnd);
    quick = replaceRequired(
      quick,
      '\\n    downloadDriverReportPdf({',
      '\\n    const advanceRows = data.expenses\\n      .filter((e) => {\\n        if (e.category !== "Adiantamento" || !e.driverId) return false;\\n        if (kind === "day") return e.date === new Date().toISOString().slice(0, 10);\\n        if (kind === "week") return inPeriod(e.date, "7d");\\n        if (kind === "month") return inPeriod(e.date, "month");\\n        return true;\\n      })\\n      .map((e) => ({ driverId: e.driverId!, driverName: data.drivers.find((d) => d.id === e.driverId)?.name ?? "Motorista removido", date: e.date, amount: e.amount, description: e.description }));\\n    downloadDriverReportPdf({',
      'quick pdf advance rows',
    );
    quick = replaceRequired(
      quick,
      '      fuelings: fuelRows,\\n',
      '      fuelings: fuelRows,\\n      advances: advanceRows,\\n',
      'quick pdf advances',
    );
    s = s.slice(0, quickStart) + quick + s.slice(quickEnd);
  }`;

source = source.slice(0, start) + robustQuickPatch + source.slice(end);

const temp = path.join(os.tmpdir(), `apply-driver-advances-${Date.now()}.mjs`);
fs.writeFileSync(temp, source);
execFileSync(process.execPath, [temp, target], { cwd: repo, stdio: 'inherit' });
fs.rmSync(temp, { force: true });
