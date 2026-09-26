import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) throw new Error("driver-fueling-cost-sync: target missing");

function patchFile(rel, transform) {
  const file = path.join(target, rel);
  if (!fs.existsSync(file)) return false;
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after);
  return after !== before;
}

// PDF individual: Custo diesel deve ser exatamente a soma dos abastecimentos
// recebidos para aquele motorista e período.
patchFile("src/lib/pdf.ts", (source) => {
  const fnStart = source.indexOf("export async function downloadDriverReportPdf");
  if (fnStart < 0) throw new Error("driver-fueling-cost-sync: driver PDF function missing");
  const nextExport = source.indexOf("\nexport ", fnStart + 20);
  const fnEnd = nextExport >= 0 ? nextExport : source.length;
  let block = source.slice(fnStart, fnEnd);

  const legacy = /const totalDiesel = trips\.reduce\(\(sum, trip\) => sum \+ Number\(\(trip as any\)\.dieselCost \?\? 0\), 0\);/;
  const corrected = 'const totalDiesel = fuelings.reduce((sum, item: any) => sum + Number(item.liters ?? 0) * Number(item.pricePerLiter ?? 0), 0);';
  if (legacy.test(block)) block = block.replace(legacy, corrected);
  else if (!block.includes(corrected)) {
    throw new Error("driver-fueling-cost-sync: PDF diesel total pattern missing");
  }

  // Evita duas fontes diferentes para o mesmo total.
  block = block.replace(
    /const totalFuelings = fuelings\.reduce\(\(sum, item: any\) => sum \+ Number\(item\.liters \?\? 0\) \* Number\(item\.pricePerLiter \?\? 0\), 0\);/,
    "const totalFuelings = totalDiesel;",
  );

  return source.slice(0, fnStart) + block + source.slice(fnEnd);
});

// Excel individual: o cabeçalho/resumo do motorista deve usar os abastecimentos
// já filtrados pelo driverScope e pelo período, nunca dieselCost das viagens.
for (const rel of ["src/lib/excel-report.ts", "src/routes/dono/totais.tsx"]) {
  patchFile(rel, (source) => {
    let s = source;
    s = s.replace(
      /const totalDieselDriver = excelTrips\.reduce\(\(sum: number, trip: any\) => sum \+ Number\(trip\.dieselCost \?\? 0\), 0\);/g,
      'const totalDieselDriver = excelFuelings.reduce((sum: number, fueling: any) => sum + Number(fueling.liters ?? 0) * Number(fueling.pricePerLiter ?? 0), 0);',
    );
    s = s.replace(
      '" • Diesel: " + brl(totalDieselDriver) +',
      '" • Custo diesel: " + brl(totalDieselDriver) +',
    );
    return s;
  });
}

console.log("[driver-fueling-cost-sync] PDF/Excel driver diesel = real fuelings total");
