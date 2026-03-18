# SEO/SXO Audit Web App

AI-powered SEO and SXO audit platform delivering INP analysis, AI Citation Gap reports, and automated content decay bucketing for paying users.

## Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript (strict mode)
- **ORM:** Prisma
- **Database:** PostgreSQL

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Lint check
npx prisma studio # Browse database
npx prisma migrate dev # Run migrations
```

## Workflow

For every feature or change, follow this sequence:

1. **Explore** — Read relevant code, understand existing patterns, check @docs/ for specs.
2. **Plan** — Outline the approach, identify affected files, consider edge cases.
3. **Code** — Implement the change, write tests, verify it works.

Never skip straight to coding. Always explore and plan first.

## Security Rules

- Use strict Zod validation for all inputs and parameterized queries via Prisma to prevent SQL injection.
- Never trust client-side data — validate on the server.
- Keep secrets in environment variables; never commit `.env` files.
- Sanitize all user-facing output to prevent XSS.

## Project Structure

```
src/
  app/          # Next.js App Router pages and layouts
  components/   # React components
  lib/          # Shared utilities, Prisma client, helpers
  services/     # Business logic (INP analysis, citation gaps, decay bucketing)
prisma/
  schema.prisma # Database schema
```

## Detailed Specs

Architecture decisions, feature specs, and API contracts live in **@docs/**. Always check there before implementing a new feature.

## Conventions

- Prefer server components; use `"use client"` only when necessary.
- Colocate tests next to the files they test.
- Name branches: `feat/`, `fix/`, `chore/` prefixes.
