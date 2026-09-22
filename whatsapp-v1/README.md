# WhatsApp / Trans Salomão

Callback: `https://transsalomao.vercel.app/api/whatsapp/webhook`

## Configuração de produção

Configurar na Vercel, sem gravar segredos no Git:

- `WHATSAPP_VERIFY_TOKEN`: valor aleatório, igual ao token de verificação cadastrado na Meta.
- `WHATSAPP_APP_SECRET`: segredo do aplicativo Meta, usado para validar a assinatura do webhook.
- `WHATSAPP_PHONE_NUMBER_ID`: identificador do número empresarial autorizado.
- `OPENAI_API_KEY`: credencial de API com acesso ao modelo configurado e saldo disponível.
- `OPENAI_WHATSAPP_MODEL`: modelo com Responses API e Structured Outputs; na ausência, usa `OPENAI_ASSISTANT_MODEL`.
- `WHATSAPP_ALLOWED_GROUP_IDS`: IDs oficiais dos grupos selecionados, separados por vírgula. Vazio bloqueia lançamentos originados em grupos.
- `WHATSAPP_GROUP_DRIVER_MAP`: opcional; associa o `group_id` oficial ao motorista. Aceita JSON (ex.: `{"group-id":"Nome do Motorista"}`) ou pares `group-id=Nome;group-id2=Nome 2`. Se não houver mapa, o remetente precisa coincidir com o telefone cadastrado do motorista.
- `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_GRAPH_VERSION`: necessários para baixar fotos/tickets recebidos pela API e enviá-los à leitura visual.
- `WHATSAPP_AUTO_COMMIT=1`: habilita lançamentos automáticos de texto após validação. Fotos de pesagem válidas recebidas em grupo criam um lançamento `pendente` na Caixa mesmo sem essa variável, pois ainda passam pelo fechamento da gerência.
- `WHATSAPP_AI_MIN_CONFIDENCE`: opcional; mínimo efetivo de 0,86.

Respostas por WhatsApp ficam desligadas. Se futuramente forem solicitadas, configurar `WHATSAPP_SEND_CONFIRMATIONS=1`, `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_GRAPH_VERSION`.

## Ativação

1. Confirmar o aplicativo e o número na conta Meta. O link de convite de um grupo comum não concede acesso à API nem ao histórico de conversas. Confirmar elegibilidade e validar um evento real da Groups API antes de cadastrar IDs de grupos.
2. Salvar as variáveis na produção e publicar novamente. Cadastrar o callback e verificar o token na Meta; assinar o campo `messages`.
3. Cadastrar o telefone completo dos motoristas (DDD e número) na Trans Salomão. O nome extraído de uma mensagem não autoriza o remetente.
4. Fazer um teste autorizado com mensagem real e conferir a tabela `whatsapp_messages`. Não enviar mensagens de teste a terceiros sem solicitação do responsável.
5. Para os grupos de pesagem, conferir o `group_id` real entregue pela Meta e associá-lo ao motorista em `WHATSAPP_GROUP_DRIVER_MAP`.
6. Conferir a identificação do motorista/conjunto e os valores antes de habilitar `WHATSAPP_AUTO_COMMIT=1`.

## Estado e limites

- `pending_group_authorization`: grupo ainda não selecionado.
- `pending_sender_authorization`: telefone não identifica exatamente um motorista ativo.
- `pending_media`: a mídia não pôde ser baixada/validada. Fotos válidas de tickets passam por leitura visual; áudio continua sem transcrição nesta versão.
- `pending_review`: extração para conferência, dados insuficientes ou divergentes.
- `ai_error`: erro de extração; conteúdo preservado para tratamento.
- `committed`: registro e vínculo de auditoria gravados na mesma instrução SQL.

A recepção tem unicidade por `provider_message_id`. Reenvios não criam outro registro. Pendências ficam na auditoria; esta versão ainda não inclui tela de aprovação/reprocessamento. Não altera o projeto `motorista-seguro-v02`. A migração adiciona as tabelas/colunas, sem apagar viagens.

Testes locais: `node --test whatsapp-v1/webhook.test.mjs` (Node 22.18+ ou 24).

## Regra de fotos de pesagem

Para fotos recebidas em grupos operacionais autorizados, o sistema lê o ticket e usa **somente o peso líquido**. Peso bruto, tara e demais pesos impressos são ignorados para o lançamento.

A foto cria um registro `pendente` em `reports` (Caixa), com motorista, conjunto, data e peso líquido, mas **sem modalidade de frete definida**. Na Caixa aparece como **A definir pela Gerência**. Ao fechar a viagem, a Gerência escolhe obrigatoriamente entre Por tonelada, Diária, Cegonha ou Caixinha. Só depois dessa escolha o lançamento pode virar viagem. O WhatsApp não decide a modalidade e não escolhe preço automaticamente.
