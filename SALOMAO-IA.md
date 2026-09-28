# Salomão IA — IA própria da TransSalomão

A **Salomão IA** é a camada de inteligência operacional dedicada da TransSalomão.

## O que significa “IA própria”

A identidade, regras de negócio, memória operacional, ferramentas, integrações, banco de dados e fluxos pertencem à TransSalomão. O modelo de linguagem usado como motor pode ser trocado sem alterar a identidade do produto.

Ou seja: a Salomão IA não é apenas um chat com um nome. Ela é o agente da TransSalomão que consulta e executa tarefas nos módulos autorizados do sistema.

## Domínios

- Viagens e Caixa
- Motoristas e conjuntos
- Tickets e leitura de documentos
- Abastecimentos
- Adiantamentos
- Despesas e mecânica
- Relatórios e indicadores
- Rotas, preços e memória operacional
- Gestão e automações autorizadas

## Arquitetura

1. **Identidade própria**: `assistant-v4/salomao-identity.server.ts`
2. **Motor configurável**: `assistant-v4/salomao-ai.server.ts`
3. **Agente operacional**: `assistant-v4/api-assistant.ts`
4. **Leitura inteligente de documentos**: `assistant-v4/api-document-intake.ts`
5. **Interface**: `assistant-v4/salomao-web.tsx`
6. **Autenticação e segurança**: módulos `assistant-auth` e `management-auth`
7. **Memória**: Neon/PostgreSQL e tabelas específicas do domínio

## Regra principal

A Salomão IA deve responder e agir com base no estado real da TransSalomão. Ela não deve inventar motorista, placa, peso, preço, valor, viagem, abastecimento ou qualquer outro registro operacional.

## Provedores de modelo

O provedor do modelo-base é substituível. A configuração atual usa a API definida no ambiente, mas a camada de identidade e negócio permanece da TransSalomão.

## Segurança

Nenhuma chave ou segredo deve ser versionado no Git. Credenciais ficam apenas em variáveis de ambiente ou armazenamento seguro autorizado.
