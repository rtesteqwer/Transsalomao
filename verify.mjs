import fs from 'node:fs';
const origin='https://transisrael.vercel.app';
const credentials=JSON.parse(fs.readFileSync(process.env.RUNNER_TEMP+'/transisrael-login-test.json','utf8'));
let r=await fetch(origin+'/api/assistant/auth');if(r.status!==401)throw new Error('Anonymous request must be rejected');
r=await fetch(origin+'/api/assistant/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...credentials,deviceLabel:'Deployment verification',remember:false})});const auth=await r.json();if(r.status!==200||!auth.ok||auth.username!=='pastorisrael'||!auth.token)throw new Error('New management login verification failed ('+r.status+')');
const headers={Authorization:'Bearer '+auth.token};r=await fetch(origin+'/api/assistant/auth',{headers});const me=await r.json();if(!me.authenticated||me.username!=='pastorisrael')throw new Error('Authenticated session verification failed');
await fetch(origin+'/api/assistant/auth',{method:'DELETE',headers});
for(const path of ['/','/dono','/motorista','/ocr/worker.min.js']){const response=await fetch(origin+path);if(!response.ok)throw new Error('Page check failed: '+path+' ('+response.status+')');console.log('Verified '+path);}
fs.unlinkSync(process.env.RUNNER_TEMP+'/transisrael-login-test.json');console.log('Verified independent management login: pastorisrael');
