# Felipe IA Cloud

Versão da Felipe IA independente do notebook Ubuntu.

## Arquitetura

- Frontend e API: Next.js na Vercel.
- IA principal: Qwen3 VL Thinking via Vercel AI Gateway.
- Modo Code: Qwen3 Coder Next.
- Execução de código: Vercel Sandbox, isolado do computador do usuário.
- Memória pessoal: localStorage por dispositivo, com recuperação por relevância.
- Aprendizado coletivo: perguntas/respostas e correções são anonimizadas/redigidas e salvas em Vercel Blob privado; a Felipe IA recupera aprendizado relevante de todos os usuários antes de responder.
- Correções explícitas têm prioridade sobre interações aprendidas.
- Arquivos: imagens, PDFs e arquivos de texto podem ser anexados.
- Criação de imagens: pedidos como "crie uma foto..." ou "gere uma imagem..." são roteados para um modelo de imagem pelo Vercel AI Gateway e exibidos diretamente na conversa.
- Não há integração com Trans Salomão, banco da empresa, Ollama, Ubuntu ou Cloudflare Tunnel.

## Variáveis

- FELIPE_MODEL: substitui o modelo principal.
- FELIPE_CODE_MODEL: substitui o modelo de programação.
- FELIPE_IMAGE_MODEL: substitui o modelo de criação de imagens; padrão: `google/gemini-3-pro-image`.
- BLOB_READ_WRITE_TOKEN: opção de autenticação estática para a memória coletiva.
- FELIPE_LEARNING_STORE_ID: opcional; substitui o store privado padrão da memória coletiva.
- Em produção na Vercel, a memória coletiva usa preferencialmente autenticação OIDC automática com o Blob privado `felipe-ia-learning`, sem segredo exposto no frontend.

Na Vercel, o AI Gateway pode autenticar por OIDC sem colocar uma chave de API no frontend.

## Próximos passos

1. Migrar memória/histórico pessoal do navegador para conta autenticada.
2. Adicionar autenticação multiusuário real e isolamento por usuário.
3. Evoluir o índice coletivo para RAG vetorial em nuvem com embeddings.
4. Adicionar ferramentas externas com permissões explícitas.
5. Criar suíte automática de avaliações a partir das correções aprovadas.
# Cadastro com Google

A página `/login` cria ou reconhece a conta no primeiro acesso com Google. O
modo visitante continua disponível. Auth.js valida OpenID Connect com PKCE,
state, nonce e cookies HttpOnly; a aplicação exige e-mail verificado.

Configurar no projeto **felipe-ia** da Vercel:

- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`: cliente OAuth Web do Google.
- `AUTH_URL=https://felipe-ia.vercel.app`: origem canônica do login.
- `AUTH_SECRET`: segredo aleatório de sessão. Na ausência, é derivada uma chave
  separada de `PLUGIN_SESSION_SECRET`, já utilizado pelos plugins.
- `BLOB_READ_WRITE_TOKEN`: token do armazenamento **privado** exclusivo da Felipe IA.

No Google Auth Platform, usar público Externo e publicar para permitir usuários
fora da lista de teste. O redirect autorizado para **cadastro/login** é:

`https://felipe-ia.vercel.app/api/auth/callback/google`

O login pede apenas `openid email profile`. Os callbacks de Gmail e YouTube são
fluxos separados e não substituem o callback de cadastro acima.

Cada conta possui um registro privado em `felipe-accounts-v1/`, identificado pelo
hash do `sub` do Google (não pelo e-mail), contendo nome, e-mail e último login.
Não guardamos access/refresh tokens do login. Falhas de persistência impedem o
cadastro em vez de retornar sucesso sem registro. A sessão expira em sete dias.

Na página principal, histórico/memória ficam no localStorage com chave por conta;
não há sincronização entre dispositivos nem migração automática do histórico do
visitante. Credenciais de plugins são vinculadas à conta da sessão e removidas
do navegador ao sair. A interface alternativa `/new` mantém seu modo visitante.

Validação: `node --test tests/*.test.mjs` e `npm run build`. Testar em produção o
primeiro cadastro, novo login na mesma conta, troca de conta, cancelamento e saída
depois que as credenciais reais forem configuradas. Não colocar segredos no Git.
