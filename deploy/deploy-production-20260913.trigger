Deploy solicitado em 2026-09-24 para ajuste final dos relatórios individuais por motorista:
- PDF compacto: a coluna Informações completas da viagem mostra somente peso líquido e preço por tonelada
- PDF: Por tonelada e Diária seguem uma viagem por linha
- Cegonha e Caixinha permanecem agrupadas por modalidade com quantidade
- Excel individual continua em uma única planilha com todas as modalidades
- Excel: removidas as colunas KM inicial, KM final, KM rodados e Custo diesel
- Aplicar o mesmo padrão para todos os motoristas
Commits validados: 47697b02b3a04da15bb3a54f77868424acf571d9 e 4f5d8da1ebb644de978a96a567499fc827573361


Correção Fotos IA Android:
- separar galeria da câmera
- permitir selecionar uma ou várias fotos da memória do celular
- manter botão separado para tirar foto
Commit da correção: 6e4e9d2a28e7237fce70b213a3f64fa442813033


Correção adicional Fotos IA Android:
- input de arquivo agora cobre diretamente toda a área clicável
- sem dependência de label/htmlFor
- galeria e câmera acionadas pelo próprio input nativo
Commit: 62798df4727f84d5cad6e71dd2c12c4589663846


Fotos IA error handling:
- retornar mensagem clara quando OpenAI responder 401
- evitar HTTPError genérico no celular
Commit: 4d1784507f7d11c923d6ed82cadd1bd60f78c8bc


Fotos IA API econômica:
- modelo exclusivo OPENAI_PHOTO_MODEL
- padrão gpt-5.6-luna com entrada de imagem
Commit: 438e0896fbe0656efb487fa051e896240debf2f2


Fotos IA Authorization fix:
- corrigido "heaers" para "headers"
- chamada OpenAI agora envia Authorization corretamente
Commit: 5dd6b939d4dba8af4aeaceffbbcc1c223dfd1cd4


Fotos dos Tickets - arquivo da Gerência:
- remove leitura por IA/OpenAI
- seleciona viagem ou lançamento da Caixa
- salva foto do ticket relacionada ao registro
- histórico com visualizar e excluir foto
- acesso somente pela Gerência
Commits: 1a83f6df / b337d6b9 / f0db197e


Leitor de ticket no app do motorista:
- /api/ler-ticket usa Anthropic e devolve dados + alertas
- /api/salvar-ticket grava no Neon e retorna 409 para duplicado
- /motorista lê foto, permite conferência e lança na Caixa
- TICKET_TOKEN não é exposto no JavaScript do navegador
- tabela tickets_balanca com numero_ticket único
Build validado com sucesso no GitHub Actions
Deploy ticket reader: session auth, configured AI fallback, atomic Caixa save and duplicate checks — 2026-09-24
Publish camera/gallery picker + always-visible ticket photo UI — 2026-09-24
Deploy all-mode photo metadata + preserve physical ticket number in Caixa — 2026-09-24
Deploy OpenAI-first ticket reader + block silent manual fallback — 2026-09-24


Ticket reader provider order:
- Anthropic first when ANTHROPIC_API_KEY is configured
- OpenAI remains fallback in TICKET_AI_PROVIDER=auto
Commit: ded7c67aa462309c06fdb2b70834f603cd193643


Ticket reader error UI:
- mostra no celular o motivo real da falha de leitura
- mantém foto bloqueada até leitura ou remoção manual
Build validado com sucesso
Commit: cd9397b7c1da1cf59c53e54665a2bc5c2cf4233b


Salomao IA ticket reader:
- ticket photos routed through Salomao IA shared credential engine
- tries private assistant database credential before Vercel OPENAI_API_KEY
- local OCR fallback with tesseract.js when advanced vision is unavailable
- OCR text interpreted by Salomao IA deterministic ticket parser
- keeps manual confirmation before Caixa save
Build validated successfully
Commit: 9190f393928c7649cf8ed27fe4fae1b07459a5fb


Salomao OCR parser fix:
- remove ReferenceError do interpretador OCR local
- parser isolado para ticket, placas, peso, transportadora e destinatario
- usa nome do arquivo como fallback para numero do ticket
- campo toneladas continua editavel se peso nao for identificado
Build validado com sucesso
Commits: 5804cf7 / a57bb80


Salomao IA client-side OCR fix:
- remove second OCR parsing request to server
- interpret local Tesseract text directly in /motorista
- keeps filename fallback for ticket number
- keeps manual confirmation before save
Build validated successfully
Commit: b0e2cdc1cef6e16f23692df49f6a834a9c57f3d1


Ticket OCR alertas fix:
- corrige ReferenceError "alertas is not defined"
- retorno agora usa alertas: alerts
Build validado com sucesso
Commit: 0adf69c3b19354e66be843a44b2d840f2f3ab0a7


Leitor VPORTS por blocos:
- OCR separado por numero/cabecalho/pesos/empresas/NF
- preserva zeros iniciais do ticket
- separa placa carreta e placa veiculo por rotulo
- le pesagem inicial/final, peso liquido e peso origem
- le transportadora, destinatario, produto, status e NF
Build validado com sucesso
Commit: dc3b80a465ec3db367cd08619536b8bcde96ef43


VPORTS OCR refinado:
- recortes dedicados para numero do ticket
- recortes dedicados para placa carreta e placa veiculo
- preserva zeros iniciais e reduz troca entre placas
Build validado com sucesso
Commit: 50924f97a97d9b14348b67e2149394c199190b87


Peso liquido por diferenca das pesagens:
- valida peso liquido contra pesagem inicial - final
- corrige automaticamente leituras OCR absurdas como 51 kg
- neste ticket 54270 - 18460 = 35810 kg
Build validado com sucesso
Commit: a14daaa569ba61d82f6891110425997e1956ab0e


Segundo modelo de ticket VPORTS/LOG:
- reconhece recibo estreito "VPORTS - Tiquete de Pesagem"
- le Tiquete, datas, transportadora, motorista, produto
- le Peso Entrada, Peso Saida e Peso Liquido
- valida peso liquido pela diferenca das pesagens
- le as duas placas e usa o conjunto selecionado para ordenar cavalo/carreta
Build validado com sucesso
Commits: ccce50a / de3cc42


Leitor universal de tickets Salomao IA:
- perfis por evidencias e pontuacao, sem depender de frase exata
- modelo largo VPORTS + recibo estreito VPORTS/LOG + fallback generico
- OCR com modo sparse text nos recibos estreitos
- placas com e sem espacos
- nome do arquivo somente como ultimo recurso
- valida peso liquido pela diferenca das pesagens
Build validado com sucesso
Commit: f54e61b56b6a62431cc3d20a574fa56a07642b71


Correção campos prioritários Salomão IA / Caixa:
- peso líquido validado pela diferença das pesagens quando necessário
- placas, transportadora, operadora, contratante e destinatário separados e conferíveis
- campos prioritários editáveis antes do envio pelo motorista
- operadora e contratante preservadas no ticket_data e exibidas no Caixa da Gerência
Build: validação via Vercel após merge do PR #17
Commit funcional: c84875be90da25481d35ba31b26aa5304884c413

Retry production after pinning Vercel CLI 59.26.0
Workflow fix commit: 9465c87e0e0964dcda84413aa2ae645a022718ce

Deploy partial-read fix 2026-09-24T16:44:37.051Z
Functional commit: a03e7e1d038cddf3f360cb95c565ad49e063b4bc


Deploy latest update 2026-09-24 21:03 BRT
Functional commit: daee946be78d2cdd41da88714a7c99a059dd839d


Deploy OCR IA integrado 2026-09-24 21:39 BRT
Functional commit: e30ef69539affeab44ffb661c749a0a593862097


Deploy OpenAI-only OCR VPORTS fix 2026-09-25
Functional commit: 7f7b42fc7c40da5e8a66fc7e4c289618c1282b72

Retry OpenAI-only OCR deploy after OPENAI_API_KEY setup 2026-09-25

Retry production deploy with masked-secret verification 2026-09-25
