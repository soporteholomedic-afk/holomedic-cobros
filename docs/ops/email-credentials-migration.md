# Email Credentials Migration — per-purpose SMTP

**Change:** `smtp-consolidados-creds` · **Date:** 2026-06-23 · **Severity:** BREAKING (env rename)

The email sender now resolves SMTP credentials **per purpose**. Each purpose `X`
reads `SMTP_USER_X` and `SMTP_PASS_X`. The legacy `SMTP_USER` / `SMTP_PASS`
variables are no longer read by the application.

| Purpose | Read by | Env vars |
|---|---|---|
| `facturacion` | Cobre flow (`/api/send-email`) | `SMTP_USER_FACTURACION`, `SMTP_PASS_FACTURACION` |
| `consolidados` | Consolidated results (`/api/consolidados/send-results`) | `SMTP_USER_CONSOLIDADOS`, `SMTP_PASS_CONSOLIDADOS` |

`SMTP_HOST` and `SMTP_PORT` stay shared (no per-purpose override).

## What to rename

In production `.env.local`, **before the next deploy**:

```diff
- SMTP_USER=facturacion@holomedic.com.pe
- SMTP_PASS=<legacy-app-password>
+ SMTP_USER_FACTURACION=facturacion@holomedic.com.pe
+ SMTP_PASS_FACTURACION=<facturacion-app-password>
+ SMTP_USER_CONSOLIDADOS=consolidados@holomedic.com.pe
+ SMTP_PASS_CONSOLIDADOS=<consolidados-app-password>
```

Also provision a separate Google Workspace account + app password for
`consolidados@holomedic.com.pe` (it is a new sender identity).

## When

Rename the env vars **before** deploying the code. The code resolves credentials
at transport-creation time (module level), so a process restart is required for
the new vars to take effect.

## What error appears if forgotten

If the rename is missing, sends fail fast with a names-only error (the resolved
password is never part of the message):

- **Cobre flow** → HTTP **500**, body:
  `SMTP not configured for facturacion: missing SMTP_USER_FACTURACION`
- **Consolidated-results flow** → HTTP **502**, body:
  `SMTP not configured for consolidados: missing SMTP_USER_CONSOLIDADOS`

The error is loud and names the exact missing variable, so it is observable in
production logs immediately on the first send.

## Verification after deploy

1. Restart the Next.js process (module-level resolver picks up the new vars).
2. Send a test cobre email → expect HTTP 200, sender `facturacion@...`.
3. Send a test consolidated-results email → expect HTTP 200, sender
   `consolidados@...`.

## Rollback sequence (CRITICAL)

The env-var rename is an **operator action** and is not reversed by reverting
code. If a deploy must be rolled back, follow this order:

1. **Restore the legacy `SMTP_USER` / `SMTP_PASS` env vars** in production
   `.env.local` FIRST.
2. **Then** `git revert <merge-commit>` of the `smtp-consolidados-creds` PR.

Reverting the code without restoring the legacy vars breaks the cobre flow: the
reverted code reads `SMTP_USER` (which no longer exists after the rename), while
the new `SMTP_USER_FACTURACION` is unread by the reverted code. Restoring the
legacy vars first keeps both directions working during the rollback window.

> Note: after `git revert`, `purpose` is no longer required on `sendEmail`, so
> the cobre route compiles again without the `purpose: 'facturacion'` argument.
