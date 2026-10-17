# RUNBOOK.md: Writedown Private Beta on Fly.io

One Fly machine runs `node server/index.ts` with `NODE_ENV=production`. It serves the built app from `dist/` and the API under `/api`. SQLite (sessions, sign-in tokens, usage counters; no documents) lives on the `writedown_data` volume at `/data`.

## Prerequisites (not done yet)
- A domain verified in Resend (SPF + DKIM) for `MAIL_FROM`. Without it, production sign-in returns 503.
- `flyctl` installed and logged in (`fly auth login`).

## First deploy
```bash
fly apps create writedown            # or change `app` in fly.toml if the name is taken
fly volumes create writedown_data --region iad --size 1
fly secrets set \
  APP_ORIGIN=https://writedown.fly.dev \
  ALLOWLIST=you@example.com \
  RESEND_API_KEY=... \
  MAIL_FROM='Writedown <signin@yourdomain.com>' \
  AI_PROVIDER=anthropic \
  ANTHROPIC_API_KEY=...
fly deploy
```
`APP_ORIGIN` must exactly match the URL users open (CSRF checks and sign-in links use it). With a custom domain, run `fly certs add <domain>` and set `APP_ORIGIN` to it. Limits default to 100 requests/user/day and $10/month (`DAILY_REQUESTS_PER_USER`, `MONTHLY_BUDGET_USD`).

Keep one machine: the SQLite store is single-instance. Don't `fly scale count` above 1.

## Smoke checklist (run against the hosted URL after every deploy)
1. `curl https://<host>/api/health` returns `{"status":"ok"}`.
2. Unauthenticated `curl -X POST https://<host>/api/ai/suggest` is refused (401 or 403).
3. Sign-in request for an email not on `ALLOWLIST`: no mail arrives.
4. Sign-in as an allowlisted email: mail arrives, link signs in.
5. Create, edit, reload (text kept), export Markdown.
6. AI: request a proofread, accept one suggestion, reject another.
7. Outage: `fly secrets set ANTHROPIC_API_KEY=invalid`, confirm an error message while editing and export keep working, then restore the key.

## Rollback
```bash
fly releases --image      # find the last good version and its image
fly deploy --image <image from that release>
```
Secrets changes also create a release; re-set the previous value to undo one.

## Logs
`fly logs`. The server logs metadata only (request id, action, outcome, duration, cost), never document text.
