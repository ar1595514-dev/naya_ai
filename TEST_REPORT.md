# NyayaAI — Test & Verification Report

Last verified: 2026-10-14 (Node v24.21.0, Windows PowerShell, SQLite dev database)

This report records exactly what was run and what passed. Every claim below is
backed by a command in `package.json` or `docs/TESTING.md`.

## Verification matrix

| Gate | Command | Result |
|------|---------|--------|
| Prisma schema sync | `npx prisma db push` | ✅ `prisma/dev.db` in sync |
| Seed (idempotent) | `npm run db:seed` | ✅ 12 UNVERIFIED official source records (metadata only) + 1 AI-provider config row (`kind=none`) |
| Unit/integration tests | `npm test` | ✅ 57/57 pass across 8 files |
| Type check | `npx tsc --noEmit --incremental false` | ✅ 0 errors |
| Lint | `npm run lint` | ✅ 0 errors (28 pre-existing warnings) |
| Production build | `npm run build` (Prisma generate + Next 15.5) | ✅ Compiled in 83s, 58 static pages generated, no type errors |
| Demo accounts | `npm run db:demo` | ✅ Idempotent upsert of demo SUPER_ADMIN + USER (refuses under `NODE_ENV=production`) |
| Live auth smoke test | HTTP against `next dev` | ✅ demo SUPER_ADMIN login (role `SUPER_ADMIN`, `mfaSetupRequired=true`) then `GET /api/v1/admin/dashboard` → 200; demo USER login and `GET /api/v1/admin/dashboard` → 403 |
| Live phone/email smoke test | HTTP against `next dev` | ✅ request OTP → `needsProfile` → create phone-only account → `/users/me` shows normalised `+91…` phone + `phoneVerifiedAt`, no email; repeat login `created=false`; wrong code → 401; email change (request → confirm) applied and reflected in `/users/me` |

> Note: `--incremental false` is required on this machine because a stale
> `.tsbuildinfo` makes plain `tsc --noEmit` nondeterministic.

## Test suite (57/57)

| File | Focus | Count |
|------|-------|-------|
| `tests/unit/chunk.test.ts` | Deterministic legal-text chunking (word-bounded, overlap, token estimate) | 5 |
| `tests/unit/crypto.test.ts` | bcrypt hashing + AES-256-GCM secret encryption round-trips | 8 |
| `tests/unit/storage-validation.test.ts` | Magic-byte file detection/rejection, upload validation, safe display names | 12 |
| `tests/unit/ai-and-search.test.ts` | RAG answer assembly / retrieval behaviour | 11 |
| `tests/unit/rbac.test.ts` | Role→capability matrix, MFA requirements, permission ranking | 4 |
| `tests/unit/rate-limit.test.ts` | Fixed-window rate limiter | 4 |
| `tests/unit/phone-auth.test.ts` | Phone normalisation (E.164/`+91`), OTP code format, 6-digit generator | 9 |
| `tests/integration/pipeline.test.ts` | **DB-backed**: server-side authorization boundaries, private file storage + text extraction + indexing, duplicate-upload (sha256) detection, expiry/revocation of grants | 4 |

The integration file only runs when the database is reachable; on this machine
it runs against `prisma/dev.db` and all 4 tests pass. Earlier “skipped” runs
were the same file with the DB unreachable — see the `dbUp` guard in the test.

## Build & route inventory

`next build` succeeded with a full dynamic-route page table (58 pages,
including `(app)` dashboard, cases + workspace, assistant, research, drafting,
documents, lawyers + profile, notifications, profile/security/MFA, and the
admin console). Route handlers are type-checked by Next’s generated
`.next/types` (the `route()` wrapper in `src/lib/http.ts` meets the
`RouteContext` constraint: `params: Promise<P>` from the App Router).

## What was fixed during verification

- **Phone / email-change auth (new).** Phone OTP login (no email required),
  phone verification from the profile page, and a password-confirmed email
  change are implemented with a pluggable SMS adapter
  (`SMS_DRIVER=none|console|twilio`). With no SMS provider configured the APIs
  return `sent:false` with an explicit reason and never fake delivery; in
  non-production the code is also returned as `devCode` so local login works.
  OTPs are 6 digits, hashed at rest, single-use, attempt-bounded and expiring.
  Email change is only applied after the link mailed to the new address is
  opened. Unit tests: `tests/unit/phone-auth.test.ts`.
- **First-admin login deadlock.** `requiresMfa` is role-based, so a freshly
  bootstrapped `SUPER_ADMIN` (`mfaEnabled=false`) was rejected at login with
  `mfa_required` — yet MFA can only be enabled from an authenticated session, so
  the first administrator could never sign in. Login now permits a single
  sign-in for a not-yet-enrolled privileged account and returns
  `mfaSetupRequired: true`; the login page routes it to **Profile → Security** to
  enrol, and every later login requires a valid TOTP code. Verified over HTTP
  (see matrix above).
- Added `npm run db:demo` (`prisma/demo.ts`) for local evaluation accounts; it is
  idempotent and refuses to run with `NODE_ENV=production`.
- `useApi` returns a proper discriminated union on `status`; `data`/`error` are
  only reachable after narrowing (fixed ~25 destructure/narrowing errors across
  case workspace, cases, dashboard, assistant).
- Sub-components in `case-workspace.tsx`/`drafting.tsx` that referenced `t`
  without `const t = makeT(locale)`.
- `admin/dashboard` queried `aiUsageRecord`; Prisma’s generated field is
  `aIUsageRecord`.
- `sources/[sourceId]/ingest` passed `chunkOverlap` to `chunkText`, whose
  option is `overlap`.
- `chat` POST now persists `language` (`?? "hi"`) and `citationsJson: []` for
  user messages (schema fields are required; SQLite disallows JSON defaults).
- `cases` POST persists `tags: body.tags ?? []`.
- Admin advocate/source routes: `route()` wrapper now matches Next 15.5
  `RouteContext` typing.
- `tests/integration/pipeline.test.ts`: creation of `LegalCase`/`CaseAccessGrant`
  now supplies required `Json` fields (`tags`, `scopeJson`), and the grant-expiry
  assertion expires the existing unique `(caseId, granteeId)` row instead of
  creating a duplicate.
- `prisma/seed.ts` and `src/worker/index.ts` load `.env` via Node’s built-in
  `process.loadEnvFile()` (tsx does not load `.env` and Prisma needs
  `DATABASE_URL`).
- Optional `nodemailer` import uses a `webpackIgnore` dynamic import so the
  production build works without the package installed.

## Known gaps (unchanged — see `docs/KNOWN_LIMITATIONS.md`)

1. **No live court/eCourts integration.** Legal knowledge is seeded as
   UNVERIFIED official-source metadata; answers only ever cite what an
   administrator ingests and marks HUMAN_VERIFIED.
2. **Voice, TTS, OCR, malware scanning** are provider interfaces — inert until
   configured. `AI_PROVIDER=none` here, so AI features answer with an honest
   “not configured” response and never fake success.
3. **Indic-script PDF export** needs an embedded Unicode font; DOCX/CSV are real.
4. **Email** defaults to a console driver; SMTP requires the optional
   `nodemailer` package plus `SMTP_*` variables.
5. **E2E (Playwright)** is not run: browsers are not installed
   (`npx playwright install chromium` is the prerequisite).
6. **Security testing** (authz boundary tests exist and pass) — a full
   penetration test and professional legal/compliance review (DPDP Act, IT
   Rules) are still required before production.