# SEO Audits App

Next.js + Prisma + Clerk app for SEO/SXO audits with admin controls, feature flags, exports, and background workers.

## Local Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment (`.env.local`) with at least:
- `DATABASE_URL`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_WEBHOOK_SECRET`

3. Apply DB migrations:
```bash
npx prisma migrate deploy
npx prisma generate
```

4. Start app:
```bash
npm run dev
```

## Admin Setup

Admin access is based on Clerk `publicMetadata.role = "admin"`.

Set the role for your user in Clerk Dashboard or via Clerk API. After setting it:
1. Sign out.
2. Sign in again (to refresh session metadata).
3. Open `/admin`.

## Quota Behavior

- Monthly audit quota uses `user.auditLimit` in DB.
- `user.auditLimit` can differ from plan default if changed by admin.
- If you raise limits in admin UI, ensure the specific user row reflects the new value and then create a new audit.

## Feature Flag Behavior

- Admin feature toggles are enforced server-side (not only UI).
- Examples:
  - `export.pdf`, `export.csv`, `export.json` block corresponding export endpoints.
  - `audit.citation-analysis` blocks citation trigger endpoint.
  - `audit.steps.*` and `audit.max-pages-override` affect audit creation enforcement.

## Verification Commands

```bash
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run test:e2e
```

## Manual Smoke Checklist

1. Create a new audit from `/audits/new`.
2. Open audit detail and confirm progress updates.
3. Export `PDF`, `Pages CSV`, and `JSON` (as allowed by plan/flags).
4. In `/admin/features`, toggle an export flag and verify behavior changes immediately on export endpoint/UI.
5. In `/admin/users`, change `auditLimit` and verify audit creation quota reflects new value.

## E2E Smoke

The repository includes Playwright smoke tests in `e2e/`.

```bash
npm run test:e2e
```

Optional environment variables:
- `E2E_PORT` (default: `3100`)
- `E2E_BASE_URL` (default: `http://127.0.0.1:${E2E_PORT}`)

Notes:
- Playwright starts Next.js with `E2E_BYPASS_CLERK=true` for deterministic browser E2E runs.
- Test-only routes are available in this mode:
  - `POST /api/e2e/session`
  - `DELETE /api/e2e/session`
  - `POST /api/e2e/bootstrap`
- Outside E2E mode, these routes return `404`.

## CI

GitHub Actions workflow:
- `.github/workflows/ci.yml`

Pipeline jobs:
- `validate`: lint + unit/integration tests + typecheck
- `e2e`: Postgres + Redis services, Prisma migrate, Playwright E2E
