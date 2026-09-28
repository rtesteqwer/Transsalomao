import fs from "node:fs";
import path from "node:path";

const work = process.argv[2];
if (!work) throw new Error("Usage: node apply-security-frontend-gate-20260928.mjs <source-dir>");

function edit(rel, transform) {
  const file = path.join(work, rel);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) throw new Error("Security frontend gate made no changes: " + rel);
  fs.writeFileSync(file, after);
}

edit("src/lib/use-fleet.ts", (s) => {
  if (s.includes("export function useFleet(enabled = true)")) return s;
  let out = s.replace("export function useFleet() {", "export function useFleet(enabled = true) {");
  out = out.replace("    refetchInterval: 4000,", "    enabled,\n    refetchInterval: enabled ? 4000 : false,");
  return out;
});

edit("src/routes/motorista.tsx", (s) => {
  if (s.includes("useFleet(!!ticketAccess?.authenticated)")) return s;
  return s.replace(
    `function MotoristaPage() {
  const { data, isLoading } = useFleet();
  const { report } = useFleetMutations();
  const [ticketAccess, setTicketAccess] = useState<PhotoAccess | null>(null);`,
    `function MotoristaPage() {
  const [ticketAccess, setTicketAccess] = useState<PhotoAccess | null>(null);
  const { data, isLoading } = useFleet(!!ticketAccess?.authenticated);
  const { report } = useFleetMutations();`
  );
});

edit("src/routes/index.tsx", (s) => {
  if (s.includes('meta="Acesso restrito à gerência"')) return s;
  let out = s.replace('import { useFleet } from "@/lib/use-fleet";\n', "");
  out = out.replace(
    /function Home\(\) \{\n\s*const \{ data \} = useFleet\(\);\n\s*const pending = [^\n]+\n\s*const trips = [^\n]+\n\n/,
    "function Home() {\n"
  );
  out = out.replace(
    /(cta="Abrir app do motorista")\n\s*meta=\{[\s\S]*?\n\s*\}/,
    '$1\n            meta="Acesso do motorista com login"'
  );
  out = out.replace(
    /(cta="Abrir Painel Gerência")\n\s*meta=\{[\s\S]*?\n\s*\}/,
    '$1\n            meta="Acesso restrito à gerência"'
  );
  return out;
});

console.log("[security-frontend] public home no longer reads private fleet data; driver fleet query waits for authentication");
