import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (!target || !fs.existsSync(target)) {
  throw new Error('run-freight-prices-safe: target source directory missing');
}

const here = path.dirname(new URL(import.meta.url).pathname);
const originalPath = path.join(here, 'apply-freight-prices.mjs');
const runtimePath = path.join(here, '.apply-freight-prices.runtime.mjs');
let source = fs.readFileSync(originalPath, 'utf8');

// A reconstrução atual ainda grava viagens sem trip_billing_type no INSERT.
// Ajustamos somente o padrão esperado pelo patch, sem criar coluna inexistente
// nem alterar os dados antigos.
source = source
  .replace(
    "'${data.netWeight}, ${data.freightMode}, ${data.tripBillingType}, ${data.pricePerTon}, ${data.pricePerTrip},'",
    "'${data.netWeight}, ${data.freightMode}, ${data.pricePerTon}, ${data.pricePerTrip},'",
  )
  .replace(
    "'${data.netWeight}, ${data.freightMode}, ${data.tripBillingType}, ${data.pricePerTon}, ${pricePerTrip},'",
    "'${data.netWeight}, ${data.freightMode}, ${data.pricePerTon}, ${pricePerTrip},'",
  );

fs.writeFileSync(runtimePath, source);
try {
  execFileSync(process.execPath, [runtimePath, target], {
    cwd: path.resolve(here, '..'),
    stdio: 'inherit',
  });
  const inspectPath = path.join(here, 'inspect-trip-bulk.mjs');
  if (fs.existsSync(inspectPath)) {
    execFileSync(process.execPath, [inspectPath, target], {
      cwd: path.resolve(here, '..'),
      stdio: 'inherit',
    });
  }
} finally {
  fs.rmSync(runtimePath, { force: true });
}
