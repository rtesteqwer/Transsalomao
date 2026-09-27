const crypto=require('crypto');
const USERS={
ricardo:{salt:'4d69b23270903f53ad136a4f4333941b',hash:'c70a6d10efa80695ce2f376908fce7484cfed6a136e6b5aa6d6f5e691378cef2'},
felipe:{salt:'b1e4ad5142083550d9d0d2f15bb598dc',hash:'7fd54508e0d0927a32cd69e1199a88b2c093aa4d6a3f1aa52368b57506623a19'}};
const SESSION_KEY='31bf107c7715e151f3e6a82066e0b5fc57296ed4d093b309492030daea1e46e5';
const sign=v=>crypto.createHmac('sha256',SESSION_KEY).update(v).digest('hex');
function verify(p,r){const h=crypto.pbkdf2Sync(String(p),r.salt,200000,32,'sha256').toString('hex');return crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(r.hash,'hex'))}
module.exports=(req,res)=>{if(req.method!=='POST')return res.status(405).end();const {username='',password=''}=req.body||{};const u=String(username).trim().toLowerCase(),r=USERS[u];if(!r||!verify(password,r))return setTimeout(()=>res.status(401).json({ok:false}),500);const p=Buffer.from(JSON.stringify({u,exp:Date.now()+28800000})).toString('base64url');const t=p+'.'+sign(p);res.setHeader('Set-Cookie',`rifaaimores_session=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);res.json({ok:true,user:u})};