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
