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

export async function POST(request) {
  try {
    const body = await request.json();
    const mode = body?.mode === 'code' ? 'code' : 'assistant';
    const { memoryText, feedbackText } = buildContext(body?.memory, body?.feedback);
    const messages = prepareMessages(body?.messages, body?.attachments || []);

    if (!messages.length) {
      return Response.json({ error: 'Mensagem vazia.' }, { status: 400 });
    }

    if (mode === 'code') {
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

    const result = await generateText({
      model: NORMAL_MODEL,
      system: normalSystem(memoryText, feedbackText),
      messages,
      reasoning: 'high'
    });

    return Response.json({
      text: result.text || 'Não consegui gerar uma resposta.',
      model: NORMAL_MODEL,
      mode
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
