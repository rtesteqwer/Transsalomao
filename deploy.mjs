import fs from 'node:fs';
import crypto from 'node:crypto';
const team='team_CmpJdXo3MzDAX3TZXFp9am5F';
const token=process.env.VERCEL_TOKEN;
if(!token) throw new Error('Missing VERCEL_TOKEN');
async function api(path,method='GET',body){
 const r=await fetch('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId='+team,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const v=await r.json();if(!r.ok) {const e=new Error('Vercel API failed: '+r.status+' '+(v.error?.code||'')+' '+(v.error?.message||''));e.status=r.status;throw e;}return v;
}
let project;
try {project=await api('/v9/projects/transisrael');} catch(e){if(e.status!==404)throw e;project=await api('/v10/projects','POST',{name:'transisrael'});}
const envs=await api('/v9/projects/prj_jB9N2LQ3grttSuBALVVGp5X5gVdH/env?decrypt=true');
const oldDb=envs.envs.find(e=>e.key==='DATABASE_URL'&&e.target.includes('production'));
if(!oldDb)throw new Error('Source database key unavailable');
const dbValue=await api('/v1/projects/prj_jB9N2LQ3grttSuBALVVGp5X5gVdH/env/'+oldDb.id+'?decrypt=true');
if(!dbValue.value?.startsWith('postgres'))throw new Error('Source database secret unavailable');
const db=new URL(dbValue.value);
if(!db.hostname.startsWith('ep-wispy-paper-acji6z3e'))throw new Error('Source database endpoint differs from verified Neon project');
db.pathname='/transisrael';
const desired={DATABASE_URL:db.toString(),MANAGEMENT_SESSION_SECRET:crypto.randomBytes(48).toString('base64url'),DRIVER_SESSION_SECRET:crypto.randomBytes(48).toString('base64url'),BETTER_AUTH_SECRET:crypto.randomBytes(48).toString('base64url'),VITE_AUTH_ENABLED:'false',ADMIN_FELIPE_EMAIL:'pastorisrael'};
const ai=envs.envs.find(e=>e.key==='OPENAI_API_KEY'&&e.target.includes('production'));
if(ai){const aiValue=await api('/v1/projects/prj_jB9N2LQ3grttSuBALVVGp5X5gVdH/env/'+ai.id+'?decrypt=true');if(aiValue.value)desired.OPENAI_API_KEY=aiValue.value;}
const existing=await api('/v9/projects/'+project.id+'/env');
for(const [key,value] of Object.entries(desired)){
 const present=existing.envs.find(e=>e.key===key&&e.target.includes('production'));
 if(present) { if(key.endsWith('_SECRET'))continue;await api('/v9/projects/'+project.id+'/env/'+present.id,'PATCH',{value,type:'encrypted',target:['production']}); }
 else await api('/v10/projects/'+project.id+'/env','POST',{key,value,type:'encrypted',target:['production']});
}
fs.mkdirSync('site/.vercel',{recursive:true});fs.writeFileSync('site/.vercel/project.json',JSON.stringify({orgId:team,projectId:project.id}));
console.log('Independent project configured: '+project.id);
