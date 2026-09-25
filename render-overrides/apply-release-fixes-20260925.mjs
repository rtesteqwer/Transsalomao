import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('release-fixes: target missing');
function patch(rel, before, after) {
  const file = path.join(target, rel);
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(before)) throw new Error('release-fixes: pattern missing in ' + rel);
  fs.writeFileSync(file, content.replace(before, after));
}

patch('src/routes/dono/viagens.tsx', '  async function handleBulkDelete() {', `  async function handleDeleteTrip(row: ComputedTrip) {
    if (removeTrip.isPending) return;
    if (!window.confirm('Excluir a viagem ' + row.code + '? Esta ação atualiza os totais e relatórios.')) return;
    try {
      await removeTrip.mutateAsync(row.id);
      setSelectedIds(ids => ids.filter(id => id !== row.id));
      setEditing(current => current?.id === row.id ? null : current);
      toast.success('Viagem excluída.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a viagem.');
    }
  }

  async function handleBulkDelete() {`);

patch('src/routes/dono/index.tsx',
  'const fuelingRows = useMemo(() => data ? fuelingConsumptionRows(data.fuelings) : [], [data]);',
  `const fuelingRows = useMemo(() => data ? fuelingConsumptionRows(data.fuelings).map(fueling => {
    const driver = data.drivers.find(item => item.id === fueling.driverId);
    const fleet = data.fleets.find(item => item.id === fueling.fleetId);
    return { ...fueling, driverName: driver?.name || 'Motorista', fleetName: fleet?.name || '',
      tractorPlate: fleet?.tractorPlate || '', trailerPlate: fleet?.trailerPlate || '' };
  }) : [], [data]);`);

patch('src/lib/api.ts',
  'const pricePerTrip = usesGlobalPrice\n      ? await getConfiguredTripPrice(sql, data.freightMode)',
  'const pricePerTrip = data.freightMode !== "ton"\n      ? await getConfiguredTripPrice(sql, data.freightMode)');

console.log('[release-fixes] restored trip deletion and completed billing PDF fueling metadata');
