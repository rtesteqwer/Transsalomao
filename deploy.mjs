import fs from 'node:fs';
const team='team_CmpJdXo3MzDAX3TZXFp9am5F';
const token=process.env.VERCEL_TOKEN;if(!token)throw new Error('Missing deployment token');
const r=await fetch('https://api.vercel.com/v9/projects/transisrael?teamId='+team,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw new Error('Cannot access Trans Israel project');const project=await r.json();
if(project.id!=='prj_shn9m1QZ20AsFOQvQk0Mn9buPbok')throw new Error('Unexpected deployment project');
fs.mkdirSync('site/.vercel',{recursive:true});fs.writeFileSync('site/.vercel/project.json',JSON.stringify({orgId:team,projectId:project.id}));fs.writeFileSync('ready','yes');console.log('Linked independent Trans Israel project');
