# Launch runbook — saunas.mx

Phase 1 of the go-live: real database, real repo, real domain. Values for every
secret named here live in `.env.prod` (local, gitignored). Never commit them.

## Done

- Neon `neondb` migrated: 55 tables from `src/modules/database/migrations`.
- `bootstrap:production` published both marketplace configs and created the
  operator `albertovillalpando@gmail.com`. No synthetic fixtures in production.
- Production build verified against Neon.
- Quality gates green: lint, typecheck, 101 unit, 71 integration, 14 E2E.
- `vercel.json` schedules the outbox drain; the worker route accepts GET
  (Vercel Cron's method) behind the same `WORKER_SECRET` check.

## 1. Push the repo

```bash
brew install gh && gh auth login && git push -u origin main
```

Remote `origin` is already set to `https://github.com/Tecnologiasstellar/saunasmx.git`.

## 2. Import into Vercel

New Project → import `Tecnologiasstellar/saunasmx` → framework Next.js, defaults
otherwise. Before the first deploy, add these environment variables for
**Production** (values from `.env.prod`):

| Variable | Notes |
|---|---|
| `APP_ENV` | `production` — enables secure cookies, hides dev magic links |
| `DATABASE_URL` | Neon **pooled** connection string |
| `EMAIL_ADAPTER` | `resend` |
| `RESEND_API_KEY` | send-only key |
| `EMAIL_FROM` | `no-reply@saunas.mx` — only works after step 4 |
| `OPS_NOTIFICATION_EMAIL` | where new-lead alerts go |
| `SESSION_SECRET` | 32-byte hex |
| `WORKER_SECRET` | shared secret for `/api/worker/outbox` |
| `CRON_SECRET` | **same value as `WORKER_SECRET`** — Vercel Cron sends it as `Authorization: Bearer` |

Do not set `LOCAL_HOST_MAP` in production; it is ignored there by design
(`src/modules/marketplace-config/resolve-host.ts`).

The `*.vercel.app` URL will return a plain 404 "Sitio no disponible". That is
correct: with `APP_ENV=production` only a configured hostname resolves to a
marketplace. The site becomes reachable once the domain is attached.

## 3. Domain — Vercel then GoDaddy

In Vercel → Project → Settings → Domains, add `saunas.mx` and `www.saunas.mx`.
Vercel then shows the exact records. At the time of writing they are:

- `saunas.mx` → **A** → `216.198.79.1`
- `www.saunas.mx` → **CNAME** → the `*.vercel-dns-*.com` target Vercel displays

Use whatever Vercel displays, not this table, if the two disagree.

In GoDaddy → My Products → saunas.mx → DNS: delete the parked `A @` record and
any conflicting `CNAME www`, then add the two above with the lowest available
TTL. Certificates issue within minutes of propagation.

`www.saunas.mx` 308-redirects to the apex —
already configured under `aliases` in `config/marketplaces/suanas-mx/marketplace.yaml`.

## 4. Resend sending domain

The provided key is send-only, so this is dashboard work. Resend → Domains →
Add `saunas.mx` → copy the DKIM/SPF records into GoDaddy DNS → Verify. Until
this passes, every send from `no-reply@saunas.mx` fails and no magic link or
lead notification arrives.

## 5. Verify live (do not skip)

1. `https://saunas.mx` loads with Saunas México branding.
2. `https://www.saunas.mx` 308s to the apex over HTTPS.
3. Submit a real questionnaire at `/cotizar` → `/gracias` renders.
4. Drain the outbox and confirm the ops notification arrives:

   ```bash
   curl -X POST https://saunas.mx/api/worker/outbox -H "Authorization: Bearer $WORKER_SECRET"
   ```

5. Sign in at `/entrar` with the operator email, confirm the lead in `/ops`.
6. Record URL, timestamp and evidence per `docs/15-runbooks.md` → Public launch
   verification.

## Known gaps at launch

- No providers exist in production. Matching has nothing to assign until at
  least two providers are onboarded and approved (`docs/15-runbooks.md`).
- `vercel.json` runs the outbox once a day, the Hobby-plan limit. Lead
  notifications are therefore up to 24h late. Fix by pointing a free external
  cron (cron-job.org) at `POST /api/worker/outbox` every 5 minutes with the
  `WORKER_SECRET` bearer header, or upgrade the Vercel plan.
- Phases 5, 6 and 8 remain deferred — see `docs/13-acceptance-criteria.md`.
