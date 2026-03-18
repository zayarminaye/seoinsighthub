import { z } from 'zod';

export const CreateAuditSchema = z.object({
  domain: z
    .string()
    .url('Must be a valid URL')
    .refine((url) => !url.includes('localhost'), 'Cannot audit localhost'),
  seedKeywords: z.array(z.string().max(100)).max(50).optional().default([]),
  competitorDomains: z.array(z.string().url()).max(10).optional().default([]),
  selectedSteps: z
    .array(z.number().int().min(1).max(18))
    .optional()
    .default([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
  maxPages: z.number().int().min(1).max(1000).optional().default(500),
});

export const ListAuditsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  status: z
    .enum(['QUEUED', 'CRAWLING', 'RUNNING', 'COMPLETED', 'FAILED'])
    .optional(),
});

export const ListPagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  stepNumber: z.coerce.number().int().min(1).max(18).optional(),
  decayBucket: z
    .enum(['HEALTHY', 'STAGNANT', 'DECLINING', 'DECAY_CANDIDATE'])
    .optional(),
  sortBy: z
    .enum([
      'performanceScore',
      'inpValue',
      'crawlDepth',
      'internalLinksInbound',
    ])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const ListIssuesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  severity: z.enum(['CRITICAL', 'SERIOUS', 'MODERATE', 'MINOR']).optional(),
  stepNumber: z.coerce.number().int().min(1).max(18).optional(),
  pillar: z.enum(['usability', 'relevance', 'authority']).optional(),
});

export const ExportFormatSchema = z.object({
  format: z.enum([
    'pages-csv',
    'issues-csv',
    'ai-citations-csv',
    'ai-citations-history-csv',
    'pdf',
    'json',
  ]),
});

export type CreateAuditInput = z.infer<typeof CreateAuditSchema>;
export type ListAuditsInput = z.infer<typeof ListAuditsSchema>;
export type ListPagesInput = z.infer<typeof ListPagesSchema>;
export type ListIssuesInput = z.infer<typeof ListIssuesSchema>;
