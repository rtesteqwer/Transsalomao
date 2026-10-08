import fs from "node:fs";
import path from "node:path";

const repo=process.cwd();
const files=[
  "src/routes/dono/teste.tsx",
  "src/routes/api/teste-document-intake.ts",
  "src/components/owner/shell.tsx",
  "src/routeTree.gen.ts",
];
for(const rel of files){
  const from=path.join(repo,rel);
  const to=path.join(process.argv[2]||repo,rel);
  if(!fs.existsSync(from)) throw new Error("[teste-document-intake] missing source: "+rel);
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(from,to);
}
console.log("[teste-document-intake] installed TESTE area");
