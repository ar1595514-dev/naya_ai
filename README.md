# NyayaAI

**Source-backed Indian legal information and case-management platform.**

NyayaAI helps people in India describe a legal situation in Hindi, English or
another supported Indian language, understand the relevant law, locate
**official** sources, organise court documents, analyse uploaded files, prepare
editable drafts, and maintain complete case history.

> ⚖️ **NyayaAI provides legal information, not legal advice.** It does not replace
> a qualified advocate and never guarantees an outcome. Every answer that relies
> on a source links to it, and unverified material is labelled as such.

---

## Table of contents

1. [What actually works today](#what-actually-works-today)
2. [Tech stack](#tech-stack)
3. [Quick start (zero external services)](#quick-start-zero-external-services)
4. [Environment variables](#environment-variables)
5. [Database](#database)
6. [AI provider setup](#ai-provider-setup)
7. [Object storage](#object-storage)
8. [Background worker](#background-worker)
9. [Scripts](#scripts)
10. [Testing](#testing)
11. [Security model](#security-model)
12. [Production deployment](#production-deployment)
13. [Known limitations](#known-limitations)
14. [Project layout](#project-layout)

---

## What actually works today

NyayaAI is built in 30 phases (see `CHECKLIST.md`). A feature is only listed as
working when its code + tests exist. Highlights:

| Area | Status |
| --- | --- |
| Email/password auth, sessions (HttpOnly cookies), CSRF, rate limiting, email verification, password reset, TOTP MFA, roles, session revocation | ✅ implemented, unit-tested |
| Phone login (SMS one-time codes), phone verification, and confirmed email change | ✅ implemented, unit-tested — real SMS needs `SMS_DRIVER=console` (dev) or Twilio credentials; otherwise it honestly reports "not configured" |
| Case management (CRUD, parties, notes, tasks, timeline, reminders, statuses) | ✅ implemented |
| Secure document upload (magic-byte validation, private storage, versions, async pipeline: scan → extract → index) | ✅ implemented, integration-tested |
| AI legal assistant (RAG over the legal-source corpus, 7-part answer structure, citations, prompt-injection defence) | ✅ implemented — requires an AI provider key to produce answers; otherwise returns an honest "not configured" message |
| Case-file AI analysis (facts with page references + provenance + confidence, versioned reports) | ✅ implemented — needs provider |
| Application/draft generation (versioned, placeholder-labelled, never claims filing) | ✅ implemented — needs provider for AI content, otherwise a labelled skeleton |
| Legal research search + saved reports with citations | ✅ implemented (lexical by default; semantic when embeddings configured) |
| Case sharing (grants, invitations, revocation, per-document scope) + lawyer directory + contact requests | ✅ implemented |
| Admin console (users, advocates, sources, jobs, audit, AI config status) | ✅ implemented |
| Global search (authorization-scoped), notifications, reports/exports (PDF/DOCX/CSV) | ✅ implemented |
| Multilingual UI + AI (Hindi/English complete; 10 more locales scaffolded) | ✅ architecture implemented |
| Voice input / TTS | ⚙️ provider interfaces implemented; **disabled until a speech provider is configured** |
| OCR of scanned files | ⚙️ provider interface implemented; **disabled until an OCR provider is configured** |
| Malware scanning | ⚙️ provider interface implemented; **disabled until a scanner is configured** |
| Live court-database integration (eCourts etc.) | ❌ **not implemented** — no eCourts/API integration exists; nothing pretends otherwise |

Read `docs/KNOWN_LIMITATIONS.md` before relying on anything.

---

## Tech stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js route handlers under `/api/v1` (versioned REST)
- **Database:** Prisma ORM. **SQLite by default for local dev**, **PostgreSQL for production** (the schema is portable; see [Database](#database))
- **Validation:** Zod on every input boundary
- **Auth:** bcryptjs password hashing, opaque server-side sessions, double-submit CSRF, TOTP MFA, optional phone (SMS OTP) login
- **Docs:** `docx` (DOCX export), `pdf-lib` (PDF export), `mammoth`/`pdf-parse` (extraction)
- **Testing:** Vitest (unit + integration), Playwright (E2E)

---

## Quick start (zero external services)

```bash
# from the `nyayaai/` directory
cp .env.example .env          # or copy on Windows: copy .env.example .env
npm install
npx prisma generate           # generate the Prisma client
npx prisma db push            # create the local SQLite database
npx tsx prisma/seed.ts        # optional: seed official source metadata
npm run db:demo               # optional: create demo accounts (see below)
npm run dev                   # http://localhost:3000 (Next uses 3001+ if 3000 is busy)
```

> **Demo accounts (local evaluation only).** `npm run db:demo` creates two
> accounts with known passwords so a fresh checkout is usable immediately:
>
> | Email | Password | Role |
> | --- | --- | --- |
> | `admin@example.com` | `DemoAdmin2026` | SUPER_ADMIN — full `/admin` console |
> | `user@example.com` | `DemoUser2026` | USER — dashboard, cases, documents |
>
> The demo script refuses to run with `NODE_ENV=production`. On first sign-in the
> SUPER_ADMIN is routed to **Profile → Security** to enable TOTP MFA; every later
> login then requires the 6-digit code.

> **Signing in without email.** The login page has a **Mobile number** tab that
> signs in with a 6-digit SMS code (and creates an account on first use). With
> `SMS_DRIVER=console` (the dev default) the code is logged server-side and, in
> non-production, also shown in the UI as a `devCode` — so it works locally with
> no SMS provider. Set `SMS_DRIVER=twilio` with `TWILIO_*` credentials for real
> SMS; with `SMS_DRIVER=none` the app reports "not configured" rather than
> pretending to send. You can also add/verify a mobile number under
> **Profile → Security**, and change your email there (confirmed via a link).

Optional extras (separate terminals):

```bash
npm run worker                # process uploaded documents (scan/extract/index)
npm run test                  # unit + integration tests
```

> **Windows note:** if `npm`/`npx` are blocked by the PowerShell execution policy,
> use `npm.cmd` and `npx.cmd`.

With the default `.env` there is **no AI provider**, so the assistant returns:

> *"No AI provider is configured on this deployment, so no answer was generated."*

That is intentional and truthful. Configure a provider (below) to get answers.

---

## Environment variables

All configuration lives in `.env` (never commit it). `.env.example` documents
every variable with placeholder values only. Validation is centralised in
`src/lib/env.ts`: a misconfiguration produces a clear, actionable error and the
app refuses to start in production with development secrets.

Key groups: core/URLs, database, secrets (`SESSION_SECRET`, `ENCRYPTION_KEY`),
storage, AI/embeddings, speech, OCR, malware scanner, email, uploads, rate limits.

Generate strong secrets:

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
```

---

## Database

The Prisma schema uses only portable scalar types, so the **same schema** runs on
SQLite (dev) and PostgreSQL (production).

### Local development (default)

```bash
npx prisma db push     # fast, no migration files
```

### Production (PostgreSQL)

1. Start PostgreSQL (a `docker-compose.yml` with `pgvector` is included):

   ```bash
   docker compose up -d postgres
   ```

2. In `prisma/schema.prisma`, change the datasource provider:

   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

3. Set `DATABASE_URL="postgresql://..."` in `.env`.

4. Create a migration and deploy it:

   ```bash
   npx prisma migrate dev --name init     # locally, creates ./prisma/migrations
   npx prisma migrate deploy              # in CI/production
   ```

`docker-compose.yml` also brings up Redis for future queue/rate-limit backends.

---

## AI provider setup

NyayaAI is provider-independent and speaks the **OpenAI-compatible**
`/chat/completions` and `/embeddings` protocols.

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1     # or any compatible gateway
AI_API_KEY=sk-...                         # SECRET — keep out of source control
AI_CHAT_MODEL=gpt-4o-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
AI_EMBEDDING_DIMENSIONS=1536
```

- Chat: `src/lib/ai/provider.ts`
- Embeddings: `src/lib/ai/embeddings.ts`
- Retrieval/RAG: `src/lib/ai/retrieval.ts`, orchestration in `src/lib/ai/orchestrator.ts`
- Prompts + injection defence: `src/lib/ai/prompts.ts`

**Semantic search** activates automatically when a provider is configured *and*
source chunks have embeddings. Otherwise retrieval is **lexical** (BM25-style) —
never a pretence of semantics. For PostgreSQL the retrieval adapter can be
swapped to pgvector ANN (see the note in `prisma/schema.prisma`).

> Confidential case documents are **never** sent to an external provider unless
> the user gives explicit per-request consent **and** `AI_ALLOW_DOCUMENT_TRANSMISSION=true`.

---

## Object storage

- **Development (`STORAGE_DRIVER=local`):** files are written under
  `STORAGE_LOCAL_DIR` (default `./storage`), **outside** `public/`. Downloads go
  through an authorized API route with `no-store` caching.
- **Production (`STORAGE_DRIVER=s3`):** an S3-compatible private bucket. The S3
  adapter in `src/lib/storage/index.ts` requires the optional
  `@aws-sdk/client-s3` package; until it is installed the driver returns an
  explicit configuration error instead of silently failing.

---

## Background worker

Document processing (scan → extract → index) is asynchronous and idempotent,
backed by a database queue by default:

```bash
npm run worker          # continuous
npm run worker -- --once   # drain once and exit
```

Set `REDIS_URL` to use a BullMQ backend in multi-instance production (swap
`src/lib/jobs/queue.ts`; interface preserved).

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Start the production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + integration |
| `npm run test:e2e` | Playwright E2E (needs browsers installed) |
| `npm run db:push` / `db:migrate` / `db:migrate:deploy` | Prisma migrations |
| `npm run db:seed` | Idempotent seed (official source metadata only) |
| `npm run worker` | Background document-processing worker |
| `npm run verify` | lint + typecheck + test |

---

## Testing

```bash
npm test                                  # unit + integration
npx playwright install chromium           # one-time
npm run test:e2e                          # end-to-end journeys
```

- **Unit** (`tests/unit`): crypto, rate limiting, RBAC, chunking, magic-byte file
  validation, prompt-injection defence, search snippets, language detection.
- **Integration** (`tests/integration`): DB-backed authorization (owner vs grantee
  vs stranger, revoked/expired grants) and the full document pipeline. These skip
  automatically when no database is reachable.
- **E2E** (`tests/e2e`): Journey A (register → case → log out → log back in →
  persistence) and Journey F (unauthorized access, weak-password rejection,
  honest "AI not configured" behaviour).

See `docs/TESTING.md` for the full matrix and `TEST_REPORT.md` for results.

---

## Security model

Implemented (see `SECURITY.md` for the checklist):

- Server-side authorization on **every** protected operation; non-owners receive
  404 (not 403) to avoid leaking case existence.
- Opaque session tokens (only a SHA-256 hash is stored), HttpOnly + SameSite=Lax
  + Secure-in-production cookies, session revocation.
- Double-submit CSRF token on all mutations + same-origin enforcement.
- Rate limiting on auth, upload, AI and export endpoints.
- Magic-byte file validation (extensions/MIME are never trusted), private storage,
  path-traversal protection, size/page limits.
- Password hashing with bcrypt (cost 12); TOTP secrets encrypted with AES-256-GCM.
- Prompt-injection defence: retrieved/uploaded text is wrapped as untrusted data
  and the model is instructed never to follow instructions inside it.
- Structured JSON logging with redaction of secrets; request IDs on every response.
- Security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- Audit trail for security-relevant and administrative actions.

---

## Production deployment

See `docs/DEPLOYMENT.md` for the full runbook (PostgreSQL + pgvector, Redis,
private storage, migrations, health checks, rollback). Summary:

1. Provision PostgreSQL + private object storage + secrets.
2. Set `NODE_ENV=production` and every secret; **never** use dev defaults.
3. `npx prisma migrate deploy`, then `npm run build && npm start` (a `Dockerfile`
   with standalone output is included).
4. Run the worker as a separate process/container.
5. Verify `GET /api/v1/health` reports `status: "ok"`.

---

## Known limitations

- No live court-database (eCourts) integration — official sources are added as
  metadata and must be ingested + human-verified by an administrator.
- Voice input, TTS, OCR and malware scanning are **interfaces only** until a
  provider is configured.
- PDF export of Devanagari requires a Unicode font (DOCX/CSV work now); ASCII PDF
  works out of the box.
- Email delivery defaults to a console driver; SMTP requires the optional
  `nodemailer` package.
- Redis/BullMQ, S3 and pgvector adapters are provided as documented integration
  points; the default dev stack is SQLite + local storage + DB queue.

Full list: `docs/KNOWN_LIMITATIONS.md`.

---

## Project layout

```
nyayaai/
├─ prisma/            # schema.prisma, seed.ts
├─ src/
│  ├─ app/
│  │  ├─ (public)/ (auth)/ (app)/   # route groups
│  │  └─ api/v1/...                 # versioned REST API
│  ├─ components/     # ui.tsx, site/, app/
│  └─ lib/
│     ├─ ai/          # provider, embeddings, retrieval, prompts, orchestrator
│     ├─ auth/        # session, csrf, rbac, guard, mfa
│     ├─ documents/   # extract, ocr, malware, pipeline
│     ├─ jobs/        # queue
│     ├─ reports/     # PDF/DOCX/CSV
│     ├─ search/      # index + query
│     ├─ storage/     # adapters + validation
│     ├─ i18n/        # locales + dictionaries
│     └─ validation/  # Zod schemas
├─ tests/             # unit, integration, e2e
├─ docs/              # implementation guide, deployment, testing, limitations
└─ worker/            # background worker entrypoint (src/worker)
```

---

## Licence & professional notice

NyayaAI is a software project. Using it does not create an advocate–client
relationship. Legal outcomes depend on facts, procedure and jurisdiction; always
verify against official sources and consult a qualified advocate.
