import { generateText, stepCountIs } from 'ai';
import { executeCode } from 'ai-sdk-tool-code-execution';
import {
  TASK,
  buildAgentSystem,
  buildReviewSystem,
  classifyTask,
  parseReviewedAnswer,
  publicModeForTask,
  shouldReview
} from '../../../lib/agent-core.js';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NORMAL_MODEL = process.env.FELIPE_MODEL || 'alibaba/qwen3-vl-thinking';
const CODE_MODEL = process.env.FELIPE_CODE_MODEL || 'alibaba/qwen3-coder-next';

function cleanString(value, max = 12000) {
  return String(value ?? '').slice(0, max);
}

function buildContext(memory = [], feedback = []) {
  const mem = memory
    .slice(0, 12)
    .map((item, i) => `${i + 1}. ${cleanString(typeof item === 'string' ? item : item?.text, 1800)}`)
    .join('\n');

  const fixes = feedback
    .slice(0, 10)
    .map((item, i) => {
      const q = cleanString(item?.question, 900);
      const c = cleanString(item?.correction, 1500);
      return `${i + 1}. Pergunta/situação: ${q}\n   Correção aprovada: ${c}`;
    })
    .join('\n');

  return {
    memoryText: mem || 'Nenhuma memória relevante recuperada.',
    feedbackText: fixes || 'Nenhuma correção relevante recuperada.'
  };
}

function prepareMessages(messages = [], attachments = []) {
  const safe = messages
    .slice(-24)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({
      role: m.role,
      content: cleanString(m.content, 24000)
    }));

  if (!attachments.length || !safe.length) return safe;

  let lastUser = -1;
  for (let i = safe.length - 1; i >= 0; i--) {
    if (safe[i].role === 'user') {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return safe;

  const parts = [{ type: 'text', text: safe[lastUser].content || 'Analise os arquivos anexados.' }];

  for (const file of attachments.slice(0, 4)) {
    const name = cleanString(file?.name, 180);
    const type = cleanString(file?.type, 120);
    const dataUrl = typeof file?.dataUrl === 'string' ? file.dataUrl : '';
    const text = typeof file?.text === 'string' ? file.text.slice(0, 60000) : '';

    if (type.startsWith('image/') && dataUrl.startsWith('data:image/')) {
      parts.push({ type: 'image', image: dataUrl });
    } else if (type === 'application/pdf' && dataUrl.startsWith('data:application/pdf')) {
      parts.push({
        type: 'file',
        mediaType: 'application/pdf',
        data: dataUrl,
        filename: name || 'documento.pdf'
      });
    } else if (text) {
      parts.push({
        type: 'text',
        text: `\n--- ARQUIVO: ${name || 'texto'} ---\n${text}\n--- FIM DO ARQUIVO ---`
      });
    }
  }

  safe[lastUser] = { role: 'user', content: parts };
  return safe;
}

function latestUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return cleanString(messages[i]?.content, 24000);
  }
  return '';
}

function hasVisualAttachment(attachments = []) {
  return attachments.some(file => {
    const type = String(file?.type || '');
    return type === 'application/pdf' || type.startsWith('image/');
  });
}

async function reviewDraft({ task, draft, contextText }) {
  if (!shouldReview(task, contextText)) {
    return { answer: draft, reviewed: false, changed: false };
  }

  const review = await generateText({
    model: NORMAL_MODEL,
    system: buildReviewSystem(task),
    messages: [
      {
        role: 'user',
        content: [
          'PEDIDO/CONTEXTO RESUMIDO:',
          cleanString(contextText, 7000),
          '',
          'RESPOSTA CANDIDATA:',
          cleanString(draft, 22000)
        ].join('\n')
      }
    ],
    reasoning: 'high'
  });

  return parseReviewedAnswer(review.text, draft);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedMode =
      body?.mode === 'code' ? 'code' :
      body?.mode === 'assistant' ? 'assistant' :
      'auto';

    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];

    let task = classifyTask({
      messages: rawMessages,
      attachments,
      requestedMode
    });

    if (task === TASK.CODE && hasVisualAttachment(attachments)) {
      task = TASK.MIXED;
    }

    const { memoryText, feedbackText } = buildContext(body?.memory, body?.feedback);
    const messages = prepareMessages(rawMessages, attachments);

    if (!messages.length) {
      return Response.json({ error: 'Mensagem vazia.' }, { status: 400 });
    }

    const system = buildAgentSystem({ task, memoryText, feedbackText });
    const contextText = latestUserText(rawMessages);
    let draft = '';
    let toolSteps = 0;
    let verifiedByExecution = false;

    if (task === TASK.CODE) {
      const result = await generateText({
        model: CODE_MODEL,
        system,
        messages,
        tools: {
          executeCode: executeCode()
        },
        stopWhen: stepCountIs(6)
      });

      draft = result.text || 'Não consegui concluir a tarefa de programação.';
      toolSteps = Array.isArray(result.steps) ? result.steps.length : 0;
      verifiedByExecution = toolSteps > 0;
    } else {
      const result = await generateText({
        model: NORMAL_MODEL,
        system,
        messages,
        reasoning: 'high'
      });

      draft = result.text || 'Não consegui gerar uma resposta.';
    }

    const reviewed = await reviewDraft({
      task,
      draft,
      contextText
    });

    return Response.json({
      text: reviewed.answer,
      mode: publicModeForTask(task),
      task,
      verified: reviewed.reviewed || verifiedByExecution,
      corrected: reviewed.changed,
      toolSteps
    }, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    console.error('Felipe IA /api/chat error:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return Response.json(
      {
        error: 'A Felipe IA encontrou um erro ao processar a solicitação.',
        detail: process.env.NODE_ENV === 'development' ? message : undefined
      },
      { status: 500 }
    );
  }
}
