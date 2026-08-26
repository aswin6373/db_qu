# WhatsApp AI Chat Setup For QueryMind

Users message your workspace's WhatsApp number and the QueryMind AI answers
from THEIR OWN account's database — same pipeline as the web app, with tables
and charts in the replies.

## How it works

```
User texts the bot number -> Meta Cloud API -> POST /whatsapp/webhook
  -> signature check -> dedupe
  -> unpaired? reply with a one-time magic link
       -> user taps it, logs in on /whatsapp/connect (normal web login)
       -> phone number is now bound to their account
  -> paired? intent/agent -> SQL -> validate -> execute as THAT user
  -> summary + table (+ chart PNG) back to WhatsApp
```

- **No passwords ever travel through WhatsApp.** Pairing uses an expiring
  signed link + the platform's own login page. One number = one account;
  the most recent login wins; `disconnect` unlinks.
- Conversations are stored as normal chats owned by the paired account, so
  they appear right in that user's web chat history too.
- Write queries are NEVER executed from WhatsApp; the bot tells the sender to
  confirm them in the web app.

## 1. Meta side (one-time)

1. Create a Business Portfolio at business.facebook.com.
2. Create an app at developers.facebook.com (type **Business**) and add the
   **WhatsApp** product.
3. In **WhatsApp > API Setup** claim the free test number (works for up to 5
   testers) or register a real production number later.
4. Create a permanent token: Business Settings > System Users > admin system
   user assigned to the WABA, permissions `whatsapp_business_messaging` +
   `whatsapp_business_management`, expiration **Never**.

## 2. Backend configuration

Render/dashboard env vars (see `.env.example`):

```
WHATSAPP_VERIFY_TOKEN=<any random string you choose>
WHATSAPP_ACCESS_TOKEN=<permanent system-user token>
WHATSAPP_PHONE_NUMBER_ID=<API Setup > Phone number ID>
WHATSAPP_APP_SECRET=<App Settings > App secret>
WHATSAPP_CONNECT_BASE_URL=https://<your-backend-domain>   # no trailing slash
# Optional testing-only gate:
WHATSAPP_ALLOWED_NUMBERS=
WHATSAPP_INLINE_PROCESSING=false   # true on Vercel
```

Restart, then check `GET /whatsapp/status` returns `{"ready": true}`.

Note: `WHATSAPP_ORGANIZATION_ID` / `WHATSAPP_CONNECTION_ID` from earlier
versions are gone — pairing decides the workspace per user now.

## 3. Point Meta at your webhook

In **WhatsApp > Configuration**:

- Callback URL: `https://<your-backend-domain>/whatsapp/webhook`
- Verify token: exactly what you put in `WHATSAPP_VERIFY_TOKEN`
- Click **Verify and save**, then **Subscribe** to the `messages` field.

## 4. Test the full flow

1. From your phone, message the bot number anything (e.g. "hi").
2. It replies with a personal login link.
3. Tap it, sign in with your QueryMind account.
4. Back in WhatsApp: ask "how many rows does orders have" — answer arrives
   with a table; chart-friendly results also send an image.

Commands: `help`, `new chat` (`reset`), `disconnect`.

## Production notes

- Register a real number (NOT registered on regular WhatsApp), submit
  Business Verification, get the display name approved.
- Replying within 24h of a user's message is free; proactive outbound needs
  paid templates (not used by this bot).
- Charts and result tables need matplotlib (already in requirements.txt) —
  both are sent as PNG images. Without matplotlib the bot still replies with
  the text summary (no table/chart images).
- On Vercel set `WHATSAPP_INLINE_PROCESSING=true` so processing finishes
  inside the request (budget: `WHATSAPP_TIME_BUDGET_SECONDS`, default 30).
