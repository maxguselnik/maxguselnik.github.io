# Последний фонарь

Кооп-игра для двоих (PWA) на Cloudflare Workers + Durable Objects.

- `public/` — игра (index.html), манифест, service worker, иконки
- `src/worker.js` — раздача статики и WebSocket-комнаты `/ws/<КОД>`
- Деплой: push в `main` → GitHub Actions → `wrangler deploy`

Секреты репозитория: `CLOUDFLARE_API_TOKEN` (шаблон «Edit Cloudflare Workers»), `CLOUDFLARE_ACCOUNT_ID`.
Локально: `npx wrangler dev`.
