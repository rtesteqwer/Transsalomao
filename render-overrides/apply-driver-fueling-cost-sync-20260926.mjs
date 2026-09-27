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

// Relatórios por motorista: além do vínculo explícito por driver_id, recupera
// abastecimentos antigos sem motorista quando o conjunto/data permite atribuição
// inequívoca ao motorista. Nunca sobrepõe um driver_id já gravado para outro motorista.
patchFile("src/routes/dono/totais.tsx", (source) => {
  const oldLine = '  const fuelForDriver = (driverId: string) => fuelings.filter((f) => f.driverId === driverId);';
  if (!source.includes(oldLine) && source.includes("const fuelingBelongsToDriver =")) return source;
  if (!source.includes(oldLine)) throw new Error("driver-fueling-cost-sync: fuelForDriver marker missing");

  const helper = `  const fuelingBelongsToDriver = (fueling: ReportFueling, driverId: string) => {
    const wantedDriverId = String(driverId ?? "");
    const explicitDriverId = String((fueling as any).driverId ?? "");
    if (explicitDriverId) return explicitDriverId === wantedDriverId;

    const fleetId = String((fueling as any).fleetId ?? "");
    const fuelingDate = String((fueling as any).date ?? "").slice(0, 10);
    if (!fleetId || !fuelingDate) return false;

    const sameDayDrivers = new Set(
      computed
        .filter((trip: any) =>
          String(trip.fleetId ?? "") === fleetId &&
          String(trip.date ?? "").slice(0, 10) === fuelingDate,
        )
        .map((trip: any) => String(trip.driverId ?? ""))
        .filter(Boolean),
    );
    if (sameDayDrivers.size > 0) {
      return sameDayDrivers.size === 1 && sameDayDrivers.has(wantedDriverId);
    }

    const periodFleetDrivers = new Set(
      computed
        .filter((trip: any) => String(trip.fleetId ?? "") === fleetId)
        .map((trip: any) => String(trip.driverId ?? ""))
        .filter(Boolean),
    );
    return periodFleetDrivers.size === 1 && periodFleetDrivers.has(wantedDriverId);
  };

  const fuelForDriver = (driverId: string) => {
    const driver = data?.drivers.find((item) => String(item.id) === String(driverId));
    return fuelings
      .filter((fueling) => fuelingBelongsToDriver(fueling, driverId))
      .map((fueling: any) =>
        fueling.driverId
          ? fueling
          : {
              ...fueling,
              driverId,
              driverName: driver?.name ?? fueling.driverName ?? "Motorista",
            },
      );
  };`;

  return source.replace(oldLine, helper);
});

// Excel individual: mesma regra de associação usada pelo PDF/tela.
// Se driver_id existe, ele manda. Somente abastecimentos sem driver_id podem
// ser inferidos por conjunto + data, ou por uso exclusivo do conjunto no período.
patchFile("src/lib/excel-report.ts", (source) => {
  const oldLine = '    const excelFuelings = driverScope ? fuelings.filter((f: any) => String(f.driverId) === String(driverScope.id)) : fuelings;';
  if (!source.includes(oldLine) && source.includes("const excelFuelingBelongsToDriver =")) return source;
  if (!source.includes(oldLine)) throw new Error("driver-fueling-cost-sync: excelFuelings marker missing");

  const replacement = `    const excelFuelingBelongsToDriver = (fueling: any) => {
      if (!driverScope) return true;
      const wantedDriverId = String(driverScope.id ?? "");
      const explicitDriverId = String(fueling?.driverId ?? "");
      if (explicitDriverId) return explicitDriverId === wantedDriverId;

      const fleetId = String(fueling?.fleetId ?? "");
      const fuelingDate = String(fueling?.date ?? "").slice(0, 10);
      if (!fleetId || !fuelingDate) return false;

      const sameDayDrivers = new Set(
        computed
          .filter((trip: any) =>
            String(trip.fleetId ?? "") === fleetId &&
            String(trip.date ?? "").slice(0, 10) === fuelingDate,
          )
          .map((trip: any) => String(trip.driverId ?? ""))
          .filter(Boolean),
      );
      if (sameDayDrivers.size > 0) {
        return sameDayDrivers.size === 1 && sameDayDrivers.has(wantedDriverId);
      }

      const periodFleetDrivers = new Set(
        computed
          .filter((trip: any) => String(trip.fleetId ?? "") === fleetId)
          .map((trip: any) => String(trip.driverId ?? ""))
          .filter(Boolean),
      );
      return periodFleetDrivers.size === 1 && periodFleetDrivers.has(wantedDriverId);
    };
    const excelFuelings = driverScope
      ? fuelings
          .filter(excelFuelingBelongsToDriver)
          .map((fueling: any) =>
            fueling.driverId
              ? fueling
              : { ...fueling, driverId: driverScope.id, driverName: driverScope.name },
          )
      : fuelings;`;

  return source.replace(oldLine, replacement);
});

console.log("[driver-fueling-cost-sync] PDF/Excel driver diesel = real fuelings total + inferred legacy driver links");
