import fs from 'node:fs';

const originalReadFileSync = fs.readFileSync.bind(fs);

fs.readFileSync = (file, options) => {
  const value = originalReadFileSync(file, options);
  if (
    typeof value === 'string' &&
    String(file).replace(/\\/g, '/').endsWith('/src/routes/dono/route.tsx') &&
    value.includes('await qc.invalidateQueries({ queryKey: sessionKey });') &&
    !value.includes('await session.refetch();')
  ) {
    return value.replace(
      'await qc.invalidateQueries({ queryKey: sessionKey });',
      'await session.refetch();',
    );
  }
  return value;
};
