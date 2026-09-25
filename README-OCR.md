# OCR com IA — Trans Salomão

## Arquitetura integrada

O Trans Salomão usa TanStack Start, não Next.js. Por isso o OCR foi integrado ao fluxo já existente dos PRs #20 e #21 em vez de duplicar rotas incompatíveis.

### Rotas ativas

- `POST /api/ler-ticket`: leitura da foto com Salomão IA.
- `POST /api/salvar-ticket`: validação, proteção contra duplicidade e envio ao Caixa.
- `/motorista`: captura/galeria, revisão e confirmação dos dados.
- `/dono/fotos`: arquivo privado de fotos e metadados, exclusivo do Felipe.

### Campos extraídos

Número do ticket, data das pesagens, placas do cavalo e carreta, pesos, produto, NF, transportadora, operadora, contratante, motorista, cliente/destinatário, navio, emissor, operador da pesagem, código do item e anotações manuscritas.

### Validações

- Peso em kg inteiro.
- Conferência de peso líquido pela diferença das pesagens.
- Placas normalizadas para maiúsculas e sem hífen.
- Campos ausentes permanecem `null`; a IA não deve inventar.
- Segunda leitura automática quando faltam placas/empresas/peso prioritário.
- A leitura automática usa somente OpenAI Vision; não existe fallback Tesseract/OCR local.
- Ticket duplicado é recusado no salvamento.
- Fotos enviadas ao leitor são arquivadas privadamente.

### Privacidade

O arquivo de fotos e os metadados extras privados permanecem protegidos pelo login administrativo do Felipe, conforme o PR #20. O leitor do motorista não expõe o arquivo privado.

### Variáveis

```env
OPENAI_API_KEY=...
OPENAI_OCR_MODEL=gpt-4o-mini
DATABASE_URL=...
MANAGEMENT_SESSION_SECRET=...
TICKET_TOKEN=...
```

A Salomão IA também pode obter a chave OpenAI da tabela privada `assistant_secrets` quando já configurada.

### Modelos conhecidos

Há regras específicas e fallback genérico para Multilift Logística, VPORTS/Log Consulting, Adubos Real/SERRAES e outros layouts de ticket.

### Observação

A integração usa a API OpenAI Responses diretamente com imagem em alta resolução e modelo `gpt-4o-mini` por padrão. O SDK `openai` não é necessário no bundle porque a chamada HTTPS é feita no servidor. Se a OpenAI estiver indisponível, o sistema informa o erro e não tenta OCR tradicional.


## Regressão VPORTS 72416

O caso VPORTS usado para regressão deve retornar: ticket 72416, peso líquido 38470 kg, placa do veículo NZE8I52, placa da carreta MQX5F98, transportadora GIZELE APARECIDA DA ROCHA GARCIA, operadora LOG CONSULTING e navio BELISLAND.
