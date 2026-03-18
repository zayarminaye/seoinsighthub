import { z } from 'zod';

export const TriggerCitationsSchema = z.object({
  seedKeywords: z.array(z.string().max(100)).min(5).max(50),
  competitorDomains: z.array(z.string().url()).min(1).max(10),
  queriesPerKeyword: z.number().int().min(1).max(10).optional().default(4),
});

export type TriggerCitationsInput = z.infer<typeof TriggerCitationsSchema>;
