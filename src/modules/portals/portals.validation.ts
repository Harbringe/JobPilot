import { z } from "zod";

export const portalProviderEnum = z.enum([
    "ASHBY",
    "GREENHOUSE",
    "LEVER",
    "WORKABLE",
    "WELLFOUND",
    "CUSTOM",
]);

export const createPortalSchema = z.object({
    company: z.string().min(1).max(120),
    provider: portalProviderEnum,
    url: z.string().url().max(500),
    filterTags: z.array(z.string().min(1).max(40)).max(20).default([]),
    enabled: z.boolean().default(true),
});

export const updatePortalSchema = createPortalSchema.partial();

export const startScanSchema = z.object({
    portalIds: z.array(z.string().uuid()).max(100).optional(),
    all: z.boolean().default(false),
});

export type CreatePortalInput = z.infer<typeof createPortalSchema>;
export type UpdatePortalInput = z.infer<typeof updatePortalSchema>;
export type StartScanInput = z.infer<typeof startScanSchema>;
