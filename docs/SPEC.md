# Technical Specification: SEO/SXO Audit Web App

| Field          | Value                                                    |
|----------------|----------------------------------------------------------|
| Version        | 0.2.0                                                    |
| Status         | Approved (2026 benchmarks applied)                       |
| Last Updated   | 2026-02-11                                               |
| PRD Reference  | [docs/PRD.md](./PRD.md)                                 |
| Conventions    | [CLAUDE.md](../CLAUDE.md)                                |

> This document is the **implementation contract**. The PRD defines _what_ to build; this SPEC defines _how_. All architectural decisions below were resolved through stakeholder interviews and are binding for implementation.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER                                │
│   shadcn/ui + Tremor charts │ Clerk auth UI │ SSE client        │
└──────────────┬──────────────────────────────┬───────────────────┘
               │ HTTPS                        │ SSE (EventSource)
┌──────────────▼──────────────────────────────▼───────────────────┐
│                     NEXT.JS APP (Railway)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Clerk Auth   │  │ API Routes   │  │ SSE Progress       │    │
│  │ Middleware    │  │ (Zod valid.) │  │ Endpoint           │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘    │
│         │                 │                    │                 │
│  ┌──────▼─────────────────▼────────────────────▼───────────┐    │
│  │              Prisma ORM (RLS by userId)                 │    │
│  └──────────────────────┬──────────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────────────────────┐
   │ PostgreSQL │  │   Redis    │  │    BullMQ Workers          │
   │ (Railway)  │  │ (Railway)  │  │    (Railway service)       │
   └────────────┘  └─────┬──────┘  │  ┌──────────────────────┐  │
                         │         │  │ Playwright (5 pages)  │  │
                         │ pub/sub │  │ PageSpeed Insights API│  │
                         └─────────│  │ Gemini API            │  │
                                   │  │ Search Console API    │  │
                                   │  └──────────────────────┘  │
                                   └────────────────────────────┘
```

### Deployment Target

**Railway (all-in-one platform):**
- **Web service:** Next.js app (API routes, SSE, Clerk, Prisma)
- **Worker service:** BullMQ workers (Playwright, external API calls)
- **Redis:** Railway managed Redis instance
- **PostgreSQL:** Railway managed PostgreSQL instance

All services on the same Railway project for simplified networking and shared environment variables.

---

## 2. Authentication & User Model

### Provider: Clerk

**Flat user model** — no organizations, no teams. Each user owns their audits directly.

### Auth Flow

```
1. User signs up/in via Clerk hosted UI (redirects)
2. Clerk webhook (user.created / user.updated) → POST /api/webhooks/clerk
3. Webhook handler syncs Clerk user → Prisma User record
4. All API routes use Clerk middleware to extract userId from session
5. Prisma middleware auto-injects WHERE userId = ? on all queries
```

### Clerk Configuration

- **Sign-in methods:** Email + password, Google OAuth
- **Session strategy:** Clerk JWT, validated server-side via `@clerk/nextjs`
- **Metadata:** `publicMetadata.plan` stores subscription tier ("free" | "pro" | "enterprise")
- **Webhook events:** `user.created`, `user.updated`, `user.deleted`

### Billing (Post-MVP)

Deferred. During MVP, all users get the "free" plan with a default audit limit. Post-MVP: Stripe Checkout for payments, Stripe webhooks update `publicMetadata.plan` via Clerk API. Audit limits enforced by checking `user.plan` against `user.auditLimit` before creating new AuditRun.

---

## 3. Database Schema

### ID Strategy: CUID2

All primary keys use Prisma's `@default(cuid())`. URL-safe, non-sequential, collision-resistant.

### Enums

```prisma
enum AuditStatus {
  QUEUED
  CRAWLING
  RUNNING
  COMPLETED
  FAILED
}

enum Severity {
  CRITICAL
  SERIOUS
  MODERATE
  MINOR
}

enum InpRating {
  GOOD        // < 200ms
  NEEDS_IMPROVEMENT  // 200-500ms
  POOR        // >= 500ms
}

enum DecayBucket {
  HEALTHY
  STAGNANT
  DECLINING
  DECAY_CANDIDATE
}

enum CitationPlatform {
  GEMINI
  PERPLEXITY   // post-MVP
  CHATGPT      // post-MVP
  CLAUDE        // post-MVP
}

enum GapType {
  CITATION_GAP       // competitor cited, client not
  LOW_VISIBILITY     // client cited < 20% of queries
  NOT_CITED          // client never cited
}
```

### Models

```prisma
model User {
  id          String     @id @default(cuid())
  clerkId     String     @unique
  email       String     @unique
  name        String?
  plan        String     @default("free")   // "free" | "pro" | "enterprise"
  auditLimit  Int        @default(5)        // audits per month
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  auditRuns   AuditRun[]

  @@index([clerkId])
}

model AuditRun {
  id               String      @id @default(cuid())
  userId           String
  targetDomain     String
  status           AuditStatus @default(QUEUED)
  selectedSteps    Int[]       @default([1,2,3,4,5,6,7])
  seedKeywords     String[]    @default([])
  competitorDomains String[]   @default([])
  maxPages         Int         @default(500)

  // Progress tracking
  totalPages       Int         @default(0)
  completedPages   Int         @default(0)
  currentStep      Int?
  currentStepName  String?

  // URA Scores (null until complete)
  uraScoreU        Float?
  uraScoreR        Float?
  uraScoreA        Float?
  uraScoreOverall  Float?

  startedAt        DateTime?
  completedAt      DateTime?
  createdAt        DateTime    @default(now())

  user             User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  pages            AuditPage[]
  issues           AuditIssue[]
  citationQueries  CitationQuery[]

  @@index([userId])
  @@index([status])
  @@index([createdAt])
}

model AuditPage {
  id                    String       @id @default(cuid())
  auditRunId            String
  url                   String
  httpStatus            Int?

  // Step 2: Crawl Depth
  crawlDepth            Int?

  // Step 3: Page Speed
  performanceScore      Float?       // 0-100

  // Step 4: INP
  inpValue              Float?       // milliseconds
  inpRating             InpRating?

  // Step 5: Mobile
  mobileFriendly        Boolean?

  // Step 7: Accessibility
  accessibilityScore    Float?       // 0-100

  // Usability: DOM Size (2026 benchmark)
  domNodeCount          Int?         // flag if >= 1400

  // Step 8: Title & Meta
  titleTag              String?
  titleLength           Int?
  metaDescription       String?
  metaDescriptionLength Int?

  // Step 9: Headings + Visual Prominence (2026)
  h1Count               Int?
  h1FontSizePx          Float?       // avg weighted font size of H1
  h1IsLargestHeading    Boolean?     // true if H1 is visually most prominent

  // Step 10: NLP
  wordCount             Int?

  // Step 11: Internal Links
  internalLinksInbound  Int?
  internalLinksOutbound Int?

  // Step 12: Content Decay
  contentAge            Int?         // days
  decayBucket           DecayBucket?

  // Step 13: Schema (2026 — sameAs for Knowledge Graph)
  hasSameAs             Boolean?     // JSON-LD sameAs attribute present
  sameAsUrls            Json?        // string[] of sameAs URLs (Wikidata, Wikipedia, etc.)

  // Step 17: E-E-A-T (2026 — author entity tracking)
  eeatScore             Float?       // 0-100
  hasAuthorByline       Boolean?     // author name present on page
  hasAuthorPage         Boolean?     // links to dedicated author bio page

  // Overflow: full step results as JSON
  details               Json?        // { step1: {...}, step3: {...}, ... }

  createdAt             DateTime     @default(now())

  auditRun              AuditRun     @relation(fields: [auditRunId], references: [id], onDelete: Cascade)
  issues                AuditIssue[]

  @@index([auditRunId])
  @@index([decayBucket])
  @@index([performanceScore])
  @@index([domNodeCount])
}

model AuditIssue {
  id             String    @id @default(cuid())
  auditRunId     String
  auditPageId    String?   // null for site-wide issues
  stepNumber     Int
  severity       Severity
  category       String    // e.g., "crawlability", "performance", "accessibility"
  message        String
  selector       String?   // DOM selector if applicable
  recommendation String?
  createdAt      DateTime  @default(now())

  auditRun       AuditRun  @relation(fields: [auditRunId], references: [id], onDelete: Cascade)
  auditPage      AuditPage? @relation(fields: [auditPageId], references: [id], onDelete: Cascade)

  @@index([auditRunId])
  @@index([severity])
  @@index([stepNumber])
  @@index([auditRunId, severity])
}

model CitationQuery {
  id           String           @id @default(cuid())
  auditRunId   String
  queryText    String
  seedKeyword  String
  createdAt    DateTime         @default(now())

  auditRun     AuditRun         @relation(fields: [auditRunId], references: [id], onDelete: Cascade)
  results      CitationResult[]

  @@index([auditRunId])
}

model CitationResult {
  id                String            @id @default(cuid())
  citationQueryId   String
  platform          CitationPlatform
  responseText      String
  citedDomains      Json              // string[]
  clientCited       Boolean
  competitorsCited  Json              // { domain: boolean }
  citationContext   String?
  createdAt         DateTime          @default(now())

  citationQuery     CitationQuery     @relation(fields: [citationQueryId], references: [id], onDelete: Cascade)
  gaps              CitationGap[]

  @@index([citationQueryId])
  @@index([platform])
}

model CitationGap {
  id                String          @id @default(cuid())
  citationResultId  String
  competitorDomain  String
  gapType           GapType
  priority          Int             @default(0)  // higher = more important
  recommendedAction String?

  citationResult    CitationResult  @relation(fields: [citationResultId], references: [id], onDelete: Cascade)

  @@index([citationResultId])
  @@index([gapType])
}

// --- Admin Module Models ---

model FeatureFlags {
  id        String   @id @default("global")  // singleton row
  flags     Json                              // { [flagName]: FeatureFlagConfig }
  updatedAt DateTime @updatedAt
  updatedBy String                            // admin userId who last changed
}

model AdminAuditLog {
  id        String   @id @default(cuid())
  adminId   String                            // Clerk userId of admin
  action    String                            // e.g., "user.plan.changed"
  targetId  String?                           // affected user/audit/flag ID
  details   Json                              // { before: ..., after: ... }
  ipAddress String?
  createdAt DateTime @default(now())

  @@index([adminId])
  @@index([action])
  @@index([createdAt])
}
```

### Row-Level Security (App Layer)

Prisma middleware at `src/lib/prisma.ts` intercepts all queries and injects the authenticated `userId`:

```typescript
// Pseudocode — actual implementation in src/lib/prisma.ts
prisma.$use(async (params, next) => {
  // For models with userId: auto-inject WHERE userId = currentUser
  // For models under AuditRun: join through AuditRun.userId
  // Prevents any cross-user data access
});
```

---

## 4. BullMQ Pipeline Architecture

### Queue Topology

| Queue Name           | Purpose                          | Concurrency |
|----------------------|----------------------------------|-------------|
| `audit-orchestrator` | Manages audit lifecycle + DAG    | 3           |
| `audit-crawl`        | Steps 1-2 (crawl + depth)       | 2           |
| `audit-usability`    | Steps 3-7 (per-URL, parallel)   | 5           |
| `audit-relevance`    | Steps 8-14 (per-URL, parallel)  | 5           |
| `audit-authority`    | Steps 15-18 (deferred Phase 4)  | 3           |
| `audit-citations`    | Step 16 citation analysis        | 2           |

### DAG Execution Order

```
                    ┌─────────────────┐
                    │   ORCHESTRATOR  │
                    │  (AuditRun job) │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    PHASE A      │
                    │  Step 1: Crawl  │  Sequential. Discovers URLs,
                    │  Step 2: Depth  │  builds link graph.
                    └────────┬────────┘
                             │ URL list ready
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  PHASE B   │  │  PHASE C   │  │  PHASE D   │
     │ Steps 3-7  │  │ Steps 8-14 │  │  Step 12   │
     │ Usability  │  │ Relevance  │  │ Decay only │
     │ (per URL)  │  │ (per URL)  │  │ (GSC data) │
     └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
           │               │               │
           └───────────────┼───────────────┘
                           ▼
                  ┌────────────────┐
                  │  PHASE E       │  (Phase 4+ only)
                  │  Steps 15-18   │
                  │  Authority     │
                  └────────┬───────┘
                           ▼
                  ┌────────────────┐
                  │  SCORING       │
                  │  Calculate URA │
                  │  Mark COMPLETE │
                  └────────────────┘
```

**Phase B, C, D run in parallel.** Each dispatches per-URL jobs to their respective queues.

### Worker Configuration

```typescript
// src/services/queue/worker.config.ts
export const WORKER_CONFIG = {
  playwright: {
    maxConcurrentPages: 5,         // ~1GB RAM for browsers
    pageTimeoutMs: 30_000,         // 30s per page
    navigationTimeoutMs: 15_000,   // 15s for page load
  },
  orchestrator: {
    auditTimeoutMs: 15 * 60_000,  // 15-minute hard limit
  },
  retry: {
    maxAttempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1_000,                // 1s, 4s, 16s
    },
  },
  redis: {
    maxRetriesPerRequest: null,    // BullMQ requirement
  },
};
```

### Error Handling

Per URL per step:
1. Attempt execution
2. On failure: retry up to 3× with exponential backoff (1s → 4s → 16s)
3. After 3 failures: mark URL-step as `error` in `AuditPage.details`, create an `AuditIssue` with `severity: MODERATE` and the error message
4. Continue processing other URLs and other steps
5. Audit still completes with partial data; report shows error indicators on affected URLs

---

## 5. Service-Layer Abstraction

All external API calls routed through service classes at `src/services/integrations/`. **No API keys ever reach the browser.**

### Service Classes

```
src/services/integrations/
  ├── pageSpeed.service.ts    # Google PSI API (Steps 3, 4)
  ├── gemini.service.ts       # Google Gemini API (Step 16)
  ├── searchConsole.service.ts # Google Search Console (Step 12)
  ├── playwright.service.ts   # Playwright browser pool (Steps 1,2,4,5,7)
  └── index.ts                # Re-exports all services
```

### Service Contract (Interface)

Every service implements:

```typescript
interface ExternalService {
  readonly name: string;

  // Health check
  isAvailable(): Promise<boolean>;

  // Rate limit status
  getRateLimitStatus(): { remaining: number; resetsAt: Date };
}
```

### PageSpeed Service

- **API:** Google PageSpeed Insights API v5
- **Endpoint:** `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`
- **Auth:** API key via `GOOGLE_PSI_API_KEY`
- **Rate limit:** 25,000 queries/day (free), enforced at service layer
- **Returns:** Performance score, LCP, INP, CLS, TTFB, FCP, and CrUX field data (when available)
- **Used by:** Step 3 (overall CWV), Step 4 (INP deep dive — extract INP-specific data from the response)

### Gemini Service (Dev Phase)

- **API:** Google Gemini API (Gemini 2.0 Flash)
- **Auth:** API key via `GEMINI_API_KEY`
- **Rate limit:** 15 RPM free tier, enforced at service layer
- **Purpose:** Citation gap analysis during development. Send industry queries, parse response for domain/brand mentions.
- **Post-launch additions:** `PerplexityService`, `OpenAIService`, `AnthropicService` following the same interface

### Search Console Service

- **API:** Google Search Console API v1
- **Auth:** OAuth 2.0 (service account or user-delegated)
- **Purpose:** Step 12 — retrieve click/impression data for content decay analysis
- **Data:** Per-URL clicks, impressions, CTR, position over 90/180 day windows

### Playwright Service

- **Role:** Manages a pool of up to 5 concurrent browser pages
- **Used by:** Step 1 (crawl + AI bot audit), Step 2 (link graph), Step 4 (INP lab measurement), Step 5 (mobile rendering), Step 7 (axe-core accessibility)
- **Pool pattern:** Semaphore-based checkout/return of browser pages
- **Browser:** Chromium (single instance, multiple pages via BrowserContexts)
- **DOM measurement:** Captures `document.querySelectorAll('*').length` per page for DOM size checks

---

## 6. SSE Real-Time Progress

### Endpoint

`GET /api/audits/:id/progress`

### Protocol

Server-Sent Events (SSE) via Next.js Route Handler with `ReadableStream`.

### Event Schema

```typescript
interface AuditProgressEvent {
  auditId: string;
  status: AuditStatus;
  currentStep: number | null;
  currentStepName: string | null;
  urlsProcessed: number;
  urlsTotal: number;
  percentComplete: number;           // 0-100
  stepProgress: {
    [stepNumber: number]: {
      status: 'pending' | 'running' | 'completed' | 'error';
      urlsProcessed: number;
      urlsTotal: number;
      errors: number;
    };
  };
  timestamp: string;                 // ISO 8601
}
```

### Data Flow

```
BullMQ Worker → job.updateProgress() → Redis pub/sub channel `audit:${auditId}:progress`
                                                    │
API Route (SSE) ← Redis subscribe ← ────────────────┘
       │
       ▼ EventSource
  React hook: useAuditProgress(auditId)
```

### Client Hook

```typescript
// src/lib/hooks/useAuditProgress.ts
function useAuditProgress(auditId: string): {
  progress: AuditProgressEvent | null;
  isConnected: boolean;
  error: Error | null;
}
```

Auto-reconnects on connection drop. Cleans up EventSource on unmount.

---

## 7. API Route Specifications

All routes require Clerk authentication. All inputs validated with Zod. All responses typed.

### POST /api/audits

Create a new audit run.

```typescript
// Zod schema: src/lib/validators/audit.ts
const CreateAuditSchema = z.object({
  domain: z.string().url().refine(
    (url) => !url.includes('localhost'),
    'Cannot audit localhost'
  ),
  seedKeywords: z.array(z.string().max(100)).max(50).optional().default([]),
  competitorDomains: z.array(z.string().url()).max(10).optional().default([]),
  selectedSteps: z.array(z.number().int().min(1).max(18)).optional()
    .default([1, 2, 3, 4, 5, 6, 7]),
  maxPages: z.number().int().min(1).max(1000).optional().default(500),
});
```

**Logic:**
1. Validate input with Zod
2. Check user audit limit (count this month's audits vs `user.auditLimit`)
3. Create `AuditRun` with status `QUEUED`
4. Enqueue orchestrator job in BullMQ
5. Return `{ auditId, status: 'QUEUED' }`

### GET /api/audits

List user's audits (paginated).

```typescript
const ListAuditsSchema = z.object({
  cursor: z.string().cuid2().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
  status: z.nativeEnum(AuditStatus).optional(),
});
```

### GET /api/audits/:id

Get audit run details + summary scores.

### GET /api/audits/:id/pages

List audited pages (cursor-paginated, filterable).

```typescript
const ListPagesSchema = z.object({
  cursor: z.string().cuid2().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  minSeverity: z.nativeEnum(Severity).optional(),
  stepNumber: z.number().int().min(1).max(18).optional(),
  decayBucket: z.nativeEnum(DecayBucket).optional(),
  sortBy: z.enum(['performanceScore', 'inpValue', 'crawlDepth', 'internalLinksInbound']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});
```

### GET /api/audits/:id/issues

List all issues (filterable by step, severity, pillar).

```typescript
const ListIssuesSchema = z.object({
  cursor: z.string().cuid2().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  severity: z.nativeEnum(Severity).optional(),
  stepNumber: z.number().int().min(1).max(18).optional(),
  pillar: z.enum(['usability', 'relevance', 'authority']).optional(),
});
```

Pillar filter maps to step ranges: usability = 1-7, relevance = 8-14, authority = 15-18.

### GET /api/audits/:id/export/:format

Export audit report.

```typescript
const ExportSchema = z.object({
  format: z.enum(['csv', 'pdf', 'json']),
});
```

- **CSV:** AuditPage rows with all typed columns. Generated server-side.
- **PDF:** Playwright renders the report page and prints to PDF. Returns PDF binary.
- **JSON:** Full AuditRun with nested pages and issues.

### POST /api/audits/:id/citations

Trigger citation gap analysis (separate from main audit pipeline).

```typescript
const TriggerCitationsSchema = z.object({
  seedKeywords: z.array(z.string().max(100)).min(5).max(50),
  competitorDomains: z.array(z.string().url()).min(1).max(10),
  queriesPerKeyword: z.number().int().min(1).max(10).optional().default(4),
});
```

### GET /api/audits/:id/progress

SSE stream (see Section 6).

### POST /api/webhooks/clerk

Clerk webhook receiver. Verifies webhook signature via `CLERK_WEBHOOK_SECRET`. Syncs user data to Prisma.

---

## 8. UI Architecture

### Component Library

- **shadcn/ui** — Forms, tabs, accordion, data tables, cards, badges, dialogs, toasts
- **Tremor** — Bar charts (URA score comparison), donut charts (pillar scores), progress bars, KPI number cards

### Page Structure

```
src/app/
  layout.tsx                          # Root layout (ClerkProvider, fonts, Tailwind)
  (auth)/
    sign-in/[[...sign-in]]/page.tsx   # Clerk sign-in
    sign-up/[[...sign-up]]/page.tsx   # Clerk sign-up
  (dashboard)/
    layout.tsx                        # Authenticated layout (sidebar/header)
    dashboard/page.tsx                # Audit list + "New Audit" CTA
    audits/
      new/page.tsx                    # Multi-step audit wizard
      [id]/page.tsx                   # Audit detail (progress or report)
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AuditWizard` | `src/components/audit/AuditWizard.tsx` | Multi-step form: Domain → Keywords → Steps → Confirm |
| `AuditProgress` | `src/components/audit/AuditProgress.tsx` | SSE-connected live progress (step chips + URL counter + progress bar) |
| `AuditReport` | `src/components/audit/AuditReport.tsx` | Full report with URA pillar tabs |
| `URAScoreCard` | `src/components/charts/URAScoreCard.tsx` | Donut/gauge showing pillar score (0-100) with grade label |
| `StepAccordion` | `src/components/audit/StepAccordion.tsx` | Expandable section for each step's results |
| `IssueTable` | `src/components/audit/IssueTable.tsx` | Sortable/filterable data table of issues |
| `AuditCard` | `src/components/audit/AuditCard.tsx` | Dashboard card showing audit summary (domain, status, scores) |

### UI Flow

```
Dashboard ──[New Audit]──► Wizard Step 1: Enter domain
                           Wizard Step 2: Add keywords (optional)
                           Wizard Step 3: Select steps (default: 1-7)
                           Wizard Step 4: Confirm & start
                                │
                                ▼
                           Live Progress View
                           ├── Overall progress bar (0-100%)
                           ├── Step status chips (pending/running/done/error)
                           └── URL counter ("142/500 URLs processed")
                                │
                                ▼ (on completion)
                           Report View
                           ├── URA Score Cards (U / R / A / Overall)
                           ├── Tab: Usability (Steps 1-7 accordions)
                           ├── Tab: Relevance (Steps 8-14 accordions)
                           ├── Tab: Authority (Steps 15-18 accordions)
                           └── Export button (CSV / PDF / JSON)
```

---

## 9. Security Implementation

### Layers

| Layer | Mechanism | Location |
|-------|-----------|----------|
| **Authentication** | Clerk middleware, JWT validation | `src/middleware.ts` |
| **Authorization** | Prisma RLS middleware (userId filtering) | `src/lib/prisma.ts` |
| **Input validation** | Zod schemas on every route | `src/lib/validators/` |
| **SQL injection** | Prisma parameterized queries (no raw SQL) | All DB access |
| **XSS** | React JSX auto-escaping, **DOMPurify mandatory** for any raw HTML | All rendering |
| **API key protection** | Server-side service layer, no keys in browser | `src/services/integrations/` |
| **Admin authorization** | `requireAdmin()` guard on all `/api/admin/` + `(admin)/` routes | `src/lib/adminAuth.ts` |
| **Admin audit logging** | All admin actions logged with before/after state | `AdminAuditLog` model |
| **Rate limiting** | Sliding window per user | `src/lib/rateLimit.ts` |
| **DB least privilege** | Dedicated app user with restricted permissions | Railway PostgreSQL |
| **Security headers** | CSP + HSTS validated on audited sites (Step 6) and enforced on our app | `next.config.ts` + Step 6 |

### Clerk Middleware

```typescript
// src/middleware.ts
// Protects all routes under /(dashboard)
// Public routes: /, /sign-in, /sign-up, /api/webhooks/clerk
```

### Rate Limiting

`src/lib/rateLimit.ts` — Sliding window algorithm backed by Redis.

| Route | Limit |
|-------|-------|
| `POST /api/audits` | 10 per hour per user |
| `GET /api/audits/*` | 100 per minute per user |
| `POST /api/audits/:id/citations` | 5 per hour per user |

### Webhook Security

Clerk webhooks verified via `svix` library using `CLERK_WEBHOOK_SECRET`. Reject any request with invalid signature.

### Database Least Privilege (PoLP)

The Railway PostgreSQL connection **must not** use the default `postgres` superuser. Create a dedicated application user with restricted permissions:

```sql
-- Run once during Railway PostgreSQL setup
CREATE USER seoaudits_app WITH PASSWORD '...';
GRANT CONNECT ON DATABASE seoaudits TO seoaudits_app;
GRANT USAGE ON SCHEMA public TO seoaudits_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO seoaudits_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO seoaudits_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seoaudits_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO seoaudits_app;
-- NO CREATE, DROP, ALTER, TRUNCATE permissions
```

`DATABASE_URL` must reference `seoaudits_app`, not `postgres`. This prevents `DROP DATABASE` or schema destruction from AI-generated code errors or SQL injection edge cases.

### XSS Prevention: DOMPurify Mandate

**Any use of `dangerouslySetInnerHTML` is prohibited without DOMPurify sanitization.** This applies specifically to:
- Rendering crawled page titles/descriptions in audit reports
- Displaying AI-generated citation contexts
- Showing error messages that may contain HTML from external sources

```typescript
// Required pattern — src/lib/sanitize.ts
import DOMPurify from 'dompurify';
export const sanitizeHtml = (dirty: string): string =>
  DOMPurify.sanitize(dirty, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'code', 'br'] });
```

### Application Security Headers

Configure in `next.config.ts` for our own app:

```typescript
// next.config.ts — security headers
headers: [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://clerk.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://clerk.com https://*.clerk.accounts.dev wss:;" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]
```

---

## 10. 2026 Audit Benchmarks

These benchmarks supplement the PRD's per-step thresholds with 2026-specific technical checks.

### 10.1 Step 1 Addition: AI Bot Permissions

The crawlability audit **must** parse `robots.txt` for AI crawler directives. In 2026, controlling AI agent access is a first-class SEO concern.

**Bots to check:**

| User-Agent | Platform | Flag If |
|------------|----------|---------|
| `GPTBot` | OpenAI / ChatGPT | Blocked when client wants AI citations |
| `ChatGPT-User` | ChatGPT browse mode | Blocked when client wants AI citations |
| `CCBot` | Common Crawl (training data) | Blocked (limits AI training representation) |
| `Google-Extended` | Gemini / AI Overviews | Blocked when client wants Google AI visibility |
| `anthropic-ai` | Claude | Blocked when client wants Claude citations |
| `PerplexityBot` | Perplexity | Blocked when client wants Perplexity citations |

**Logic:**
- Parse `robots.txt` for each bot's `User-agent` block
- Cross-reference with the client's citation gap goals (if they selected Step 16)
- Flag as `SERIOUS` if a bot is blocked but the client wants citations on that platform
- Flag as `MINOR` informational if bots are allowed (positive signal)
- Store in `AuditPage.details.step1.aiBotPermissions: { [bot]: 'allowed' | 'blocked' | 'not_specified' }`

### 10.2 Usability Addition: Excessive DOM Size

**Threshold:** DOM node count >= 1,400 → FLAG as `MODERATE` "Excessive DOM Size"

Complex DOMs are bottlenecks for 2026 crawlers (Googlebot rendering budget) and browser rendering (directly impacts INP presentation delay).

**Measurement:** During Playwright page visit, execute:
```typescript
const nodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
```

Store in `AuditPage.domNodeCount`. Create `AuditIssue` if >= 1,400:
- **severity:** MODERATE
- **category:** "performance"
- **message:** `"Excessive DOM size: ${nodeCount} nodes (threshold: 1,400). Large DOMs degrade crawler rendering budget and increase INP presentation delay."`
- **recommendation:** `"Reduce DOM complexity: virtualize long lists, lazy-load off-screen content, use content-visibility: auto on below-fold sections."`

### 10.3 Step 9 Addition: H1 Visual Prominence

Based on Google algorithm leak insights (2024-2026), the search engine evaluates whether the `<h1>` is the most **visually prominent** heading element on the page, not just semantically first.

**Measurement:** During Playwright page visit:
```typescript
const headings = await page.evaluate(() => {
  const results: { tag: string; fontSize: number; fontWeight: number }[] = [];
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    const style = window.getComputedStyle(el);
    results.push({
      tag: el.tagName,
      fontSize: parseFloat(style.fontSize),
      fontWeight: parseInt(style.fontWeight) || 400,
    });
  });
  return results;
});
```

**Logic:**
- Calculate weighted font size: `fontSize * (fontWeight / 400)`
- H1 should have the highest weighted font size among all headings
- If any H2-H6 has a larger weighted font size than the H1 → FLAG as `MODERATE` "H1 Not Visually Prominent"
- Store: `AuditPage.h1FontSizePx` and `AuditPage.h1IsLargestHeading`

### 10.4 Step 12 Precision: Content Decay "Declining" Bucket

The `DECLINING` bucket is defined precisely as:

> **Organic traffic down > 20% comparing the most recent 90-day period to the prior 90-day period** (180-day lookback total).

Measured via Google Search Console API `searchAnalytics.query` with `dimensions: ['page']`:
- Period A: (today - 180d) to (today - 91d)
- Period B: (today - 90d) to today
- Decline % = `(B.clicks - A.clicks) / A.clicks * 100`
- If decline < -20% → `DECLINING`
- If decline between -5% and +5% for 180 days → `STAGNANT`
- If content age > 12 months AND declining → `DECAY_CANDIDATE` (CRITICAL)

### 10.5 Step 13 Addition: `sameAs` Schema Validation

The `sameAs` property in JSON-LD connects site entities to the Knowledge Graph (Wikidata, Wikipedia), which reduces AI hallucinations about the brand.

**Check:**
- Parse all JSON-LD blocks on the page
- Look for `Organization` or `Person` types with `sameAs` property
- Valid `sameAs` targets: Wikidata URLs, Wikipedia URLs, official social profiles (LinkedIn, Twitter/X, Crunchbase)
- Flag as `MODERATE` if `Organization` JSON-LD exists but has no `sameAs`
- Flag as `MINOR` informational if `sameAs` includes Wikidata/Wikipedia (positive E-E-A-T signal)
- Store: `AuditPage.hasSameAs`, `AuditPage.sameAsUrls`

### 10.6 Step 17 Addition: Author Entity Tracking

Google explicitly tracks creator entities via `isAuthor` and related attributes. The E-E-A-T check must verify:

1. **Author byline present** — Page has a visible author name (detected via `[rel="author"]`, `<meta name="author">`, schema `Person` with `isAuthor`, or common CSS patterns like `.author`, `.byline`)
2. **Author biography page linked** — The byline links to a dedicated author page on the same domain (not just a mailto: link)
3. **Author page has `Person` schema** — The linked author page contains `Person` JSON-LD with `sameAs`, `jobTitle`, `worksFor` properties

**Flags:**
- No author byline on content page → `SERIOUS` "Missing Author Attribution"
- Author byline exists but no link to bio page → `MODERATE` "Author Not Linked to Bio"
- Author bio page exists but lacks `Person` schema → `MODERATE` "Author Page Missing Schema"

Store: `AuditPage.hasAuthorByline`, `AuditPage.hasAuthorPage`

### 10.7 Step 6 Addition: CSP and HSTS Validation

Expand the HTTPS & Security audit to explicitly check for modern security headers:

| Header | Flag If |
|--------|---------|
| `Content-Security-Policy` | Missing → `MODERATE` |
| `Strict-Transport-Security` | Missing → `SERIOUS` (HSTS required for 2026 SEO) |
| `X-Content-Type-Options` | Missing → `MINOR` |
| `X-Frame-Options` or CSP `frame-ancestors` | Missing → `MINOR` |
| `Permissions-Policy` | Missing → `MINOR` informational |

HSTS specifically: verify `max-age >= 31536000` (1 year) and `includeSubDomains` is present. Google has indicated HSTS as a ranking trust signal.

---

## 11. Environment Variables

```env
# Database (MUST use restricted seoaudits_app user, NOT postgres superuser — see Section 9)
DATABASE_URL=postgresql://seoaudits_app:pass@host:5432/seoaudits

# Redis (BullMQ)
REDIS_URL=redis://default:pass@host:6379

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Google APIs
GOOGLE_PSI_API_KEY=AIza...
GEMINI_API_KEY=AIza...

# Google Search Console (service account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@...iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# App
NEXT_PUBLIC_APP_URL=https://your-app.railway.app
```

All variables stored in Railway environment settings. Locally in `.env.local` (never committed — listed in `.gitignore`).

---

## 12. Project File Structure

```
seoaudits/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                          # Landing / redirect
│   │   ├── (auth)/
│   │   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   │   └── sign-up/[[...sign-up]]/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                    # Auth guard, sidebar
│   │   │   ├── dashboard/page.tsx
│   │   │   └── audits/
│   │   │       ├── new/page.tsx
│   │   │       └── [id]/page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx                    # Admin guard (requireAdmin)
│   │   │   └── admin/
│   │   │       ├── page.tsx                  # Admin overview dashboard
│   │   │       ├── users/
│   │   │       │   ├── page.tsx              # User list
│   │   │       │   └── [id]/page.tsx         # User detail + actions
│   │   │       ├── monitoring/page.tsx       # Queue health, active audits
│   │   │       ├── features/page.tsx         # Feature flags
│   │   │       └── logs/page.tsx             # Admin audit log
│   │   └── api/
│   │       ├── audits/
│   │       │   ├── route.ts                  # POST (create), GET (list)
│   │       │   └── [id]/
│   │       │       ├── route.ts              # GET (detail)
│   │       │       ├── pages/route.ts
│   │       │       ├── issues/route.ts
│   │       │       ├── progress/route.ts     # SSE
│   │       │       ├── citations/route.ts
│   │       │       └── export/[format]/route.ts
│   │       ├── admin/
│   │       │   ├── users/
│   │       │   │   ├── route.ts              # GET (list), search
│   │       │   │   └── [id]/
│   │       │   │       ├── route.ts          # GET (detail), PATCH (update)
│   │       │   │       └── audits/route.ts   # GET (user's audits)
│   │       │   ├── monitoring/
│   │       │   │   ├── overview/route.ts     # GET aggregated stats
│   │       │   │   ├── queues/route.ts       # GET BullMQ queue health
│   │       │   │   ├── audits/route.ts       # GET active/failed audits
│   │       │   │   └── retry/[jobId]/route.ts # POST retry failed job
│   │       │   ├── features/
│   │       │   │   ├── route.ts              # GET all flags
│   │       │   │   └── [name]/route.ts       # PATCH toggle flag
│   │       │   └── logs/route.ts             # GET admin audit log
│   │       └── webhooks/
│   │           └── clerk/route.ts
│   ├── components/
│   │   ├── ui/                               # shadcn/ui primitives
│   │   ├── audit/
│   │   │   ├── AuditWizard.tsx
│   │   │   ├── AuditProgress.tsx
│   │   │   ├── AuditReport.tsx
│   │   │   ├── AuditCard.tsx
│   │   │   ├── StepAccordion.tsx
│   │   │   └── IssueTable.tsx
│   │   └── charts/
│   │       └── URAScoreCard.tsx
│   ├── lib/
│   │   ├── prisma.ts                         # Client + RLS middleware
│   │   ├── redis.ts                          # Redis client singleton
│   │   ├── rateLimit.ts                      # Sliding window limiter
│   │   ├── adminAuth.ts                      # requireAdmin() guard
│   │   ├── plans.ts                          # PLAN_TIERS config (single source of truth)
│   │   ├── featureFlags.ts                   # Feature flag checker + defaults
│   │   └── validators/
│   │       ├── audit.ts                      # Zod schemas for audit routes
│   │       ├── admin.ts                      # Zod schemas for admin routes
│   │       └── citation.ts                   # Zod schemas for citation routes
│   ├── services/
│   │   ├── integrations/
│   │   │   ├── pageSpeed.service.ts
│   │   │   ├── gemini.service.ts
│   │   │   ├── searchConsole.service.ts
│   │   │   ├── playwright.service.ts
│   │   │   └── index.ts
│   │   ├── audit/
│   │   │   ├── orchestrator.ts               # DAG orchestration logic
│   │   │   ├── step01-crawl.ts
│   │   │   ├── step02-crawlDepth.ts
│   │   │   ├── step03-pageSpeed.ts
│   │   │   ├── step04-inp.ts
│   │   │   ├── step05-mobile.ts
│   │   │   ├── step06-https.ts
│   │   │   ├── step07-accessibility.ts
│   │   │   ├── step08-titleMeta.ts
│   │   │   ├── step09-headings.ts
│   │   │   ├── step10-nlpKeywords.ts
│   │   │   ├── step11-internalLinks.ts
│   │   │   ├── step12-contentDecay.ts
│   │   │   ├── step13-structuredData.ts
│   │   │   ├── step14-images.ts
│   │   │   └── scoring.ts                    # URA score calculation
│   │   └── queue/
│   │       ├── queues.ts                     # BullMQ queue definitions
│   │       ├── workers.ts                    # Worker setup + handlers
│   │       └── config.ts                     # Concurrency, timeout, retry config
│   └── middleware.ts                         # Clerk auth middleware
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/
│   ├── PRD.md
│   └── SPEC.md
├── package.json
├── tsconfig.json
└── .env.local                                # Never committed
```

---

## 13. Admin Module

The admin module provides a secure internal dashboard for managing users, plans, system health, and feature flags. It is **separate from the public-facing audit UI** and requires elevated privileges.

### 13.1 Admin Authentication & Authorization

Admin access uses the same Clerk auth stack (DRY — no separate auth system) with a role check:

```typescript
// Admin role stored in Clerk publicMetadata.role = "admin"
// Checked via reusable middleware — single source of truth

// src/lib/adminAuth.ts
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Response('Unauthorized', { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const role = (user.publicMetadata as { role?: string })?.role;

  if (role !== 'admin') {
    throw new Response('Forbidden', { status: 403 });
  }

  return { userId, clerkUser: user };
}
```

**Security rules:**
- Admin routes are under `(admin)/` layout with `requireAdmin()` guard on every page
- Admin API routes are under `/api/admin/` with the same guard
- All admin actions are **audit-logged** (see Admin Audit Log below)
- No admin can delete their own admin role (prevents lockout)
- Admin routes are excluded from the public sitemap

### 13.2 User Management

Admins can view and manage all users in the system.

**Features:**
| Feature | Description |
|---------|-------------|
| List users | Paginated table with search by email/name, filter by plan tier |
| View user detail | Full profile: email, name, plan, audit limit, audit count, created date |
| Change plan | Update `publicMetadata.plan` via Clerk API + sync to Prisma `user.plan` |
| Adjust audit limit | Override per-user `auditLimit` (independent of plan default) |
| Disable account | Set `publicMetadata.disabled = true`, Clerk middleware rejects sessions |
| View user audits | Link to filtered audit list for a specific user |

**API Routes:**

```typescript
// GET  /api/admin/users           — List users (paginated, searchable)
// GET  /api/admin/users/:id       — User detail + stats
// PATCH /api/admin/users/:id      — Update plan, auditLimit, disabled status
// GET  /api/admin/users/:id/audits — List audits for a specific user

// Zod schemas
const ListUsersSchema = z.object({
  cursor: z.string().cuid2().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  search: z.string().max(100).optional(),        // email or name substring
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
});

const UpdateUserSchema = z.object({
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
  auditLimit: z.number().int().min(0).max(1000).optional(),
  disabled: z.boolean().optional(),
});
```

### 13.3 Pricing & Plans

Plan definitions are stored as configuration (not DB records) to keep the system simple for MVP. Post-MVP, migrate to DB-backed plan records when Stripe integration is added.

**Plan Configuration:**

```typescript
// src/lib/plans.ts — single source of truth for plan limits
export const PLAN_TIERS = {
  free: {
    label: 'Free',
    auditLimit: 5,          // per month
    maxPagesPerAudit: 50,
    maxSteps: [1, 2, 3, 4, 5, 6, 7],  // Usability only
    sseProgress: true,
    pdfExport: false,
    citationAnalysis: false,
    priority: 'normal' as const,
  },
  pro: {
    label: 'Pro',
    auditLimit: 50,
    maxPagesPerAudit: 500,
    maxSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    sseProgress: true,
    pdfExport: true,
    citationAnalysis: false,
    priority: 'high' as const,
  },
  enterprise: {
    label: 'Enterprise',
    auditLimit: 500,
    maxPagesPerAudit: 1000,
    maxSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    sseProgress: true,
    pdfExport: true,
    citationAnalysis: true,
    priority: 'high' as const,
  },
} as const;

export type PlanTier = keyof typeof PLAN_TIERS;
```

**Enforcement points (DRY — all check the same `PLAN_TIERS` config):**
1. `POST /api/audits` — reject if `selectedSteps` contains steps not in user's plan
2. `POST /api/audits` — reject if `maxPages` exceeds plan's `maxPagesPerAudit`
3. `POST /api/audits` — reject if monthly audit count >= plan's `auditLimit`
4. `GET /api/audits/:id/export/pdf` — reject if plan doesn't include `pdfExport`
5. `POST /api/audits/:id/citations` — reject if plan doesn't include `citationAnalysis`

**Admin UI for plans:**
- View current plan configuration (read-only display of `PLAN_TIERS`)
- Update a user's plan tier (via User Management)
- Dashboard KPI: user count per plan tier

### 13.4 System Monitoring

Real-time visibility into audit pipeline health and system status.

**Dashboard panels:**

| Panel | Data Source | Metrics |
|-------|------------|---------|
| Active Audits | `AuditRun WHERE status IN ('QUEUED','CRAWLING','RUNNING')` | Count, list with domain + duration |
| Failed Audits | `AuditRun WHERE status = 'FAILED'` (last 24h) | Count, list with error summary |
| Queue Health | BullMQ `Queue.getJobCounts()` | Active, waiting, delayed, failed per queue |
| Worker Status | BullMQ `Worker.isRunning()` | Worker instances, uptime, last heartbeat |
| Audit Throughput | `AuditRun WHERE completedAt > now() - 24h` | Completed audits/hour, avg duration |
| Error Rate | `AuditIssue WHERE category = 'system_error'` | Errors/hour, top error messages |
| Database Stats | Prisma `$queryRaw` | Total users, audits, pages, issues (counts) |

**API Routes:**

```typescript
// GET /api/admin/monitoring/overview    — Aggregated stats dashboard
// GET /api/admin/monitoring/queues      — BullMQ queue health
// GET /api/admin/monitoring/audits      — Active/failed audit list
// POST /api/admin/monitoring/retry/:jobId — Retry a failed BullMQ job

const RetryJobSchema = z.object({
  jobId: z.string().min(1),
  queue: z.enum(['audit-orchestrator', 'audit-crawl', 'audit-usability',
                  'audit-relevance', 'audit-authority', 'audit-citations']),
});
```

**Security:** Monitoring routes bypass Prisma RLS middleware (admin queries span all users). This is safe because `requireAdmin()` enforces role check before any data access.

### 13.5 Feature Flags

Lightweight feature flag system to control feature availability per plan tier or globally.

**Storage:** JSON configuration in database (single row, avoids config file deployment friction).

```prisma
model FeatureFlags {
  id        String   @id @default("global")  // singleton row
  flags     Json     // { [flagName]: FeatureFlagConfig }
  updatedAt DateTime @updatedAt
  updatedBy String   // admin userId who last changed
}
```

**Flag Schema:**

```typescript
// src/lib/featureFlags.ts
interface FeatureFlagConfig {
  enabled: boolean;                          // global kill switch
  plans: PlanTier[];                         // which plans have access
  description: string;                       // human-readable purpose
  rolloutPercent?: number;                   // 0-100, for gradual rollout (post-MVP)
}

// Default flags — seed on first load
const DEFAULT_FLAGS: Record<string, FeatureFlagConfig> = {
  'audit.steps.usability':    { enabled: true,  plans: ['free', 'pro', 'enterprise'], description: 'Steps 1-7 Usability pillar' },
  'audit.steps.relevance':    { enabled: false, plans: ['pro', 'enterprise'], description: 'Steps 8-14 Relevance pillar' },
  'audit.steps.authority':    { enabled: false, plans: ['enterprise'], description: 'Steps 15-18 Authority pillar' },
  'audit.citation-analysis':  { enabled: false, plans: ['enterprise'], description: 'AI citation gap analysis' },
  'export.pdf':               { enabled: true,  plans: ['pro', 'enterprise'], description: 'PDF report export' },
  'export.csv':               { enabled: true,  plans: ['free', 'pro', 'enterprise'], description: 'CSV data export' },
  'audit.max-pages-override': { enabled: false, plans: ['enterprise'], description: 'Allow > 500 pages per audit' },
};
```

**Usage (DRY — single check function):**

```typescript
// src/lib/featureFlags.ts
export async function isFeatureEnabled(
  flagName: string,
  userPlan: PlanTier
): Promise<boolean> {
  const flags = await getCachedFlags(); // 60s cache from DB
  const flag = flags[flagName];
  if (!flag || !flag.enabled) return false;
  return flag.plans.includes(userPlan);
}
```

**Admin API Routes:**

```typescript
// GET   /api/admin/features         — List all flags with current state
// PATCH /api/admin/features/:name   — Update a flag (enable/disable, change plans)

const UpdateFeatureFlagSchema = z.object({
  enabled: z.boolean().optional(),
  plans: z.array(z.enum(['free', 'pro', 'enterprise'])).optional(),
  description: z.string().max(200).optional(),
});
```

### 13.6 Admin Audit Log

All admin actions are logged for security and accountability.

```prisma
model AdminAuditLog {
  id        String   @id @default(cuid())
  adminId   String                           // Clerk userId of admin
  action    String                           // e.g., "user.plan.changed", "feature.toggled"
  targetId  String?                          // affected user/audit/flag ID
  details   Json                             // { before: ..., after: ... }
  ipAddress String?
  createdAt DateTime @default(now())

  @@index([adminId])
  @@index([action])
  @@index([createdAt])
}
```

**Logged actions:**
- `user.plan.changed` — plan tier update
- `user.auditLimit.changed` — audit limit override
- `user.disabled` — account disabled/enabled
- `feature.toggled` — feature flag changed
- `job.retried` — failed BullMQ job manually retried
- `admin.role.granted` / `admin.role.revoked` — admin role changes

**Admin UI:** Filterable, paginated log table on the admin dashboard.

### 13.7 Admin UI Pages

```
(admin)/
  layout.tsx                    # Admin layout with requireAdmin() guard
  admin/
    page.tsx                    # Overview dashboard (KPIs, quick stats)
    users/
      page.tsx                  # User list (search, filter, pagination)
      [id]/page.tsx             # User detail + actions
    monitoring/
      page.tsx                  # Queue health, active audits, error rates
    features/
      page.tsx                  # Feature flags toggle UI
    logs/
      page.tsx                  # Admin audit log viewer
```

---

## 14. Phase 1 (MVP) Scope

### In Scope

| Area | Details |
|------|---------|
| Auth | Clerk sign-up/sign-in, session management, webhook sync |
| Steps 1-7 | Full Usability pillar: crawl (+ AI bot audit), depth, page speed, INP, mobile, HTTPS (+ CSP/HSTS), a11y, DOM size check |
| Pipeline | BullMQ DAG: Phase A (crawl) → Phase B (usability steps, parallel) |
| Integrations | Playwright (crawl + browser-based steps), Google PSI API (Steps 3-4) |
| UI | Dashboard, audit wizard (domain + max pages), live progress, report (Usability tab) |
| Export | PDF (Playwright print-to-PDF), CSV, JSON |
| Security | Clerk middleware, Prisma RLS, Zod validation, rate limiting |
| Plan enforcement | `PLAN_TIERS` config with step/page/feature limits checked at API layer |
| Admin (basic) | User management (list, view, change plan), system monitoring (queue health, active audits), feature flags (toggle steps per plan) |

### Out of Scope (Future Phases)

| Phase | Features |
|-------|----------|
| 2 | Steps 8-14 (Relevance pillar), seed keywords in wizard, URA scoring |
| 3 | Step 12 (Content decay, Search Console integration), NLP keyword analysis |
| 4 | Steps 15-18 (Authority), Citation Gap (Gemini → Perplexity + others), backlink provider |
| 5 | Billing (Stripe), recurring audits, trend tracking, white-label, org/team support |
| Admin Phase 2 | Gradual rollout (rolloutPercent), plan DB migration (from config), Stripe billing admin panel, user impersonation for support |

---

## 15. Verification & Testing Strategy

### Unit Tests

- All Zod schemas (valid + invalid input coverage)
- URA score calculation (`src/services/audit/scoring.ts`)
- Service response parsing (PSI API response → typed result)
- Rate limit logic
- Plan enforcement logic (`PLAN_TIERS` limits)
- Feature flag check logic (`isFeatureEnabled`)

### Integration Tests

- API routes with mocked Prisma + mocked BullMQ
- Clerk webhook handler with mock Svix verification
- SSE endpoint with mock Redis pub/sub
- Admin routes: verify `requireAdmin()` rejects non-admin users (403)
- Admin routes: verify actions are logged to `AdminAuditLog`
- Plan enforcement: verify audit creation is rejected when exceeding plan limits

### E2E Tests

- Playwright test: sign up → create audit → verify progress → view report → export PDF
- Test against a known static site for predictable results

### Manual Verification

Run a full audit against a known test site (e.g., a staging site with intentional issues) and verify:
- Step 1: All pages discovered, correct HTTP status codes, AI bot permissions parsed from robots.txt
- Step 2: Crawl depth correctly calculated, pages > 3 flagged
- Step 3: Performance scores match Google PSI directly
- Step 4: INP values present, decomposition shown for >= 200ms pages
- Step 5: Mobile issues detected (if present)
- Step 6: HTTPS status correct, CSP + HSTS headers checked and flagged if missing
- Step 7: Accessibility violations match direct axe-core run
- DOM size: Pages with >= 1,400 nodes flagged as "Excessive DOM Size"
- Security: Confirm DATABASE_URL uses `seoaudits_app` user (not postgres superuser)

---

## 16. Claude Code Context Optimization

### Progressive Disclosure for LLM Context

To prevent instruction-following decay during implementation, documentation follows a modular structure:

**Rule: CLAUDE.md must stay under 300 lines.** It contains only high-level conventions, the workflow rule (Explore → Plan → Code), security invariants, and pointers to `@docs/`. Currently at 60 lines — ample room for project growth without bloating the system prompt.

**Modular specs in `@docs/`:** Complex implementation patterns are split into focused documents rather than one monolithic file. This ensures Claude Code's context window stays full of relevant, focused context for the current task.

| Document | Focus | When to Load |
|----------|-------|-------------|
| `docs/PRD.md` | Product requirements, user stories, 18-step definitions | Understanding what to build |
| `docs/SPEC.md` | Architecture, schema, pipeline, APIs, security | Understanding how to build |
| `docs/PIPELINE.md` | *(future)* BullMQ orchestrator deep dive, DAG implementation, worker patterns | Implementing Steps 1-7 pipeline |
| `docs/CITATION-GAP.md` | *(future)* Citation module API integration, query expansion, gap classification | Implementing Step 16 |
| `docs/DEPLOYMENT.md` | *(future)* Railway setup, env var provisioning, PostgreSQL user creation, Redis config | Deploying to production |

**Implementation rule:** When implementing a specific feature, reference only the relevant `@docs/` file in your prompt context — not all of them. For example, when building the BullMQ pipeline, load `docs/PIPELINE.md`, not the full PRD.

---

## 17. Key Dependencies (package.json additions)

```json
{
  "@clerk/nextjs": "^6.x",
  "prisma": "^6.x",
  "@prisma/client": "^6.x",
  "bullmq": "^5.x",
  "ioredis": "^5.x",
  "zod": "^3.x",
  "playwright": "^1.x",
  "@axe-core/playwright": "^4.x",
  "svix": "^1.x",
  "@tremor/react": "^3.x",
  "dompurify": "^3.x"
}
```

Dev dependencies: `@types/*`, `vitest` (unit tests), `@playwright/test` (E2E).
