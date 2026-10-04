import { get, put } from '@vercel/blob';

const INDEX_PATH = 'felipe-learning-v1/index.json';
const MAX_ITEMS = 600;

function clean(value, max = 1800) {
  return String(value ?? '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removido]')
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-\s]?\d{4}\b/g, '[telefone removido]')
    .replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g, '[cpf removido]')
    .replace(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g, '[cnpj removido]')
    .replace(/\b(?:sk|npg)_[A-Za-z0-9_-]{12,}\b/g, '[segredo removido]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{16,}\b/gi, 'Bearer [segredo removido]')
    .replace(/\b(senha|password|token|secret|api[-_ ]?key)\s*[:=]\s*\S+/gi, '$1=[segredo removido]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function tokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9_]+/)
      .filter(x => x.length > 2)
  );
}

function fingerprint(question, answer, type) {
  const source = `${type}|${question}|${answer}`;
  let h = 2166136261;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function enabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readIndex() {
  if (!enabled()) return [];
  try {
    const result = await get(INDEX_PATH, { access: 'private' });
    if (!result?.stream) return [];
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('not found')) return [];
    console.error('Felipe IA shared learning read error:', error);
    return [];
  }
}

async function writeIndex(items) {
  if (!enabled()) return false;
  try {
    await put(
      INDEX_PATH,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        items: items.slice(-MAX_ITEMS)
      }),
      {
        access: 'private',
        allowOverwrite: true,
        contentType: 'application/json'
      }
    );
    return true;
  } catch (error) {
    console.error('Felipe IA shared learning write error:', error);
    return false;
  }
}

export async function loadRelevantSharedKnowledge(query, limit = 8) {
  if (!enabled()) {
    return { enabled: false, items: [], text: 'Aprendizado coletivo persistente indisponível neste ambiente.' };
  }

  const items = await readIndex();
  const queryTokens = tokens(query);

  const ranked = items
    .map(item => {
      const itemTokens = tokens(`${item.question || ''} ${item.answer || ''}`);
      let score = 0;
      for (const token of queryTokens) if (itemTokens.has(token)) score += 1;
      if (item.type === 'correction') score += 2;
      return { item, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.item.createdAt || 0) - (a.item.createdAt || 0))
    .slice(0, limit)
    .map(x => x.item);

  const text = items.length
    ? ranked.map((item, i) => {
        const label = item.type === 'correction' ? 'Correção compartilhada' : 'Interação aprendida';
        return `${i + 1}. ${label}\nPergunta/contexto: ${item.question}\nConhecimento/resposta: ${item.answer}`;
      }).join('\n\n') || 'Nenhum aprendizado coletivo relevante para esta pergunta.'
    : 'A memória coletiva ainda está vazia e começará a aprender com as interações.';

  return { enabled: true, items: ranked, text };
}

export async function saveSharedLearning({ question, answer, type = 'interaction' }) {
  if (!enabled()) return { enabled: false, saved: false };

  const safeQuestion = clean(question, 1200);
  const safeAnswer = clean(answer, type === 'correction' ? 1800 : 1600);

  if (!safeQuestion || !safeAnswer) return { enabled: true, saved: false };

  const id = fingerprint(safeQuestion, safeAnswer, type);
  const current = await readIndex();
  const withoutDuplicate = current.filter(item => item?.id !== id);

  const next = [
    ...withoutDuplicate,
    {
      id,
      type: type === 'correction' ? 'correction' : 'interaction',
      question: safeQuestion,
      answer: safeAnswer,
      createdAt: Date.now()
    }
  ];

  const saved = await writeIndex(next);
  return { enabled: true, saved };
}

export function sharedLearningEnabled() {
  return enabled();
}
