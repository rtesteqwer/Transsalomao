import OpenAI from 'openai';
import { generateText, stepCountIs } from 'ai';
import { executeCode } from 'ai-sdk-tool-code-execution';

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
    .map((item, i) => `${i + 1}. ${cleanString(item, 1800)}`)
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

function normalSystem(memoryText, feedbackText) {
  return `Você é Felipe IA, um assistente pessoal independente, executando 100% em nuvem.

REGRAS CENTRAIS:
- Não dependa de Ubuntu, Ollama, notebook local ou túnel Cloudflare.
- Não mostre, consulte, misture ou invente dados da Trans Salomão. Felipe IA é separada da Trans Salomão IA.
- Responda em português do Brasil por padrão, salvo pedido diferente.
- Seja preciso, útil e objetivo. Quando não souber, diga que não sabe.
- Para imagens e PDFs, leia o conteúdo visual/documental com atenção e diferencie fato de inferência.
- Use as memórias abaixo apenas quando forem realmente relevantes.
- Dê prioridade às correções aprovadas pelo usuário quando elas se aplicarem ao caso atual.
- Nunca afirme que executou uma ação externa quando não executou.

MEMÓRIAS RELEVANTES:
${memoryText}

CORREÇÕES APROVADAS:
${feedbackText}`;
}

function codeSystem(memoryText, feedbackText) {
  return `Você é Felipe Code, o modo de programação da Felipe IA.

OBJETIVO:
Resolver tarefas de programação com raciocínio, geração de código, testes e verificação em ambiente isolado.

REGRAS:
- Você é independente de ChatGPT/Codex como produto; o seu modelo principal é Qwen3 Coder.
- Use a ferramenta de execução de código quando isso aumentar a confiabilidade da resposta.
- O ambiente de execução é um sandbox efêmero: não confunda com o computador do usuário.
- Nunca alegue ter alterado arquivos, servidores, GitHub ou Vercel do usuário sem uma ferramenta específica para isso.
- Não tente acessar segredos, process.env, credenciais, rede privada ou dados da Trans Salomão.
- Faça testes antes de declarar que um código está correto quando for possível testar no sandbox.
- Prefira mudanças pequenas, verificáveis e reversíveis.
- Se a tarefa for apenas explicar código, não execute ferramentas desnecessariamente.

MEMÓRIAS RELEVANTES:
${memoryText}

CORREÇÕES APROVADAS:
${feedbackText}`;
}

function buildResponsesInput(messages = [], attachments = []) {
  const history = messages
    .slice(-18)
    .map(m => `${m.role === 'assistant' ? 'Felipe IA' : 'Usuário'}: ${cleanString(m.content, 14000)}`)
    .join('\n\n');

  const content = [
    {
      type: 'input_text',
      text: history || 'Usuário: Analise os arquivos anexados.'
    }
  ];

  for (const file of attachments.slice(0, 4)) {
    const name = cleanString(file?.name, 180);
    const type = cleanString(file?.type, 120);
    const dataUrl = typeof file?.dataUrl === 'string' ? file.dataUrl : '';
    const text = typeof file?.text === 'string' ? file.text.slice(0, 60000) : '';

    if (type.startsWith('image/') && dataUrl.startsWith('data:image/')) {
      content.push({
        type: 'input_image',
        image_url: dataUrl,
        detail: 'auto'
      });
    } else if (type === 'application/pdf' && dataUrl.startsWith('data:application/pdf')) {
      content.push({
        type: 'input_file',
        filename: name || 'documento.pdf',
        file_data: dataUrl
      });
    } else if (text) {
      content.push({
        type: 'input_text',
        text: `\n--- ARQUIVO: ${name || 'texto'} ---\n${text}\n--- FIM DO ARQUIVO ---`
      });
    }
  }

  return [
    {
      role: 'user',
      content
    }
  ];
}

function gatewayClient() {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    const error = new Error('A autenticação OIDC da Vercel não está disponível neste deploy.');
    error.code = 'missing_gateway_auth';
    throw error;
  }

  return new OpenAI({
    apiKey,
    baseURL: 'https://ai-gateway.vercel.sh/v1'
  });
}

function friendlyError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = cleanString(error?.code || error?.error?.code || '', 120).toLowerCase();
  const raw = cleanString(error?.message || error?.error?.message || 'Erro desconhecido', 700)
    .replace(/(?:sk|vcp|vercel_[a-z0-9_-]*)-[A-Za-z0-9_-]{12,}/gi, '[segredo ocultado]');

  if (code.includes('missing_gateway_auth')) {
    return 'A Felipe IA está publicada, mas o Vercel AI Gateway não recebeu a autenticação OIDC deste deploy.';
  }
  if (status === 401 || status === 403) {
    return 'O Vercel AI Gateway recusou a autenticação deste deploy. Vou manter o erro identificado para corrigir a autorização do Gateway.';
  }
  if (status === 402 || code.includes('quota') || code.includes('credit') || raw.toLowerCase().includes('credit')) {
    return 'O Vercel AI Gateway está sem créditos disponíveis para executar o modelo Qwen.';
  }
  if (status === 413 || raw.toLowerCase().includes('too large')) {
    return 'O arquivo enviado é maior do que o limite aceito. Envie uma imagem ou PDF menor.';
  }
  if (status === 429) {
    return 'O Vercel AI Gateway atingiu o limite temporário de solicitações. Tente novamente em alguns instantes.';
  }

  return `Falha no Vercel AI Gateway: ${raw}`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const mode = body?.mode === 'code' ? 'code' : 'assistant';
    const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
    const { memoryText, feedbackText } = buildContext(body?.memory, body?.feedback);
    const baseMessages = Array.isArray(body?.messages) ? body.messages : [];

    if (!baseMessages.length) {
      return Response.json({ error: 'Mensagem vazia.' }, { status: 400 });
    }

    if (mode === 'code') {
      const messages = prepareMessages(baseMessages, attachments);
      const result = await generateText({
        model: CODE_MODEL,
        system: codeSystem(memoryText, feedbackText),
        messages,
        tools: {
          executeCode: executeCode()
        },
        stopWhen: stepCountIs(4)
      });

      return Response.json({
        text: result.text || 'Tarefa concluída no modo Code.',
        model: CODE_MODEL,
        mode,
        toolSteps: Array.isArray(result.steps) ? result.steps.length : 0
      });
    }

    const client = gatewayClient();
    const response = await client.responses.create({
      model: NORMAL_MODEL,
      instructions: normalSystem(memoryText, feedbackText),
      input: buildResponsesInput(baseMessages, attachments)
    });

    return Response.json({
      text: response.output_text || 'Não consegui gerar uma resposta.',
      model: NORMAL_MODEL,
      mode
    });
  } catch (error) {
    console.error('Felipe IA /api/chat error:', {
      name: error?.name,
      status: error?.status,
      code: error?.code,
      message: error?.message
    });

    return Response.json(
      {
        error: friendlyError(error)
      },
      { status: 500 }
    );
  }
}
