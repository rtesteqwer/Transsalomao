# Trans Salomão Voz — Android

APK Android que abre `https://transsalomao.vercel.app/` em WebView e adiciona comandos por voz em português do Brasil.

## Voz
- Toque em **OUVIR** para um comando.
- Ative **CONTÍNUO** para o reconhecimento reiniciar automaticamente enquanto o app estiver aberto.
- Comandos sensíveis com `apagar`, `excluir`, `deletar`, `remover tudo` ou `limpar tudo` exigem dizer **confirmar**.

## Exemplos
- `abrir viagens`
- `clicar em relatórios`
- `abrir abastecimentos`
- `voltar`
- `atualizar`
- `rolar para baixo`
- `preencher motorista com Klebersom Dutra`
- `digitar 42,350`
- `selecionar por toneladas`

## Build
```bash
gradle assembleDebug
```

Saída esperada: `app/build/outputs/apk/debug/app-debug.apk`.

Build automático configurado para gerar o artefato `TransSalomao-Voz-APK`.
