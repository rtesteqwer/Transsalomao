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
- Não há integração com Trans Salomão, banco da empresa, Ollama, Ubuntu ou Cloudflare Tunnel.

## Variáveis

- FELIPE_MODEL: substitui o modelo principal.
- FELIPE_CODE_MODEL: substitui o modelo de programação.
- BLOB_READ_WRITE_TOKEN: habilita a memória coletiva persistente da Felipe IA. É criada automaticamente quando um Vercel Blob privado é conectado ao projeto.

Na Vercel, o AI Gateway pode autenticar por OIDC sem colocar uma chave de API no frontend.

## Próximos passos

1. Migrar memória/histórico pessoal do navegador para conta autenticada.
2. Adicionar autenticação multiusuário real e isolamento por usuário.
3. Evoluir o índice coletivo para RAG vetorial em nuvem com embeddings.
4. Adicionar ferramentas externas com permissões explícitas.
5. Criar suíte automática de avaliações a partir das correções aprovadas.
