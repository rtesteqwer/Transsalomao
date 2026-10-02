import fs from 'node:fs';
import crypto from 'node:crypto';
const team='team_CmpJdXo3MzDAX3TZXFp9am5F';
const token=process.env.VERCEL_TOKEN;
if(!token)throw new Error('Missing VERCEL_TOKEN');
async function api(path,method='GET',body){const r=await fetch('https://api.vercel.com'+path+(path.includes('?')?'&':'?')+'teamId='+team,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const v=await r.json();if(!r.ok)throw new Error('Vercel API failed: '+r.status+' '+(v.error?.code||'')+' '+(v.error?.message||''));return v;}
const project=await api('/v9/projects/transisrael');
const envs=await api('/v9/projects/'+project.id+'/env');
let key=envs.envs.find(e=>e.key==='TRANSISRAEL_PROVISION_KEY');
if(!key){const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});await api('/v10/projects/'+project.id+'/env','POST',{key:'TRANSISRAEL_PROVISION_KEY',value:pair.privateKey,type:'encrypted',target:['production']});console.log('PROVISION_PUBLIC_KEY_BASE64='+Buffer.from(pair.publicKey).toString('base64'));process.exit(0);}
const privateData=await api('/v1/projects/'+project.id+'/env/'+key.id+'?decrypt=true');
const privateKey=privateData.value;
if(!privateKey)throw new Error('Provisioning key unavailable');
if(!fs.existsSync('database-envelope.json')){console.log('PROVISION_PUBLIC_KEY_BASE64='+Buffer.from(crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'})).toString('base64'));process.exit(0);}
const envelope=JSON.parse(fs.readFileSync('database-envelope.json','utf8'));
const aesKey=crypto.privateDecrypt({key:privateKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.key,'base64'));
const decipher=crypto.createDecipheriv('aes-256-gcm',aesKey,Buffer.from(envelope.iv,'base64'));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));
const db=new URL(payload.DATABASE_URL);
if(db.pathname!=='/transisrael'||db.username!=='transisrael_app')throw new Error('Independent database required');
const desired={DATABASE_URL:payload.DATABASE_URL,MANAGEMENT_SESSION_SECRET:crypto.randomBytes(48).toString('base64url'),DRIVER_SESSION_SECRET:crypto.randomBytes(48).toString('base64url'),BETTER_AUTH_SECRET:crypto.randomBytes(48).toString('base64url'),VITE_AUTH_ENABLED:'false',ADMIN_FELIPE_EMAIL:'pastorisrael'};
for(const [key,value] of Object.entries(desired)){const present=envs.envs.find(e=>e.key===key&&e.target.includes('production'));if(present){if(key.endsWith('_SECRET'))continue;await api('/v9/projects/'+project.id+'/env/'+present.id,'PATCH',{value,type:'encrypted',target:['production']});}else await api('/v10/projects/'+project.id+'/env','POST',{key,value,type:'encrypted',target:['production']});}
fs.mkdirSync('site/.vercel',{recursive:true});fs.writeFileSync('site/.vercel/project.json',JSON.stringify({orgId:team,projectId:project.id}));fs.writeFileSync('ready','yes');console.log('Independent project configured: '+project.id);
