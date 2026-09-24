# Salomão IA — cópia para edição

Esta branch é uma cópia isolada da branch `main` criada em 24/09/2026 para permitir edição por outra ferramenta sem alterar a versão de produção.

## Branch
`salomao-ia-copia-edicao-20260924`

## Núcleo da Salomão IA

### 1. Assistente web
- `assistant-v4/api-assistant.ts` — endpoint principal do assistente, autenticação, histórico e capacidades.
- `assistant-v4/salomao-ai.server.ts` — seleção do modelo e carregamento seguro da chave OpenAI.
- `assistant-v4/api-assistant-auth.ts` — autenticação do assistente.
- `assistant-v4/api-assistant-status.ts` — status/configuração.
- `assistant-v4/assistant-auth.server.ts` — regras de sessão/autorização.
- `assistant-v4/management-auth.server.ts` — integração com autenticação da gerência.
- `assistant-v4/0012_management_users_assistant_sessions.sql` — estruturas de banco usadas pelo assistente.

### 2. Salomão IA por voz / Android
- `android-voice/` — app Android de voz.
- `android-voice/app/src/main/java/com/transsalomao/voice/MainActivity.java`
- `android-voice/app/src/main/java/com/transsalomao/voice/SalomaoVoiceService.java`
- `android-voice/app/src/main/java/com/transsalomao/voice/WakeListenerService.java`
- `android-voice/app/src/main/java/com/transsalomao/voice/AssistantMemory.java`
- `android-voice/app/src/main/java/com/transsalomao/voice/AssistantSession.java`
- `android-voice/app/src/main/java/com/transsalomao/voice/SecureTokenStore.java`

### 3. Leitor inteligente de tickets
- `render-overrides/salomao-ticket-reader-20260924.server.ts` — leitor principal de imagens.
- `render-overrides/ticket-provider-20260924.ts` — prompt e integração com o provedor de IA.
- `render-overrides/ticket-core-20260924.ts` — normalização/validação dos campos.
- `render-overrides/ticket-reader-api-20260924.ts` — API de leitura.
- `render-overrides/ticket-save-api-20260924.ts` — gravação do ticket.
- `render-overrides/ticket-auth-20260924.server.ts` — autenticação.
- `render-overrides/ticket-meta-api-20260924.ts` — metadados.
- `render-overrides/ticket-photo-access-20260924.tsx` — acesso às fotos.
- `render-overrides/photo-ticket-api-20260924.ts` — manipulação das fotos.
- `render-overrides/driver-ticket-helpers-20260924.snippet.ts` — helpers da interface do motorista.
- `render-overrides/driver-ticket-read-handler-20260924.snippet.ts` — fluxo de leitura.
- `render-overrides/driver-ticket-submit-20260924.snippet.ts` — envio/gravação.
- `render-overrides/driver-ticket-ui-20260924.snippet.tsx` — UI.
- `render-overrides/0012_ticket_reader.sql`
- `render-overrides/0015_ticket_safety.sql`
- `render-overrides/0016_ticket_modes_metadata.sql`
- `tests/tickets.test.mjs`

## Dados principais que a IA lê
Número do ticket, peso líquido, placas do cavalo e da carreta, transportadora, operadora, contratante, destinatário, motorista, pesagens, NF, produto e alertas de confiança.

## Variáveis de ambiente
Use somente placeholders na ferramenta de edição. Não coloque chaves reais no código.

```env
OPENAI_API_KEY=
OPENAI_ASSISTANT_MODEL=
DATABASE_URL=
TICKET_AI_PROVIDER=
TICKET_OPENAI_MODEL=
```

## Regra para edição
Edite somente esta branch. Não faça merge para `main` e não publique em produção até revisar as alterações.

## Objetivo da próxima evolução
Transformar a Salomão IA em uma IA pessoal independente da Trans Salomão, mantendo módulos separados para:
1. conversa e memória;
2. voz;
3. visão/leitura de documentos;
4. acesso autorizado aos dados da empresa;
5. ações no sistema.
