export const QUEUE_NAMES = {
  orchestrator: 'audit-orchestrator',
  crawl: 'audit-crawl',
  usability: 'audit-usability',
  relevance: 'audit-relevance',
  authority: 'audit-authority',
  citations: 'audit-citations',
} as const;

export const WORKER_CONFIG = {
  playwright: {
    maxConcurrentPages: 5,
    pageTimeoutMs: 30_000,
    navigationTimeoutMs: 15_000,
  },
  orchestrator: {
    auditTimeoutMs: 15 * 60_000, // 15 minutes
  },
  retry: {
    maxAttempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1_000, // 1s, 4s, 16s
    },
  },
} as const;

// Step number → URA pillar mapping
export const STEP_PILLAR: Record<number, 'usability' | 'relevance' | 'authority'> = {
  1: 'usability',
  2: 'usability',
  3: 'usability',
  4: 'usability',
  5: 'usability',
  6: 'usability',
  7: 'usability',
  8: 'relevance',
  9: 'relevance',
  10: 'relevance',
  11: 'relevance',
  12: 'relevance',
  13: 'relevance',
  14: 'relevance',
  15: 'authority',
  16: 'authority',
  17: 'authority',
  18: 'authority',
};

export const STEP_NAMES: Record<number, string> = {
  1: 'Crawlability & Indexability',
  2: 'Crawl Depth Analysis',
  3: 'Page Speed & Core Web Vitals',
  4: 'INP Deep Dive',
  5: 'Mobile-Friendliness',
  6: 'HTTPS & Security',
  7: 'Accessibility',
  8: 'Title Tag & Meta Description',
  9: 'Heading Structure & Semantic HTML',
  10: 'NLP Keyword & Entity Optimization',
  11: 'Internal Linking',
  12: 'Content Freshness & Decay Detection',
  13: 'Structured Data & Schema Markup',
  14: 'Image Optimization',
  15: 'Backlink Profile Analysis',
  16: 'AI Citation Gap Analysis',
  17: 'E-E-A-T Signal Detection',
  18: 'Brand Mention Tracking',
};
