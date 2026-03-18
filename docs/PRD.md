# Product Requirements Document: AI-Powered SEO/SXO Audit Web App

| Field          | Value                                                    |
|----------------|----------------------------------------------------------|
| Version        | 0.1.0                                                    |
| Status         | Draft                                                    |
| Last Updated   | 2026-02-11                                               |
| Stack          | Next.js 15 (App Router), TypeScript, Prisma, PostgreSQL  |
| Reference      | [CLAUDE.md](../CLAUDE.md)                                |

---

## 1. Executive Summary

An AI-powered web application for paying SEO professionals that performs a comprehensive **18-step SEO/SXO audit** organized around the **URA (Usability, Relevance, Authority) framework**. The platform combines traditional technical SEO auditing with three differentiating modules: **Interaction to Next Paint (INP) deep analysis**, **AI Citation Gap reverse-engineering** across Perplexity, ChatGPT, and Claude, and **automated content decay bucketing**. Architecture must support per-user audit limits under a SaaS subscription model.

---

## 2. URA Framework Overview

All audit capabilities are organized under three pillars:

| Pillar          | Focus                                         | Audit Steps |
|-----------------|-----------------------------------------------|-------------|
| **Usability**   | Performance, CWV, crawlability, accessibility | Steps 1–7   |
| **Relevance**   | Content quality, keywords, freshness, linking | Steps 8–14  |
| **Authority**   | Backlinks, AI citations, E-E-A-T, brand trust | Steps 15–18 |

- **Usability (U):** How easy, fast, and accessible the experience is — Core Web Vitals, INP, mobile-friendliness, crawlability, security.
- **Relevance (R):** How well content matches user intent — NLP entity optimization, content freshness, internal linking, semantic structure.
- **Authority (A):** How trustworthy and credible the site is perceived — backlink quality, AI platform citations, E-E-A-T signals, brand mentions.

---

## 3. Personas & User Stories

### 3.1 Primary Persona

**Alex — Senior SEO Consultant.** Manages 8–15 client websites. Needs repeatable, data-driven audits and client-facing reports. Pays for tooling that saves time and surfaces actionable issues. Pain points: manual auditing across disparate tools, inability to track AI platform citations, no unified URA scoring, difficulty prioritizing decaying content.

### 3.2 User Stories — Usability

| ID      | Story | Acceptance Criteria |
|---------|-------|---------------------|
| US-U01  | As a user, I want to identify Interaction to Next Paint (INP) bottlenecks so that I can recommend fixes that improve conversion. | INP value per page; pages >= 200ms flagged; slowest interaction type identified (click/keypress/tap); offending DOM selector reported; decomposition into input delay, processing time, presentation delay. |
| US-U02  | As a user, I want page speed scores for every crawled URL so that I can prioritize the worst performers. | Performance score 0–100 per URL; score < 80 flagged "Needs Improvement"; LCP, CLS, TTFB breakdowns included. |
| US-U03  | As a user, I want to see crawl depth for every URL so that I can find pages buried too deep in the site architecture. | Integer crawl depth per URL; depth > 3 flagged "Too Deep"; site-tree visualization generated. |
| US-U04  | As a user, I want mobile-friendliness assessments so that I can ensure client pages pass mobile usability standards. | Each URL classified Mobile-Friendly or Not; failures listed (viewport, tap targets, font size, content width). |
| US-U05  | As a user, I want accessibility issues surfaced per page so that I can address WCAG compliance gaps. | WCAG 2.1 AA violations by severity; accessibility score per page. |

### 3.3 User Stories — Relevance

| ID      | Story | Acceptance Criteria |
|---------|-------|---------------------|
| US-R01  | As a user, I want NLP-driven keyword optimization analysis so that I can align content with entities Google expects. | Entity extraction with salience scores; missing entity recommendations; comparison against top-10 SERP competitors. |
| US-R02  | As a user, I want to detect content decay across the site so that I can prioritize pages losing traffic for refresh. | Pages bucketed: "Declining" (traffic down > 20% over 90 days), "Stagnant" (no growth 180 days), "Healthy"; sorted by estimated traffic loss. |
| US-R03  | As a user, I want internal linking analysis so that I can find under-linked and orphan pages. | Inbound internal link count per URL; < 5 links flagged; orphan pages (0 links) highlighted separately. |
| US-R04  | As a user, I want title tag and meta description auditing so that I can fix on-page SEO gaps. | Missing/duplicate/wrong-length titles and descriptions flagged with character counts; H1 count validated. |
| US-R05  | As a user, I want content freshness signals so that I can identify stale pages needing updates. | Last-modified date, dateModified schema, content age; pages > 12 months with declining traffic flagged. |

### 3.4 User Stories — Authority

| ID      | Story | Acceptance Criteria |
|---------|-------|---------------------|
| US-A01  | As a user, I want citation gap analysis across Perplexity, ChatGPT, and Claude so that I can identify where competitors are cited but my client is not. | Per query-platform: cited domains listed; gaps where competitor cited and client not; recommended content actions. |
| US-A02  | As a user, I want backlink profile analysis so that I can assess domain authority and find toxic links. | Total backlinks, referring domains, DA score, toxic link identification, anchor text distribution. |
| US-A03  | As a user, I want E-E-A-T signal detection so that I can verify author credentials and trust signals. | Author byline, schema markup, about page, editorial policy, source citations — each checked per page; composite E-E-A-T score. |
| US-A04  | As a user, I want brand mention tracking so that I can find unlinked mentions for outreach. | Linked vs unlinked mentions; source DA; sentiment (positive/neutral/negative); outreach opportunity list. |

---

## 4. The 18-Step SEO Audit Engine

### USABILITY — Steps 1–7

#### Step 1: Crawlability & Indexability

- **Description:** Crawl target site to discover all URLs. Check robots.txt, XML sitemap validity, indexing directives (noindex, canonical, meta robots), and **AI bot permissions** (GPTBot, CCBot, Google-Extended, anthropic-ai, PerplexityBot).
- **Data Sources:** Site crawl (headless browser / HTTP client), robots.txt, sitemap.xml, page meta tags.
- **Flags:** Pages blocked by robots.txt that should be indexed | noindex pages receiving organic traffic | canonical mismatches | sitemap URLs returning non-200 | sitemap missing from robots.txt | **AI bots blocked when client wants AI platform citations → SERIOUS**.
- **Output:** URL, HTTP status, indexability status, canonical URL, robots directives, sitemap inclusion, AI bot permissions per bot.

#### Step 2: Crawl Depth Analysis

- **Description:** Calculate minimum click-depth from homepage to every URL. Identify pages buried too deep.
- **Data Sources:** Internal link graph from crawl.
- **Flags:** **Crawl depth > 3 → "Too Deep"** | Orphan pages (unreachable) → CRITICAL.
- **Output:** URL, crawl depth (integer), parent page path, shortest click path.

#### Step 3: Page Speed & Core Web Vitals

- **Description:** Measure performance via Lighthouse / CrUX API. Report LCP, INP, CLS, TTFB, overall score.
- **Data Sources:** Google PageSpeed Insights API, Chrome UX Report API.
- **Flags:** **Performance score < 80 → "Needs Improvement"** | Score < 50 → "Poor" | LCP > 2.5s | CLS > 0.1 | TTFB > 800ms.
- **Output:** URL, performance score (0–100), LCP, INP, CLS, TTFB, FCP.

#### Step 4: Interaction to Next Paint (INP) Deep Dive

- **Description:** Dedicated INP analysis beyond Step 3 summary. Identify specific interactions causing delay.
- **Data Sources:** CrUX API (field), Puppeteer tracing (lab), PerformanceObserver `event` entries.
- **Flags:** **INP >= 200ms → "Needs Improvement"** | **INP >= 500ms → "Poor"**.
- **Output:** URL, INP (ms), worst interaction type, target DOM selector, input delay (ms), processing time (ms), presentation delay (ms), recommended fix.
- **Full spec:** See [Section 7](#7-interaction-to-next-paint-inp-specification).

#### Step 5: Mobile-Friendliness

- **Description:** Evaluate viewport config, tap target sizing, font readability, content-width fit.
- **Data Sources:** Lighthouse mobile audit, viewport meta tag, CSS analysis.
- **Flags:** No viewport meta → CRITICAL | Tap targets < 48×48 CSS px | Body font < 16px | Horizontal scroll required.
- **Output:** URL, mobile-friendly (boolean), failure reasons, tap target violation count.

#### Step 6: HTTPS & Security

- **Description:** Verify SSL/TLS, mixed content, security headers (including **CSP and HSTS**), redirect chains.
- **Data Sources:** SSL certificate inspection, HTTP header analysis, resource audit.
- **Flags:** No HTTPS → CRITICAL | Mixed content | **Missing Content-Security-Policy → MODERATE** | **Missing HSTS (or max-age < 1 year) → SERIOUS** | Missing X-Content-Type-Options | Cert expiry < 30 days.
- **Output:** URL, HTTPS status, mixed content list, security headers (CSP, HSTS, X-Content-Type-Options, Permissions-Policy), cert expiry, redirect chain.

#### Step 7: Accessibility

- **Description:** Automated WCAG 2.1 AA checks via **axe-core** (`@axe-core/playwright`).
- **Data Sources:** axe-core against rendered DOM.
- **Flags:** Critical WCAG violations → CRITICAL | Serious violations → FLAG | > 10 violations per page.
- **Output:** URL, total violations, violations by severity, rule violations with selectors, accessibility score.

#### Usability Cross-Step: Excessive DOM Size

- **Description:** Measure DOM node count per page. Excessive DOM complexity degrades crawler rendering budget and browser INP.
- **Threshold:** **DOM nodes >= 1,400 → FLAG as MODERATE "Excessive DOM Size"**.
- **Output:** URL, DOM node count, flag status.

---

### RELEVANCE — Steps 8–14

#### Step 8: Title Tag & Meta Description

- **Description:** Check presence, length, duplication, keyword inclusion.
- **Flags:** Missing title → CRITICAL | Title < 30 or > 60 chars | Missing meta description | Description < 70 or > 160 chars | Duplicates across URLs.
- **Output:** URL, title text, title length, description text, description length, duplicate group ID.

#### Step 9: Heading Structure & Semantic HTML

- **Description:** Validate heading hierarchy (H1–H6), semantic element usage, and **H1 visual prominence** (must be the largest heading by computed font size — per Google algorithm insights).
- **Flags:** Missing H1 → CRITICAL | Multiple H1s | Hierarchy skip (H1→H3) | No semantic elements (article, section, nav, main) | **H1 not visually largest heading → MODERATE "H1 Not Visually Prominent"**.
- **Output:** URL, H1 text, H1 count, H1 font size (px), H1 is largest heading (boolean), heading tree, semantic elements present, hierarchy violations.

#### Step 10: NLP Keyword & Entity Optimization

- **Description:** Extract entities and topics via NLP. Compare against SERP competitors for optimization gaps.
- **Data Sources:** Page content, NLP API (Google or equivalent), SERP data for target keyword.
- **Flags:** Target keyword not in title → FLAG | Not in H1 → FLAG | **Entity salience < 0.3 → "Weak Topical Signal"** | Missing entities in >= 70% of top-10 competitors → "Entity Gap" | Word count < 300 → "Thin Content".
- **Output:** URL, target keyword, entities with salience, competitor comparison, missing entities, word count, TF-IDF scores.

#### Step 11: Internal Linking

- **Description:** Map internal link graph. Find under-linked pages and broken internal links.
- **Flags:** **Inbound internal links < 5 → "Under-Linked"** | 0 inbound → "Orphan Page" CRITICAL | Broken internal links (404) → CRITICAL | Redirect chains in internal links.
- **Output:** URL, inbound count, outbound count, anchor texts, orphan status, broken targets.

#### Step 12: Content Freshness & Decay Detection

- **Description:** Analyze content age and traffic trends to bucket decaying content.
- **Data Sources:** Last-modified headers, schema dates, Search Console API, Analytics.
- **Flags:** **Traffic down > 20% over 90 days → "Declining"** | No growth 180 days → "Stagnant" | Age > 12 months + declining → "Decay Candidate" CRITICAL | No dateModified schema.
- **Output:** URL, last modified, content age, 90-day traffic trend, 180-day trend, decay bucket, estimated monthly traffic loss.

#### Step 13: Structured Data & Schema Markup

- **Description:** Validate JSON-LD / Microdata / RDFa. Check required properties, rich result eligibility, and **`sameAs` attribute** for Knowledge Graph entity linking (Wikidata/Wikipedia).
- **Flags:** No structured data | Invalid markup (missing required fields) → CRITICAL | Data not matching visible content | **Organization/Person JSON-LD missing `sameAs` → MODERATE**.
- **Output:** URL, schema types, validation status, missing properties, eligible rich results, sameAs URLs present.

#### Step 14: Image Optimization

- **Description:** Check alt text, file size, format (WebP/AVIF), responsive sizing, lazy loading.
- **Flags:** Missing alt text | Image > 200KB without next-gen format | No width/height (CLS risk) | No lazy loading below fold.
- **Output:** URL, image URL, alt status, file size, format, dimensions, lazy loading, srcset present.

---

### AUTHORITY — Steps 15–18

#### Step 15: Backlink Profile Analysis

- **Description:** Analyze backlink quality, diversity, and toxicity.
- **Data Sources:** Backlink API (Ahrefs/Moz/Majestic, proxied through backend).
- **Flags:** Referring domains < 20 → "Low Authority" | Toxic ratio > 5% | Single anchor > 30% → over-optimization | Nofollow > 80%.
- **Output:** Total backlinks, referring domains, DA/DR, toxic links, anchor distribution, follow/nofollow ratio, 30-day trend.

#### Step 16: AI Citation Gap Analysis

- **Description:** Reverse-engineer citations from Perplexity, ChatGPT, and Claude to find visibility gaps.
- **Data Sources:** AI platform APIs (all proxied through backend).
- **Flags:** Competitor cited but client not → "Citation Gap" | Client cited in < 20% of queries → "Low AI Visibility" | Client never cited → CRITICAL.
- **Output:** Query, platform, cited domains, client cited (boolean), competitor citations, gap type, recommended action.
- **Full spec:** See [Section 6](#6-ai-citation-gap-module).

#### Step 17: E-E-A-T Signal Detection

- **Description:** Evaluate Experience, Expertise, Authoritativeness, Trustworthiness signals. **Specifically track author entities** via bylines linked to dedicated author biography pages (Google tracks creator entities via `isAuthor`).
- **Data Sources:** HTML parsing for author bios, schema Person/Organization, about pages, editorial policies.
- **Flags:** **No author byline → SERIOUS "Missing Author Attribution"** | **Author byline without link to bio page → MODERATE** | **Author bio page missing Person schema → MODERATE** | No about page | No editorial policy | No source citations.
- **Output:** URL, author name, author byline present (boolean), author bio page linked (boolean), schema present, bio present, credentials, about page linked, policy linked, citations count, E-E-A-T score (0–100).

#### Step 18: Brand Mention Tracking

- **Description:** Track linked vs unlinked brand mentions. Classify sentiment.
- **Data Sources:** Brand mention API / web scraping (proxied through backend), sentiment NLP.
- **Flags:** Unlinked mention from DA > 50 → "Link Opportunity" | Negative sentiment > 10% → "Reputation Risk" | Zero mentions in 30 days → "Low Visibility".
- **Output:** Source URL, source DA, linked (boolean), anchor text, sentiment, date, outreach status.

---

## 5. URA Composite Scoring

Each pillar scores **0–100** via weighted step results:

**Usability:** Page Speed (25%) + INP (20%) + Crawlability (15%) + Mobile (15%) + Crawl Depth (10%) + Security (10%) + Accessibility (5%).

**Relevance:** NLP Optimization (25%) + Content Freshness (20%) + Internal Linking (15%) + Title/Meta (15%) + Headings (10%) + Structured Data (10%) + Images (5%).

**Authority:** Backlinks (30%) + AI Citations (30%) + E-E-A-T (25%) + Brand Mentions (15%).

**Overall URA Score** = U (35%) + R (35%) + A (30%).

| Score   | Grade              |
|---------|--------------------|
| 90–100  | Excellent          |
| 70–89   | Good               |
| 50–69   | Needs Improvement  |
| 0–49    | Poor               |

All scores stored per audit run with timestamps for trend tracking.

---

## 6. AI Citation Gap Module

### 6.1 Query Generation

- **Input:** Client domain, industry vertical, seed keywords (5–50), competitor domains (1–10).
- **Process:** Expand seeds into 50–200 natural-language queries (informational, comparative, "best of") using LLM-assisted expansion.

### 6.2 Per-Platform Data Capture

**Perplexity:** Submit queries via API. Capture full response, inline citation URLs, citation position (ordinal), source title, anchor context.

**ChatGPT:** Submit queries via OpenAI API (browsing enabled where available). Capture response text, cited URLs, citation context.

**Claude:** Submit queries via Anthropic API. Capture response text, referenced domains/brands (may not provide URLs but references by name), context of reference.

**Common fields (all platforms):** Query text, platform, timestamp, cited domains[], client cited (boolean), competitor domains cited[], citation context, citation position.

### 6.3 Gap Classification

| Classification       | Definition                                          |
|----------------------|-----------------------------------------------------|
| **Client Cited**     | Client domain appears in the response               |
| **Competitor Only**  | Competitor(s) appear, client does not — **this is a Citation Gap** |
| **Neither Cited**    | Neither client nor competitors appear (lower priority) |
| **Client Exclusive** | Client appears, no competitors (strength signal)    |

### 6.4 Aggregate Metrics

- Citation rate per platform (% of queries where client is cited).
- Competitor citation rate per platform.
- Gap ratio: (competitor citations − client citations) / total queries.
- Topic clusters where gaps concentrate.

### 6.5 Output Report

- **Summary dashboard:** Citation rate by platform (client vs each competitor) — bar chart.
- **Gap table:** Each query where competitor cited but client not, with query, platform, competitor(s), context, recommended action.
- **Opportunity ranking:** Gaps prioritized by (a) estimated query volume, (b) number of competitors cited, (c) cross-platform gap presence.
- **Content recommendations:** For high-priority gaps — content to create/update, target entities, source data to cite.
- **Export:** CSV, PDF, JSON.

### 6.6 Scheduling

- One-time audit run.
- Recurring weekly/monthly (paid tier).
- Delta reporting: new gaps and closed gaps since last run.

---

## 7. Interaction to Next Paint (INP) Specification

### 7.1 Thresholds

| Rating             | INP Value    |
|--------------------|--------------|
| Good               | < 200ms      |
| Needs Improvement  | 200–500ms    |
| Poor               | >= 500ms     |

### 7.2 Measurement

**Field data (primary):** CrUX API — p75 INP at origin and URL level.

**Lab data (supplementary):** Puppeteer-driven synthetic interactions — click primary CTA, click nav menu, keyboard tab + enter, scroll-triggered interactions. Capture PerformanceObserver `event` entries.

### 7.3 Decomposition

For each flagged interaction, decompose into three phases:

1. **Input Delay** — Time from interaction to event handler start. Cause: main thread busy with long tasks.
2. **Processing Time** — Time executing event handlers. Cause: expensive JS in handlers.
3. **Presentation Delay** — Time from handler completion to next paint. Cause: large DOM, layout thrashing, expensive rendering.

Report which phase is the primary bottleneck.

### 7.4 Recommendations Engine

| Bottleneck Phase    | Recommendations |
|---------------------|-----------------|
| High Input Delay    | Break up long tasks; defer non-critical JS; use `scheduler.yield()`. |
| High Processing Time| Optimize handler at [selector]; debounce rapid interactions; move work to Web Worker. |
| High Presentation Delay | Reduce DOM size (report current count); avoid forced sync layouts; use `content-visibility: auto`. |

Each recommendation includes severity, estimated impact, implementation difficulty, and code-level pointer (DOM selector or script URL).

### 7.5 Report Output

- Per-URL INP card: value, rating, trend vs previous audit.
- Interaction inventory: table of measured interactions with latency and decomposition.
- Worst offender highlight: worst interaction with full decomposition and fix.
- Site-wide INP distribution: histogram across all audited URLs.

---

## 8. Security Constraints

### 8.1 Input Validation

All API route inputs validated with **strict Zod schemas** before processing. Schemas defined in `src/lib/validators/`. No raw `req.body` or `req.query` without Zod parsing. *(Per CLAUDE.md)*

### 8.2 Database Security

All queries via **Prisma ORM** with parameterized queries. No raw SQL unless using `Prisma.$queryRaw` with tagged template literals (auto-parameterized). Never concatenate user input into query strings. *(Per CLAUDE.md)*

### 8.3 API Key Protection

**All external API calls must be proxied through the backend.** No API keys, tokens, or secrets exposed to the browser.

```
Browser → Next.js API Route (server) → External API
```

Keys stored in environment variables (`.env.local`, never committed). Rate limiting at the API route layer.

### 8.4 Output Sanitization

All user-facing output sanitized for XSS. React JSX escaping for standard rendering. **Any use of `dangerouslySetInnerHTML` is prohibited without DOMPurify sanitization** — this specifically covers rendering crawled page titles/descriptions and AI-generated citation contexts. *(Per CLAUDE.md)*

### 8.5 Authentication & Authorization

- All audit endpoints require authenticated sessions.
- Audit results scoped to owning user/organization — no cross-tenant data access.
- Roles: Admin, Member, Viewer.

### 8.6 Database Least Privilege

PostgreSQL connection **must** use a dedicated application user with restricted permissions (SELECT, INSERT, UPDATE, DELETE only). No CREATE, DROP, ALTER, or TRUNCATE permissions. Prevents `DROP DATABASE` exploits from AI-generated code errors. *(See SPEC.md Section 9 for SQL setup.)*

### 8.7 Data Handling

- Crawled data and AI responses encrypted at rest.
- PII (email, name) encrypted at rest in PostgreSQL.
- Retention: configurable per account, default 12 months.

---

## 9. Data Model (High-Level)

| Model             | Key Fields |
|-------------------|------------|
| **User**          | id, email, name, role, organizationId |
| **Organization**  | id, name, plan, auditLimit |
| **AuditRun**      | id, organizationId, targetDomain, status, uraScores (U/R/A/overall) |
| **AuditPage**     | id, auditRunId, url, httpStatus, crawlDepth, performanceScore, inpValue, mobileFriendly, accessibilityScore, internalLinksInbound, contentAge, decayBucket, eeatScore |
| **AuditIssue**    | id, auditPageId, stepNumber, severity, category, message, selector, recommendation |
| **CitationQuery** | id, auditRunId, queryText, expandedFrom |
| **CitationResult**| id, citationQueryId, platform, responseText, citedDomains, clientCited, competitorsCited, citationContext |
| **CitationGap**   | id, citationResultId, competitorDomain, gapType, priority, recommendedAction |

---

## 10. API Routes

| Method | Route                              | Purpose                        |
|--------|-------------------------------------|--------------------------------|
| POST   | `/api/audits`                      | Create audit run               |
| GET    | `/api/audits/:id`                  | Audit status + summary scores  |
| GET    | `/api/audits/:id/pages`            | List audited pages             |
| GET    | `/api/audits/:id/pages/:pageId`    | Detailed page results          |
| GET    | `/api/audits/:id/issues`           | All issues (filter by step/severity/pillar) |
| POST   | `/api/audits/:id/citations`        | Trigger citation gap analysis  |
| GET    | `/api/audits/:id/citations/gaps`   | Citation gap results           |
| GET    | `/api/audits/:id/export/:format`   | Export (csv, pdf, json)        |

All routes: auth required, Zod-validated inputs, external calls proxied.

---

## 11. Non-Functional Requirements

- **Performance:** 500-page audit completes within 15 minutes. Real-time progress via SSE.
- **Scalability:** Audit jobs queued via background workers. Concurrent audits per org.
- **Reliability:** Failed steps retry up to 3×. Partial results preserved on permanent failure.
- **Observability:** Structured logging. Error tracking (Sentry). Step-level timing metrics.
- **Browser Support:** Latest 2 versions of Chrome, Firefox, Safari, Edge.
- **Accessibility:** The app itself meets WCAG 2.1 AA.

---

## 12. Technical Architecture

- **Rendering:** Next.js App Router, server components by default.
- **API:** Server Actions and Route Handlers.
- **Database:** Prisma + PostgreSQL.
- **Background Jobs:** BullMQ + Redis (or Inngest for serverless).
- **Crawl Engine:** Puppeteer/Playwright for JS-rendered pages; HTTP client for static.
- **External APIs (all proxied):** PageSpeed Insights, CrUX, Search Console, NLP, Ahrefs/Moz, OpenAI, Anthropic, Perplexity, brand mention service.

---

## 13. Milestones

| Phase | Scope | Steps |
|-------|-------|-------|
| 1 — MVP | Core Usability + dashboard + PDF export | 1–5 |
| 2 | Remaining Usability + core Relevance + URA scoring | 6–11 |
| 3 | Remaining Relevance + content decay + NLP | 12–14 |
| 4 | Full Authority + AI Citation Gap + brand mentions | 15–18 |
| 5 | Recurring audits, trend tracking, orgs, white-label | — |

---

## 14. Open Questions & Risks

- **Risk:** AI citation scraping may violate platform ToS. *Mitigation:* Use official APIs; document compliance.
- **Risk:** CrUX data unavailable for low-traffic URLs. *Mitigation:* Fall back to lab data with clear labeling.
- **Risk:** SERP data costs for NLP comparison. *Mitigation:* Evaluate DataForSEO, SerpAPI pricing.
- **Open:** Self-hosted crawl engine vs third-party service?
- **Open:** Pricing tiers and per-audit limits — separate business doc.
- **Open:** White-label / agency mode — deferred to Phase 5.

---

## 15. Glossary

| Term            | Definition |
|-----------------|------------|
| **URA**         | Usability, Relevance, Authority — the audit framework |
| **INP**         | Interaction to Next Paint — Core Web Vital for responsiveness |
| **CrUX**        | Chrome User Experience Report — field data from real users |
| **E-E-A-T**     | Experience, Expertise, Authoritativeness, Trustworthiness |
| **NLP**         | Natural Language Processing — entity extraction and semantic analysis |
| **Citation Gap** | A query where a competitor is cited by an AI platform but the client is not |
| **Content Decay** | Progressive decline in organic traffic to a page over time |
| **Crawl Depth** | Minimum clicks from homepage to reach a URL |
