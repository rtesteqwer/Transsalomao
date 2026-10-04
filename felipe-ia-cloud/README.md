# Felipe IA Cloud

Versão da Felipe IA independente do notebook Ubuntu.

## Arquitetura

- Frontend e API: Next.js na Vercel.
- IA principal: Qwen3 VL Thinking via Vercel AI Gateway.
- Modo Code: Qwen3 Coder Next.
- Execução de código: Vercel Sandbox, isolado do computador do usuário.
- Memória atual: localStorage por dispositivo, com recuperação por relevância.
- Aprendizado atual: correções aprovadas pelo usuário são salvas e recuperadas como contexto.
- Arquivos: imagens, PDFs e arquivos de texto podem ser anexados.
- Não há integração com Trans Salomão, banco da empresa, Ollama, Ubuntu ou Cloudflare Tunnel.

## Variáveis opcionais

- FELIPE_MODEL: substitui o modelo principal.
- FELIPE_CODE_MODEL: substitui o modelo de programação.

Na Vercel, o AI Gateway pode autenticar por OIDC sem colocar uma chave de API no frontend.

## Próximos passos

1. Migrar memória/histórico do navegador para banco próprio da Felipe IA.
2. Adicionar autenticação multiusuário real e isolamento por usuário.
3. Criar RAG vetorial em nuvem com embeddings Qwen.
4. Adicionar ferramentas externas com permissões explícitas.
5. Criar suíte automática de avaliações a partir das correções aprovadas.
