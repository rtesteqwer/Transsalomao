# Tickets por foto no app do motorista

A integração usa as rotas TanStack Start existentes `/api/ler-ticket` e `/api/salvar-ticket`, instaladas por `render-overrides/apply-driver-ticket-reader-20260924.mjs` durante a reconstrução da aplicação. Não substituir o package.json do projeto: o banco Neon já usa `pg` pelo módulo `getSql`.

## Uso

Em `/motorista`, a foto pode ser usada em qualquer modo. Em **Por tonelada**, a leitura usa número do ticket, peso líquido, placas, transportadora e destinatário. Em **Diária, Cegonha e Caixinha**, pesos/pesagens são ignorados e somente os demais dados do documento são gravados. Depois da conferência, o lançamento entra como pendente no Caixa da Gerência. Um motorista autenticado só pode usar seu próprio cadastro. A gerência pode selecionar o motorista. O lançamento fica pendente na Caixa para o fechamento normal pela gerência.

O peso líquido é dividido por 1000 sem arredondamento em toneladas. Pesos bruto e de origem não substituem o líquido. As anotações manuscritas ficam separadas. Campos ilegíveis ficam vazios e geram alertas. A leitura continua 100% por OCR local no aparelho, sem IA. Depois da conferência, a foto é comprimida no navegador e enviada junto ao `/api/salvar-ticket`; o servidor grava o ticket, o lançamento pendente no Caixa e a foto vinculada ao mesmo `report_id`. A imagem passa a aparecer automaticamente no arquivo **Fotos de Tickets** da Gerência.

## Configuração do servidor

- `DATABASE_URL`: conexão já utilizada pelo aplicativo.
- `ANTHROPIC_API_KEY`: quando presente, a leitura usa Anthropic. `CLAUDE_MODEL` tem padrão `claude-sonnet-5`.
- Se Anthropic não estiver configurada, a leitura utiliza `OPENAI_API_KEY`. `TICKET_OPENAI_MODEL` tem padrão `gpt-4.1-mini`.
- `TICKET_AI_PROVIDER`: opcional, `auto` (padrão), `anthropic` ou `openai`. Não há troca de fornecedor em caso de erro; a alternativa é escolhida pela configuração antes da requisição.
- `TICKET_TOKEN`: opcional para integrações entre servidores, com pelo menos 32 caracteres aleatórios. É enviado em `x-app-token`. **Nunca colocar este token no JavaScript do navegador.**
- O navegador usa a sessão HttpOnly do login existente. A sessão administrativa usa `MANAGEMENT_SESSION_SECRET` ou, na ausência, o segredo de `DATABASE_URL`; o segredo público de testes foi removido. Sessões antigas assinadas pelo segredo de testes exigem novo login.

O POST de gravação exige `conferido: true`, `driverId`, `fleetId`, `numero_ticket`, `freightMode` e `km_carreta` inteiro não negativo. Quando o lançamento veio de foto, também recebe `imagem` (Data URL JPG/PNG/WebP, até cerca de 3 MB após compressão) e `fileName`; a imagem é validada no servidor antes de ser arquivada. `peso_liquido_kg` é obrigatório somente em `freightMode="ton"`; nos demais modos ele é descartado antes da gravação. A gravação de ticket e relatório acontece em uma única instrução SQL atômica. Número já registrado retorna HTTP 409. Falhas externas não retornam chaves nem detalhes internos. O limite de leitura é de 20 requisições por minuto por identidade, compartilhado no banco entre instâncias.

A migração `0017_driver_ticket_photos.sql` cria somente o arquivo de fotos (`trip_ticket_photos`) e seus índices; não modifica viagens existentes. A `0015_ticket_safety.sql` continua responsável apenas pelo limite de leituras e por `ticket_data`.

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
