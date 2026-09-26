import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = process.cwd();
const reference = process.env.TRANS_REFERENCE_APP || path.join(process.env.RUNNER_TEMP || repo, "salomao-reference-app");
const proxyUrl = process.env.SALOMAO_PROXY_URL || "https://transsalomao.vercel.app/api/assistant/programmer-proxy";

const allowedRoots = ["assistant-v4/","android-voice/","render-overrides/","tests/"];
const protectedPaths = new Set([
  "assistant-v4/api-assistant-auth.ts",
  "assistant-v4/assistant-auth.server.ts",
  "assistant-v4/developer-mode.server.ts",
  "assistant-v4/api-assistant-programmer-proxy.ts",
]);
const protectedPrefixes = [".github/","deploy/",".vercel/","backup-payload/",".git/"];

function relPath(input){
  const rel=String(input||"").replace(/\\/g,"/").replace(/^\.\//,"");
  if(!rel||rel.startsWith("/")||rel.includes("../"))throw new Error("Caminho inválido");
  return rel;
}
function isProtected(rel){
  if(protectedPaths.has(rel))return true;
  if(protectedPrefixes.some((p)=>rel.startsWith(p)))return true;
  if(/(^|\/)\.env($|\.)/.test(rel)||/secret|credential|token/i.test(path.basename(rel)))return true;
  return false;
}
function writable(rel){return allowedRoots.some((p)=>rel.startsWith(p))&&!isProtected(rel);}
function trackedFiles(){
  return execFileSync("git",["ls-files"],{cwd:repo,encoding:"utf8"}).split("\n").filter(Boolean);
}
function listFiles(prefix=""){
  const p=String(prefix||"").replace(/^\.\//,"").replace(/\/$/,"");
  return trackedFiles().filter((f)=>!isProtected(f)).filter((f)=>!p||f===p||f.startsWith(p+"/")).slice(0,600);
}
function readFile(base,rel,startLine=1,endLine=300){
  rel=relPath(rel);
  const abs=path.join(base,rel);
  if(!fs.existsSync(abs)||!fs.statSync(abs).isFile())throw new Error("Arquivo não encontrado: "+rel);
  const lines=fs.readFileSync(abs,"utf8").split("\n");
  const start=Math.max(1,Number(startLine)||1),end=Math.min(lines.length,Math.max(start,Number(endLine)||start+299));
  return lines.slice(start-1,end).map((line,i)=>String(start+i).padStart(5," ")+" | "+line).join("\n");
}
function searchRepo(query,prefix=""){
  const q=String(query||"").toLowerCase().trim();
  if(!q)throw new Error("Consulta vazia");
  const hits=[];
  for(const file of listFiles(prefix)){
    try{
      const lines=fs.readFileSync(path.join(repo,file),"utf8").split("\n");
      for(let i=0;i<lines.length;i++){
        if(lines[i].toLowerCase().includes(q)){
          hits.push({file,line:i+1,text:lines[i].slice(0,320)});
          if(hits.length>=100)return hits;
        }
      }
    }catch{}
  }
  return hits;
}
function writeFile(rel,content){
  rel=relPath(rel);
  if(!writable(rel))throw new Error("Arquivo protegido ou fora do escopo: "+rel);
  if(typeof content!=="string"||content.length>900000)throw new Error("Conteúdo inválido");
  const abs=path.join(repo,rel);
  fs.mkdirSync(path.dirname(abs),{recursive:true});
  fs.writeFileSync(abs,content,"utf8");
  return{ok:true,path:rel,bytes:Buffer.byteLength(content)};
}
function deleteFile(rel){
  rel=relPath(rel);
  if(!writable(rel))throw new Error("Arquivo protegido ou fora do escopo: "+rel);
  const abs=path.join(repo,rel);
  if(fs.existsSync(abs))fs.unlinkSync(abs);
  return{ok:true,path:rel};
}
function gitDiff(){
  return execFileSync("git",["diff","--","."],{cwd:repo,encoding:"utf8",maxBuffer:5*1024*1024}).slice(0,200000);
}
async function oidc(){
  const base=process.env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!base||!bearer)throw new Error("GitHub OIDC indisponível");
  const url=new URL(base);
  url.searchParams.set("audience","transsalomao-salomao-programmer");
  const r=await fetch(url,{headers:{Authorization:"Bearer "+bearer}});
  const data=await r.json();
  if(!r.ok||!data?.value)throw new Error("Falha ao obter OIDC");
  return data.value;
}
async function proxy(action,payload={}){
  const token=await oidc();
  const r=await fetch(proxyUrl,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data?.ok===false)throw new Error("Proxy "+action+" falhou: "+JSON.stringify(data).slice(0,1200));
  return data;
}
const tools=[
  {type:"function",name:"list_repo_files",strict:true,description:"Lista arquivos persistentes do repositório.",parameters:{type:"object",properties:{prefix:{type:"string"}},required:["prefix"],additionalProperties:false}},
  {type:"function",name:"read_repo_file",strict:true,description:"Lê um arquivo persistente do repositório.",parameters:{type:"object",properties:{path:{type:"string"},start_line:{type:"number"},end_line:{type:"number"}},required:["path","start_line","end_line"],additionalProperties:false}},
  {type:"function",name:"read_reconstructed_file",strict:true,description:"Lê o app reconstruído apenas para referência.",parameters:{type:"object",properties:{path:{type:"string"},start_line:{type:"number"},end_line:{type:"number"}},required:["path","start_line","end_line"],additionalProperties:false}},
  {type:"function",name:"search_repo",strict:true,description:"Procura texto no repositório.",parameters:{type:"object",properties:{query:{type:"string"},prefix:{type:"string"}},required:["query","prefix"],additionalProperties:false}},
  {type:"function",name:"write_repo_file",strict:true,description:"Cria ou substitui um arquivo permitido.",parameters:{type:"object",properties:{path:{type:"string"},content:{type:"string"}},required:["path","content"],additionalProperties:false}},
  {type:"function",name:"delete_repo_file",strict:true,description:"Exclui arquivo permitido quando necessário.",parameters:{type:"object",properties:{path:{type:"string"}},required:["path"],additionalProperties:false}},
  {type:"function",name:"inspect_git_diff",strict:true,description:"Mostra o diff atual.",parameters:{type:"object",properties:{},required:[],additionalProperties:false}},
];
async function runTool(name,a){
  if(name==="list_repo_files")return listFiles(a.prefix);
  if(name==="read_repo_file")return readFile(repo,a.path,a.start_line,a.end_line);
  if(name==="read_reconstructed_file"){
    const p=relPath(a.path);
    if(!p.startsWith("src/")&&p!=="package.json")throw new Error("Leitura reconstruída limitada a src/ e package.json");
    return readFile(reference,p,a.start_line,a.end_line);
  }
  if(name==="search_repo")return searchRepo(a.query,a.prefix);
  if(name==="write_repo_file")return writeFile(a.path,a.content);
  if(name==="delete_repo_file")return deleteFile(a.path);
  if(name==="inspect_git_diff")return gitDiff();
  throw new Error("Ferramenta desconhecida");
}
function outputText(r){
  if(typeof r?.output_text==="string"&&r.output_text.trim())return r.output_text.trim();
  const out=[];
  for(const item of Array.isArray(r?.output)?r.output:[])if(item?.type==="message")for(const p of Array.isArray(item.content)?item.content:[])if(p?.type==="output_text"&&typeof p.text==="string")out.push(p.text);
  return out.join("\n").trim();
}
async function program(change){
  const instructions=[
    "Você é o programador autônomo da Salomão IA para o Trans Salomão.",
    "A tarefa já foi autorizada por Felipe e validada pelo backend pelo id adm_felipe.",
    "Explore o repositório e o app reconstruído, implemente a alteração real e revise o diff.",
    "O projeto usa bootstrap/overlays; altere a fonte persistente correta, não somente arquivos reconstruídos.",
    "Não altere .github, deploy, .vercel, .env, segredos, credenciais, backup-payload, api-assistant-auth.ts, assistant-auth.server.ts, developer-mode.server.ts ou programmer-proxy.",
    "Não enfraqueça autenticação, autorização do Felipe ou guardas do pipeline.",
    "Não execute shell. Use apenas as ferramentas de arquivo disponibilizadas.",
    "Preserve dados existentes e prefira mudanças idempotentes e não destrutivas.",
    "Adicione ou ajuste testes quando fizer sentido.",
    "Não afirme que testes passaram; o workflow fará os testes após você terminar.",
    "Ao final, resuma arquivos alterados, comportamento implementado e riscos."
  ].join("\n");
  const input=["Título: "+change.title,"Escopo: "+change.scope,"Publicação solicitada: "+String(change.publish_requested),"","Pedido do Felipe:",change.request_text].join("\n");
  const common={instructions,tools,tool_choice:"auto",parallel_tool_calls:false,max_output_tokens:5000};
  let data=await proxy("openai",{payload:{...common,input}});
  let response=data.response;
  for(let i=0;i<60;i++){
    const calls=(Array.isArray(response?.output)?response.output:[]).filter((x)=>x?.type==="function_call");
    if(!calls.length){
      const text=outputText(response);
      if(!text)throw new Error("Resposta vazia do programador");
      return text;
    }
    const call=calls[0];
    let args={};
    try{args=JSON.parse(call.arguments||"{}");}catch{throw new Error("Argumentos inválidos do programador");}
    let result;
    try{result=await runTool(call.name,args);}catch(e){result={ok:false,error:String(e?.message||e)};}
    data=await proxy("openai",{payload:{...common,previous_response_id:response.id,input:[{type:"function_call_output",call_id:call.call_id,output:JSON.stringify(result)}]}});
    response=data.response;
  }
  throw new Error("Limite de ferramentas do programador excedido");
}
function output(name,value){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,name+"="+String(value).replace(/\n/g," ")+"\n");}

const mode=process.argv[2]||"program";
if(mode==="claim"){
  const claimed=await proxy("claim");
  const change=claimed.change;
  if(!change){
    output("found","false");
    console.log("Nenhuma tarefa Felipe autorizada.");
  }else{
    const taskFile=path.join(process.env.RUNNER_TEMP||repo,"salomao-change.json");
    fs.writeFileSync(taskFile,JSON.stringify(change),"utf8");
    output("found","true");
    output("change_id",change.id);
    output("branch","salomao-auto/"+String(change.id).replace(/[^A-Za-z0-9._-]/g,"-"));
    output("publish",change.publish_requested===true?"true":"false");
  }
}else if(mode==="program"){
  let change;
  try{
    const taskFile=path.join(process.env.RUNNER_TEMP||repo,"salomao-change.json");
    if(fs.existsSync(taskFile))change=JSON.parse(fs.readFileSync(taskFile,"utf8"));
    else change=(await proxy("claim")).change;
    if(!change){console.log("Nenhuma tarefa Felipe autorizada.");process.exit(0);}
    const summary=await program(change);
    if(!execFileSync("git",["status","--porcelain"],{cwd:repo,encoding:"utf8"}).trim())throw new Error("Nenhuma alteração de código foi produzida");
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP||repo,"salomao-summary.txt"),summary,"utf8");
    await proxy("update",{id:change.id,status:"programmed",result_summary:summary});
  }catch(e){
    if(change?.id)try{await proxy("update",{id:change.id,status:"failed",error_text:String(e?.stack||e)});}catch{}
    throw e;
  }
}else if(mode==="update"){
  const payload=JSON.parse(process.env.SALOMAO_UPDATE_JSON||"{}");
  await proxy("update",payload);
}else{
  throw new Error("Modo inválido");
}
