# YouTube Growth Bot

Painel para analisar desempenho real do canal/Shorts usando YouTube Data API + YouTube Analytics API. Não gera inscritos, views ou engajamento artificial.

## Publicar como projeto separado na Vercel

Use o fluxo abaixo para criar um novo projeto Vercel e um novo repositório GitHub separados do Trans Salomão:

https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frtesteqwer%2FTranssalomao%2Ftree%2Fyoutube-growth-bot%2Fyoutube-growth-bot&project-name=youtube-growth-bot&repository-name=youtube-growth-bot

## Variáveis de ambiente

Configure na Vercel:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://SEU-DOMINIO.vercel.app/api/auth/callback`
- `YT_SESSION_SECRET` com pelo menos 32 caracteres
- `DATABASE_URL` (opcional, usa o projeto Neon **YouTube Growth Bot**)

## Banco Neon

Projeto separado já preparado: **YouTube Growth Bot**.

Tabelas:
- `channel_snapshots`
- `video_snapshots`

O app também funciona sem `DATABASE_URL`, mas sem histórico persistente.

## Endpoints

- `/api/health`
- `/api/auth/start`
- `/api/auth/callback`
- `/api/auth/logout`
- `/api/youtube/overview`
- `/api/youtube/history`
