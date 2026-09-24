# Tickets por foto no app do motorista

A integração usa as rotas TanStack Start existentes `/api/ler-ticket` e `/api/salvar-ticket`, instaladas por `render-overrides/apply-driver-ticket-reader-20260924.mjs` durante a reconstrução da aplicação. Não substituir o package.json do projeto: o banco Neon já usa `pg` pelo módulo `getSql`.

## Uso

Em `/motorista`, selecionar Por tonelada, entrar com uma conta existente de motorista ou gerência, tirar uma foto ou escolher da galeria, conferir o número, o peso líquido em kg e o conjunto, marcar a conferência e enviar. Um motorista autenticado só pode usar seu próprio cadastro. A gerência pode selecionar o motorista. O lançamento fica pendente na Caixa para o fechamento normal pela gerência.

O peso líquido é dividido por 1000 sem arredondamento em toneladas. Pesos bruto e de origem não substituem o líquido. As anotações manuscritas ficam separadas. Campos ilegíveis ficam vazios e geram alertas. A foto em si é enviada à IA para leitura; esta rota salva os dados extraídos e conferidos, não arquiva a imagem. O arquivo de fotos da gerência continua no fluxo existente.

## Configuração do servidor

- `DATABASE_URL`: conexão já utilizada pelo aplicativo.
- `ANTHROPIC_API_KEY`: quando presente, a leitura usa Anthropic. `CLAUDE_MODEL` tem padrão `claude-sonnet-5`.
- Se Anthropic não estiver configurada, a leitura utiliza `OPENAI_API_KEY`. `TICKET_OPENAI_MODEL` tem padrão `gpt-4.1-mini`.
- `TICKET_AI_PROVIDER`: opcional, `auto` (padrão), `anthropic` ou `openai`. Não há troca de fornecedor em caso de erro; a alternativa é escolhida pela configuração antes da requisição.
- `TICKET_TOKEN`: opcional para integrações entre servidores, com pelo menos 32 caracteres aleatórios. É enviado em `x-app-token`. **Nunca colocar este token no JavaScript do navegador.**
- O navegador usa a sessão HttpOnly do login existente. A sessão administrativa usa `MANAGEMENT_SESSION_SECRET` ou, na ausência, o segredo de `DATABASE_URL`; o segredo público de testes foi removido. Sessões antigas assinadas pelo segredo de testes exigem novo login.

O POST de gravação exige `conferido: true`, `driverId`, `fleetId`, `numero_ticket`, `peso_liquido_kg` inteiro positivo e `km_carreta` inteiro não negativo. A gravação de ticket e relatório acontece em uma única instrução SQL atômica. Número já registrado retorna HTTP 409. Falhas externas não retornam chaves nem detalhes internos. O limite de leitura é de 20 requisições por minuto por identidade, compartilhado no banco entre instâncias.

A migração adicional `0015_ticket_safety.sql` apenas cria a tabela de limite de leituras e acrescenta `ticket_data` aos tickets; não modifica viagens existentes.

## Validação local

```sh
TRANS_SOURCE_DUMP=/caminho/absoluto/app node bootstrap.mjs
cd /caminho/absoluto/app
npm install --ignore-scripts --no-audit --no-fund
npm run build:dev
cd /caminho/do/repositorio
TRANS_TEST_APP=/caminho/absoluto/app node --test tests/tickets.test.mjs
```

Os testes usam PostgreSQL embarcado (PGlite), incluindo gravação do lançamento pendente, concorrência, duplicidade, rollback, autenticação, validação de peso/imagem, limite de leitura e os dois provedores com respostas simuladas. Eles não gravam dados de teste no Neon de produção.
