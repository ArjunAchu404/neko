# Conferbot widget setup for Neko Anime Companion

Neko now loads the official Conferbot floating `live_chat` widget for signed-in users. This is an additional widget; it does **not** replace Neko's existing AI chat, accounts, watchlist, or saved conversations.

## Credential / contract

- Required: the **Chatbot ID**, a 24-character hexadecimal ID from Conferbot Dashboard → Bot Settings → General (or Share → Copy Bot ID).
- Not required for embedding: Conferbot REST API key or workspace ID. Do not put a management API key in frontend code.
- Official script: `https://cdn.conferbot.com/dist/v1/widget.min.js`
- Initializer: `window.ConferbotWidget(CHATBOT_ID, 'live_chat')`
- The bot must be published. Conferbot manages widget colors, language, prompts, and placement from its dashboard.

## Configure locally

1. Open `frontend/.env.example` and use it as a template for `frontend/.env` (do not commit `.env`).
2. The `.env.example` supplied with this project is already configured with your Conferbot bot ID (`6ad88cb4070ddf73c5e7d4e2`). Copy it to `frontend/.env` as described above. The ID is public widget configuration, not a secret.
3. From `frontend/`, install dependencies if needed with `npm install`, then run `npm run dev`. Restart Vite after editing `.env`.
4. Sign in to Neko and check the Conferbot floating chat bubble.

For a production deployment, set `VITE_CONFERBOT_BOT_ID` in the frontend build environment before building/deploying. Vite embeds `VITE_` values into browser code, so only put the public bot ID there—never a private API key.

## Troubleshooting

- No bubble: confirm the ID is exactly 24 hexadecimal characters and the bot is published.
- If it still does not appear, test the ID and widget in Conferbot's own Share → Embed preview, then inspect browser console/network errors.
- If your Content Security Policy restricts scripts or connections, allow `https://cdn.conferbot.com` for scripts and `https://wdt.conferbot.com` for widget connections/WebSockets.
- The widget is only mounted after Neko authentication; it remains available when navigating to profile settings.

## Official documentation

- https://developers.conferbot.com/docs/integrations/web-widget
- https://developers.conferbot.com/docs/integrations
