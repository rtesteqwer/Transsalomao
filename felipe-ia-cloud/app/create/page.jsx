'use client';

import { useState } from 'react';

const tools = [
  { id: 'image', icon: '🎨', title: 'Imagens', desc: 'Crie imagens a partir de uma descrição.' },
  { id: 'video', icon: '🎬', title: 'Vídeos', desc: 'Crie roteiro, cenas, narração e storyboard.' },
  { id: 'sheet', icon: '📊', title: 'Planilhas', desc: 'Monte tabelas que abrem no Excel.' },
  { id: 'pdf', icon: '📄', title: 'PDFs', desc: 'Formate documentos para salvar como PDF.' }
];

function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function csvCell(value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }

export default function CreatePage() {
  const [active, setActive] = useState('image');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [images, setImages] = useState([]);

  async function generateWithAI(kind) {
    if (!prompt.trim()) { setError('Descreva o que você quer criar.'); return; }
    setBusy(true); setError(''); setResult(''); setImages([]);
    try {
      const request = kind === 'image'
        ? `Crie uma imagem original com base nesta descrição. Retorne a imagem gerada, não apenas um prompt: ${prompt}`
        : `Crie um material completo em português para este pedido: ${prompt}. ${kind === 'video' ? 'Entregue título, gancho inicial, roteiro por cenas com duração, narração, textos na tela, sugestões visuais e chamada final.' : 'Organize o conteúdo com título, seções, tabelas em texto quando úteis e conclusão.'}`;
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'assistant', messages: [{ role: 'user', content: request }], attachments: [], memory: [], feedback: [] }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Não foi possível gerar o material.');
      setResult(data.text || 'Material gerado.');
      setImages(Array.isArray(data.images) ? data.images.filter(x => x?.dataUrl) : []);
    } catch (e) { setError(e.message || 'Falha ao gerar.'); }
    finally { setBusy(false); }
  }
  function createSheet() {
    const rows = prompt.trim().split('\n').map(line => line.split(/[;\t,]/).map(x => x.trim()));
    const content = '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
    download('planilha-felipe-ia.csv', content, 'text/csv;charset=utf-8');
    setResult('Planilha compatível com Excel criada. Escreva uma linha por registro e separe as colunas por ponto e vírgula, vírgula ou tabulação.');
    setError('');
  }
  function createPdf() {
    if (!prompt.trim()) { setError('Escreva o conteúdo do documento.'); return; }
    const escaped = prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Documento - Felipe IA</title><style>body{font:12pt Arial,sans-serif;color:#222;max-width:800px;margin:45px auto;line-height:1.6}h1{font-size:22pt;border-bottom:2px solid #222;padding-bottom:12px}pre{font:12pt Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:20mm}}</style><body><h1>Documento</h1><pre>${escaped}</pre><script>window.onload=()=>window.print()<\/script></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob); const w = window.open(url, '_blank');
    if (!w) { download('documento-felipe-ia.html', html, 'text/html;charset=utf-8'); setError('O navegador bloqueou a janela. Baixei um HTML que pode ser impresso como PDF.'); }
    else setResult('Documento aberto para impressão. Na janela aberta, escolha “Salvar como PDF”.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const selected = tools.find(x => x.id === active);
  return <main className="createPage">
    <header className="createHeader"><a href="/" className="createBack">← Voltar à Felipe IA</a><div><span className="createEyebrow">FELIPE IA · ESTÚDIO</span><h1>Central de Criação</h1><p>Transforme ideias em materiais prontos para usar.</p></div></header>
    <nav className="createTools">{tools.map(tool => <button key={tool.id} className={`createTool ${active === tool.id ? 'active' : ''}`} onClick={() => { setActive(tool.id); setError(''); setResult(''); setImages([]); }}><span className="createToolIcon">{tool.icon}</span><strong>{tool.title}</strong><small>{tool.desc}</small></button>)}</nav>
    <section className="createPanel"><div className="createPanelTitle"><span>{selected.icon}</span><div><h2>{selected.title}</h2><p>{selected.desc}</p></div></div>
      <label htmlFor="createPrompt">{active === 'sheet' ? 'Dados da planilha' : active === 'pdf' ? 'Conteúdo do documento' : active === 'video' ? 'Descreva o vídeo que você quer planejar' : 'Descreva a imagem que você quer gerar'}</label>
      <textarea id="createPrompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={active === 'sheet' ? 'Ex.: Nome;Valor;Data\nDiesel;850,50;10/10/2026\nPedágio;120,00;10/10/2026' : active === 'pdf' ? 'Digite ou cole o conteúdo do documento…' : active === 'video' ? 'Ex.: vídeo vertical de 30 segundos sobre caminhões, com narração dinâmica…' : 'Ex.: foto realista de uma carreta azul na estrada ao amanhecer…'} rows={7}/>
      <div className="createActions">{active === 'sheet' ? <button className="createPrimary" onClick={createSheet}>⇩ Gerar planilha Excel-compatível</button> : active === 'pdf' ? <button className="createPrimary" onClick={createPdf}>▤ Preparar PDF para impressão</button> : <button className="createPrimary" disabled={busy} onClick={() => generateWithAI(active)}>{busy ? 'Criando…' : active === 'image' ? '✦ Gerar imagem com IA' : '✦ Gerar roteiro e storyboard'}</button>}<button className="createSecondary" onClick={() => { setPrompt(''); setResult(''); setImages([]); setError(''); }}>Limpar</button></div>
      {error && <div className="createError">{error}</div>}
      {busy && <div className="createBusy"><span/> A Felipe IA está trabalhando…</div>}
      {!!images.length && <div className="createImages">{images.map((image, i) => <figure key={image.id || i}><img src={image.dataUrl} alt={`Imagem gerada ${i + 1}`}/><span>Imagem {i + 1}</span><a href={image.dataUrl} download={`felipe-ia-imagem-${i + 1}.png`}>Baixar imagem</a></figure>)}</div>}
      {result && <div className="createResult"><div className="createResultHead"><strong>Resultado</strong><button onClick={() => navigator.clipboard?.writeText(result)}>Copiar texto</button><button onClick={() => download(active === 'video' ? 'roteiro-video.txt' : 'material-felipe-ia.txt', result)}>Baixar TXT</button></div><pre>{result}</pre></div>}
      <p className="createNote">Imagens e roteiros usam os modelos configurados na Felipe IA. Planilhas são exportadas em CSV compatível com Excel; para PDFs, use “Salvar como PDF” na janela de impressão. A ferramenta de vídeo gera roteiro/storyboard, não um MP4 final.</p>
    </section>
  </main>;
}
