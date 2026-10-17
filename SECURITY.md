# NyayaAI — Security Checklist

This document records the controls that are **implemented in code** and the
areas that still need work before a production launch. It is not a compliance
certificate.

## Access control

- [x] Every protected API route resolves the session server-side (`requireSession`).
- [x] Case access is resolved per-request (`resolveCaseAccess` / `requireCaseAccess`)
      — ownership or an explicit, non-revoked, non-expired grant.
- [x] Non-owners receive **404** rather than 403 for cases they cannot see.
- [x] Document access additionally honours per-document grant scope.
- [x] Admin capabilities are gated by a role→capability matrix (`src/lib/auth/rbac.ts`).
- [x] Client-supplied `userId`/role/ownership is never trusted.
- [x] Global search is scoped by session user id.
- [x] Reports/exports re-check authorization before generating a file.

## Authentication

- [x] Passwords hashed with bcrypt (cost 12); plaintext is never stored.
- [x] Password policy: ≥10 chars with a letter and a digit.
- [x] Opaque session tokens; only a SHA-256 hash is stored (`UserSession.tokenHash`).
- [x] Cookies: HttpOnly, SameSite=Lax, Secure in production, `path=/`.
- [x] Session expiry (+ revocation) and a "revoke all sessions" action.
- [x] Logout revokes the session server-side; password reset revokes all sessions.
- [x] Email verification and password reset via single-use, hashed, expiring tokens.
- [x] Login/reset return generic errors and use constant-time comparison
      (no user enumeration).
- [x] TOTP MFA available; **mandatory** for ADMIN/SUPER_ADMIN; MFA secrets
      encrypted with AES-256-GCM. A privileged account that has not enrolled yet
      gets exactly one sign-in (flagged `mfaSetupRequired`) so it can enable MFA;
      every subsequent login requires a valid code.
- [x] Phone login via 6-digit SMS OTP (optional, for users without email). Codes
      are stored only as SHA-256 hashes, are single-use, expire
      (`SMS_OTP_TTL_MINUTES`) and are attempt-bounded (`SMS_OTP_MAX_ATTEMPTS`).
      No SMS provider is configured by default: the APIs then report `sent:false`
      with an explicit reason and never pretend a message was delivered. MFA-
      enabled accounts must still pass a TOTP check on the phone path.
- [x] Email change requires the current password, creates a single-use token, and
      is applied **only** after the confirmation link sent to the new address is
      opened (so a mistyped address cannot lock the owner out).

## Request integrity

- [x] Double-submit CSRF token required on all state-changing requests.
- [x] Same-origin enforcement for mutations (`assertSameOrigin`).
- [x] Zod validation on every request body and query.
- [x] Rate limiting on auth, AI, upload and export endpoints.
- [x] Request size + upload limits; PDF page limits.

## File handling

- [x] Files validated by **magic bytes** (extensions and MIME are untrusted).
- [x] Allow-list: PDF, DOCX, TXT, JPG, PNG; executables/archives rejected.
- [x] Storage keys are generated; path traversal is blocked and re-checked.
- [x] Files stored privately outside `public/`; downloads streamed after authz.
- [x] Response headers: `no-store`, `nosniff`, `Content-Disposition`.
- [x] Malware-scan hook (inert until a scanner is configured).
- [x] Failed processing never deletes the original document.

## AI safety

- [x] Retrieved/uploaded content wrapped as untrusted data; instruction-like tags
      stripped; system prompt forbids following embedded instructions.
- [x] No fabricated citations: when retrieval returns nothing, the model is told to
      say sources are insufficient.
- [x] Confidential documents are not transmitted without explicit per-request
      consent **and** `AI_ALLOW_DOCUMENT_TRANSMISSION=true`.
- [x] Per-user AI rate limits; bounded retries with backoff and timeouts.
- [x] AI usage/cost recorded; answers flagged by users are stored for review.

## Logging, secrets & operations

- [x] Structured JSON logs with secret redaction and request IDs.
- [x] Secrets only in environment variables; `.env` is git-ignored.
- [x] Production refuses the development `SESSION_SECRET`.
- [x] Admin UI shows provider **status**, never credentials.
- [x] Security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- [x] Audit trail for auth, case, document, sharing and admin actions.

## Recommended before production (not yet done)

- [ ] Independent penetration test of authz boundaries and the upload pipeline.
- [ ] Increase bcrypt cost / consider Argon2id per current OWASP guidance.
- [ ] Move rate limiting to a shared store (Redis) for multi-instance deployments.
- [ ] Add malware scanning (ClamAV) and run document processing in an isolated sandbox.
- [ ] Enable encryption at rest for the database and object storage at the
      infrastructure layer; review key management.
- [ ] Add dependency scanning (e.g. `npm audit`/Dependabot) to CI.
- [ ] Configure CSP without `unsafe-inline` (nonce-based) once inline styles are removed.
- [ ] Complete DPDP Act 2023 data-subject-request workflows and retention automation.
- [ ] Legal/professional-conduct review of the lawyer directory and disclaimers.
