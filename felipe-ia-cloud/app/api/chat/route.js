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
import { loadRelevantSharedKnowledge } from '../../../lib/shared-learning.js';
import {
  enqueueSelfProgrammingTask,
  isSelfProgrammingRequest,
  selfProgrammingEnabled
} from '../../../lib/self-programming.js';
import { getPluginTools } from '../../../lib/plugin-tools.js';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NORMAL_MODEL = process.env.FELIPE_MODEL || 'alibaba/qwen3-vl-thinking';
const CODE_MODEL = process.env.FELIPE_CODE_MODEL || 'alibaba/qwen3-coder-next';
const IMAGE_MODEL = process.env.FELIPE_IMAGE_MODEL || 'google/gemini-3-pro-image';

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

function generatedImages(files = []) {
  return (Array.isArray(files) ? files : [])
    .filter(file => String(file?.mediaType || '').startsWith('image/'))
    .slice(0, 4)
    .map((file, index) => {
      const mediaType = String(file.mediaType || 'image/png');
      let base64 = '';

      if (typeof file.base64 === 'string' && file.base64) {
        base64 = file.base64;
      } else if (file.uint8Array) {
        base64 = Buffer.from(file.uint8Array).toString('base64');
      }

      if (!base64) return null;

      return {
        id: 'generated-' + Date.now() + '-' + index,
        mediaType,
        dataUrl: `data:${mediaType};base64,${base64}`
      };
    })
    .filter(Boolean);
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

    const contextText = latestUserText(rawMessages);
    const wantsSelfProgramming = isSelfProgrammingRequest(contextText);
    const sharedLearning = await loadRelevantSharedKnowledge(contextText);
    const system = buildAgentSystem({
      task,
      memoryText,
      feedbackText,
      sharedKnowledgeText: sharedLearning.text,
      sharedLearningEnabled: sharedLearning.enabled,
      selfProgrammingEnabled: selfProgrammingEnabled()
    });
    const pluginTools = await getPluginTools();
    const hasPluginTools = Object.keys(pluginTools).length > 0;
    let draft = '';
    let images = [];
    let toolSteps = 0;
    let verifiedByExecution = false;

    if (task === TASK.IMAGE_GENERATION) {
      const result = await generateText({
        model: IMAGE_MODEL,
        system,
        messages
      });

      images = generatedImages(result.files);
      draft = String(result.text || '').trim() || (images.length ? 'Imagem gerada.' : '');

      if (!images.length) {
        throw new Error('O modelo de imagem não retornou uma imagem.');
      }

      verifiedByExecution = true;
    } else if (task === TASK.CODE) {
      const result = await generateText({
        model: CODE_MODEL,
        system,
        messages,
        tools: {
          executeCode: executeCode(),
          ...pluginTools
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
        reasoning: 'high',
        ...(hasPluginTools ? {
          tools: pluginTools,
          stopWhen: stepCountIs(6)
        } : {})
      });

      draft = result.text || 'Não consegui gerar uma resposta.';
      toolSteps = Array.isArray(result.steps) ? result.steps.length : 0;
      verifiedByExecution = toolSteps > 0;
    }

    const reviewed = await reviewDraft({
      task,
      draft,
      contextText
    });

    // Não persistir conversas privadas automaticamente no aprendizado compartilhado.
    const learned = { saved: false };

    const selfProgramming = wantsSelfProgramming
      ? await enqueueSelfProgrammingTask({
          request: contextText,
          userId: 'authenticated-session'
        })
      : { enabled: selfProgrammingEnabled(), queued: false };

    let finalAnswer = reviewed.answer;
    if (selfProgramming?.queued) {
      finalAnswer += `\n\nAutoprogramação: tarefa ${selfProgramming.taskId} registrada. A Felipe IA vai criar a alteração em uma branch isolada, executar o build e abrir um PR para aprovação antes de qualquer mudança em produção.`;
    }

    return Response.json({
      text: finalAnswer,
      mode: publicModeForTask(task),
      task,
      verified: reviewed.reviewed || verifiedByExecution,
      corrected: reviewed.changed,
      toolSteps,
      images,
      sharedLearning: {
        enabled: sharedLearning.enabled,
        used: sharedLearning.items.length,
        saved: learned.saved
      },
      selfProgramming
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
