// Browser test with simulated reader/upload boundaries. Never contacts production.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const source = path.resolve(process.env.TRANS_TEST_APP || '../app');
const require = createRequire(path.join(source, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')));
const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')));
const { chromium } = require('playwright');
const tmp = mkdtempSync(path.join(tmpdir(), 'driver-batch-ui-'));
symlinkSync(path.join(source, 'node_modules'), path.join(tmp, 'node_modules'));
writeFileSync(path.join(tmp, 'index.html'), '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
writeFileSync(path.join(tmp, 'main.tsx'), `
 import React, {useState} from 'react';
 import {createRoot} from 'react-dom/client';
 import {Toaster} from 'sonner';
 import {DriverTonPriceBatch} from ${JSON.stringify(path.join(source, 'src/components/driver-ton-price-batch.tsx'))};
 window.calls = {uploads: [], reads: [], saves: [], links: []};
 window.failSave = false; window.failLink = false; window.failRead = false;
 const noop = () => {};
 function Harness() {
   const [busy, setBusy] = useState(false);
   return <><Toaster/><fieldset disabled={busy}><DriverTonPriceBatch available
     onBusy={setBusy} onPending={noop} onSaved={async () => {}}
     upload={async file => { window.calls.uploads.push(file.name); return {id: file.name, imageData: 'image-'+file.name}; }}
     read={async (image, fileName) => {
       window.calls.reads.push(fileName);
       if (window.failRead) {window.failRead=false; throw new Error('Leitura temporariamente indisponível');}
       const i = Number(fileName.match(/\\d+/)?.[0] || 1);
       return {numero_ticket: 'T-'+i, peso_liquido_kg: [41340,42520,41960,42400,43660][(i-1)%5], alertas: []};
     }}
     save={async (data, price) => {
       window.calls.saves.push({ticket:data.numero_ticket, weight:data.peso_liquido_kg, price});
       if (window.failSave) {window.failSave=false; throw new Error('Falha temporária ao salvar');}
       return {reportId:'rep-'+data.numero_ticket,ticket:data.numero_ticket};
     }}
     link={async (photoId, fileName, saved) => {
       window.calls.links.push({photoId, fileName, reportId:saved.reportId});
       if(window.failLink) {window.failLink=false; throw new Error('Falha temporária ao vincular');}
     }}/></fieldset></>;
 }
 createRoot(document.getElementById('root')).render(<Harness/>);
`);
await build({ configFile: false, root: tmp, plugins: [react()], resolve: { alias: { '@': path.join(source, 'src') } }, logLevel: 'error', build: { outDir: path.join(tmp, 'dist') } });
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  try {
    const data = readFileSync(path.join(tmp, 'dist', name));
    res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch { res.statusCode=404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  const files = names => names.map(name => ({ name, mimeType: 'image/png', buffer: Buffer.from('simulated test photo') }));
  await page.getByLabel('Selecionar várias fotos', {exact: true}).setInputFiles(files(['foto1.png','foto2.png','foto3.png','foto4.png','foto5.png']));
  await page.getByRole('button', {name: 'Enviar 5 viagem(ns) selecionada(s) ao Caixa', exact: true}).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('article input[inputmode="decimal"]').length===5 && !document.querySelector('fieldset').disabled);
  assert.equal((await page.evaluate(() => window.calls.saves.length)), 0, 'reading photos must not send trips before review');
  await page.getByRole('button', {name: 'Enviar 5 viagem(ns) selecionada(s) ao Caixa', exact: true}).click();
  assert.equal((await page.evaluate(() => window.calls.saves.length)), 0, 'empty prices must block submission');
  await page.getByLabel('Preço por tonelada do grupo', {exact:true}).fill('14,125');
  await page.getByRole('button', {name:'Aplicar preço às 5 selecionadas', exact:true}).click();
  for(let i=1;i<=5;i++) assert.equal(await page.getByLabel('Preço da foto '+i,{exact:true}).inputValue(),'14,125');
  await page.getByLabel('Selecionar foto 5',{exact:true}).uncheck();
  await page.getByLabel('Preço por tonelada do grupo',{exact:true}).fill('15,50');
  await page.getByRole('button', {name:'Aplicar preço às 4 selecionadas', exact:true}).click();
  assert.equal(await page.getByLabel('Preço da foto 5',{exact:true}).inputValue(),'14,125');
  await page.getByRole('button', {name:'Enviar 4 viagem(ns) selecionada(s) ao Caixa', exact:true}).click();
  await page.waitForFunction(() => window.calls.links.length===4 && !document.querySelector('fieldset').disabled);
  const calls = await page.evaluate(() => window.calls);
  assert.deepEqual(calls.saves.map(x=>x.weight), [41340,42520,41960,42400]);
  assert.ok(calls.saves.every(x=>x.price===15.5));
  await page.getByLabel('Selecionar foto 5',{exact:true}).check();
  await page.evaluate(() => { window.failLink=true; });
  await page.getByRole('button', {name:'Enviar 1 viagem(ns) selecionada(s) ao Caixa', exact:true}).click();
  await page.getByText('A viagem está salva.',{exact:false}).waitFor();
  assert.equal((await page.evaluate(()=>window.calls.saves)).at(-1).price,14.125);
  await page.getByRole('button', {name:'Enviar 1 viagem(ns) selecionada(s) ao Caixa', exact:true}).click();
  await page.waitForFunction(() => window.calls.links.length===6 && !document.querySelector('fieldset').disabled);
  assert.equal(await page.evaluate(()=>window.calls.saves.length),5,'retrying photo link must not save the trip again');
  assert.equal(await page.getByRole('button',{name:'Enviar 0 viagem(ns) selecionada(s) ao Caixa',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Limpar lista',exact:true}).click();
  await page.evaluate(()=>{window.failRead=true;});
  await page.getByLabel('Selecionar várias fotos',{exact:true}).setInputFiles(files(['foto6.png']));
  await page.getByRole('button',{name:'Tentar leitura novamente',exact:true}).click();
  await page.getByLabel('Ticket da foto 1',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calls.uploads.length),6,'retrying reading must reuse the saved photo');
  assert.equal(await page.getByLabel('Ticket da foto 1',{exact:true}).inputValue(),'T-6');
  assert.deepEqual(errors,[]);
  console.log('PASS: 5 photos, exact weights, group/subset prices, missing-price guard, partial-link retry and read retry at mobile width.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  rmSync(tmp,{recursive:true,force:true});
}
