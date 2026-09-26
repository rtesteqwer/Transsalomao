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


Publish structured OCR fallback update
Commit: 2f678127c267ad19d14415de749747d2ab078203

Publish trained ticket layouts
Commit: b00c62defe6c73c617ed183933343db2f065f82c

Publish verified ticket reader and operational fixes 2026-09-25
- Fix local OCR ReferenceError and structured parsing for five layouts
- Preserve company roles, exact kg, editable review and Caixa metadata
- Restore individual trip deletion and billing PDF fueling details
- Gate publication on 21 ticket and database regression tests

Restore current production pipeline after legacy-workflow rollback — 2026-09-25
Includes Multilift OCR fix commit 24128a51fe9ecad2b548a7393e1493f5f44fb6da

Publish ticket vision fallback on restored current production — 2026-09-25
Commit: 69d3e0740ea9b0e854e98ab37dcc0422c4ab9d43
- Prefer Anthropic vision when configured; OpenAI remains fallback
- Keep local OCR only after both vision providers fail
- Harden Multilift carrier and selected-fleet plate recovery

Publish targeted local OCR bands for Multilift photo — 2026-09-25
Commit: 214b0857e4ab80a2d77d35a8eec199abad44de31
- Preserve current production version
- Add high-resolution top/weight OCR bands
- Correct OCR-confused plates such as S/5
- Prefer valid 23.510 kg candidate over false 123.510 kg

Publish OCR-only ticket reader — 2026-09-25
Commit: 55750d128e8ce11e6583a5277b518af2a3b7b8d4
- Ticket reading uses local OCR only
- No vision provider in ticket read path
- Models: Multilift, Adubos Real, VPORTS receipt/report, LOG Consulting

Retry OCR-only publication after fuzzy plate fix — 2026-09-25
Commit: 806685278f527e3e8e874f226eb362f2fa482c86

Retry OCR-only deployment after plate evidence test fix — 2026-09-25
Commit: 2d5628e0ecdf66d8177908cdea2b02265e52c7a2


Salomao IA v5.3 ZIP document intake — 2026-09-26
- botão + permite escolher ZIP
- abre imagens JPG/JPEG/PNG/WEBP/HEIC/HEIF sem gravar o conteúdo do ZIP no armazenamento
- classifica documentos como viagem, abastecimento, adiantamento, mecânica, despesa ou revisar
- extrai valores, litros, preço/L, placas, motorista, ticket e peso quando visíveis
- não inventa campos ausentes e indica o módulo correto
Commits: df8ba23e / ad05c63d / 2e7cb4da / fe9219bb
