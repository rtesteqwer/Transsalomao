import fs from "node:fs";
import path from "node:path";

const work=process.argv[2]||process.cwd();
const file=path.join(work,"src/routes/dono/fotos.tsx");
let s=fs.readFileSync(file,"utf8");
if(!s.includes('import { TestePage } from "./teste";')){
  s=s.replace('import { useFleet } from "@/lib/use-fleet";','import { useFleet } from "@/lib/use-fleet";\nimport { TestePage } from "./teste";');
}
if(!s.includes("const [testeMode")){
  s=s.replace("function FotosTicketsPage() {","function FotosTicketsPage() {\n  const [testeMode, setTesteMode] = useState(false);\n  useEffect(() => { setTesteMode(new URLSearchParams(window.location.search).get('teste') === '1'); }, []);\n  if (testeMode) return <TestePage />;");
}
if(!s.includes("TESTE · Documentos")){
  const needle='<p className="mt-2 max-w-2xl text-sm text-muted">';
  const at=s.indexOf(needle);
  if(at>=0){
    const end=s.indexOf("</p>",at);
    const close=s.indexOf("</div>",end);
    s=s.slice(0,close+6)+'\n        <a href="/dono/fotos?teste=1" className="mt-4 inline-flex w-fit items-center rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-fg hover:bg-accent/15">TESTE · Documentos</a>'+s.slice(close+6);
  }
}
fs.writeFileSync(file,s);
console.log("[teste-document-fotos-shortcut] installed");
