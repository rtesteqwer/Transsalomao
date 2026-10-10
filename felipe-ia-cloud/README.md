# Felipe IA Cloud

Versão da Felipe IA independente do notebook Ubuntu.

## Arquitetura

- Frontend e API: Next.js na Vercel.
- IA principal: Qwen3 VL Thinking via Vercel AI Gateway.
- Modo Code: Qwen3 Coder Next.
- Execução de código: Vercel Sandbox, isolado do computador do usuário.
- Memória pessoal: localStorage por dispositivo, com recuperação por relevância.
- Aprendizado coletivo: apenas correções enviadas explicitamente são salvas no Vercel Blob privado; conversas privadas não são gravadas automaticamente no aprendizado coletivo.
- Correções explícitas têm prioridade sobre interações aprendidas.
- Arquivos: imagens, PDFs e arquivos de texto podem ser anexados.
- Criação de imagens: pedidos como "crie uma foto..." ou "gere uma imagem..." são roteados para um modelo de imagem pelo Vercel AI Gateway e exibidos diretamente na conversa.
- Não há integração com Trans Salomão, banco da empresa, Ollama, Ubuntu ou Cloudflare Tunnel.

## Autenticação

- O app exige código de acesso no servidor; não existe usuário fixo `felipe` no formulário nem credencial hardcoded no repositório.
- Configure `FELIPE_IA_ACCESS_PASSWORD` e `FELIPE_IA_SESSION_SECRET` como variáveis sensíveis na Vercel.
- Sessões são assinadas no servidor, usam cookie `HttpOnly`/`SameSite=Strict`, expiram em 8 horas e podem ser encerradas pelo botão **Sair**.
- A autenticação protege páginas e rotas `/api/*`; mutações exigem origem same-origin. Se as variáveis estiverem ausentes, o app bloqueia o acesso em vez de ficar público.

## Variáveis

- FELIPE_MODEL: substitui o modelo principal.
- FELIPE_CODE_MODEL: substitui o modelo de programação.
- FELIPE_IMAGE_MODEL: substitui o modelo de criação de imagens; padrão: `google/gemini-3-pro-image`.
- BLOB_READ_WRITE_TOKEN: opção de autenticação estática para a memória coletiva.
- FELIPE_LEARNING_STORE_ID: opcional; substitui o store privado padrão da memória coletiva.
- Em produção na Vercel, a memória coletiva usa preferencialmente autenticação OIDC automática com o Blob privado `felipe-ia-learning`, sem segredo exposto no frontend.

Na Vercel, o AI Gateway pode autenticar por OIDC sem colocar uma chave de API no frontend.

## Próximos passos

1. Implementar contas individuais com banco de usuários e isolamento de memória/histórico por conta.
2. Evoluir o índice coletivo para RAG vetorial em nuvem com embeddings.
3. Adicionar ferramentas externas com permissões explícitas.
4. Criar suíte automática de avaliações a partir das correções aprovadas.
