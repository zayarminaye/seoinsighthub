import { z } from 'zod';

export const UpdateUserAdminSchema = z.object({
  userId: z.string().min(1),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
  auditLimit: z.coerce.number().int().min(0).max(5000).optional(),
  disabled: z.boolean().optional(),
  role: z.enum(['user', 'admin']).optional(),
}).refine((data) => {
  return (
    data.plan !== undefined ||
    data.auditLimit !== undefined ||
    data.disabled !== undefined ||
    data.role !== undefined
  );
}, {
  message: 'At least one field must be provided.',
});

export const ListUsersAdminSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().max(100).optional(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
});

export const UpdateFeatureFlagSchema = z.object({
  enabled: z.boolean().optional(),
  plans: z
    .array(z.enum(['free', 'starter', 'pro', 'enterprise']))
    .optional(),
  description: z.string().max(200).optional(),
});

export const UpdateGeminiApiKeySchema = z.object({
  apiKey: z.string().trim().max(500).nullable(),
});

export const UpdateAiBudgetSchema = z.object({
  maxQueries: z.coerce.number().int().min(1).max(100),
});
