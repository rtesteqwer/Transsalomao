import { saveSharedLearning, sharedLearningEnabled } from '../../../lib/shared-learning.js';

export const runtime = 'nodejs';

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export async function GET() {
  return Response.json({ enabled: sharedLearningEnabled() }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const question = clean(body?.question, 1200);
    const correction = clean(body?.correction, 1800);

    if (!question || !correction) {
      return Response.json({ error: 'Pergunta e correção são obrigatórias.' }, { status: 400 });
    }

    const result = await saveSharedLearning({
      question,
      answer: correction,
      type: 'correction'
    });

    return Response.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Felipe IA /api/learn error:', error);
    return Response.json({ error: 'Falha ao registrar aprendizado.' }, { status: 500 });
  }
}
