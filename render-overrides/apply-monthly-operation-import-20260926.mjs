import fs from "node:fs";
import path from "node:path";

const target=process.argv[2];
if(!target||!fs.existsSync(target))throw new Error("monthly-import: target missing");
const repo=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const src=(rel)=>path.join(repo,rel);
const dst=(rel)=>path.join(target,rel);
const read=(rel)=>fs.readFileSync(dst(rel),"utf8");
const write=(rel,value)=>{fs.mkdirSync(path.dirname(dst(rel)),{recursive:true});fs.writeFileSync(dst(rel),value);};
const copy=(from,to)=>write(to,fs.readFileSync(src(from),"utf8"));
function replaceRequired(text,before,after,label){
  if(text.includes(after))return text;
  if(!text.includes(before))throw new Error("monthly-import: pattern not found ("+label+")");
  return text.replace(before,after);
}

copy("render-overrides/operation-import-ai-20260926.server.ts","src/lib/operation-import-ai.server.ts");
copy("render-overrides/operation-import-api-20260926.ts","src/routes/api/operation-import.ts");
copy("render-overrides/monthly-operation-import-20260926.tsx","src/components/monthly-operation-import.tsx");

{
  const packagePath=dst("package.json");
  const pkg=JSON.parse(fs.readFileSync(packagePath,"utf8"));
  pkg.dependencies=pkg.dependencies||{};
  pkg.dependencies.jszip="^3.10.1";
  fs.writeFileSync(packagePath,JSON.stringify(pkg,null,2)+"\n");
}

{
  const rel="src/routes/dono/fotos.tsx";
  let s=read(rel);
  s=replaceRequired(
    s,
    'import { Button } from "@/components/ui/button";',
    'import { Button } from "@/components/ui/button";\nimport { MonthlyOperationImport } from "@/components/monthly-operation-import";',
    "Fotos import"
  );

  const headerEnd='      </div>\n\n      <section className="mt-7 grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">';
  s=replaceRequired(
    s,
    headerEnd,
    '      </div>\n\n      <div className="mt-7"><MonthlyOperationImport /></div>\n\n      <section className="mt-7 grid gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6">',
    "Fotos monthly panel"
  );

  s=s.replace(
    "Salve a foto enviada pelo motorista e relacione manualmente à viagem correta. Esta área é somente da Gerência e não usa IA.",
    "Central de documentos da Gerência: importe conversas, ZIPs, PDFs e fotos com Salomão IA ou relacione manualmente uma foto à viagem."
  );
  write(rel,s);
}

console.log("[monthly-import] WhatsApp ZIP, PDFs, Pix, mechanics and odometer importer installed");
