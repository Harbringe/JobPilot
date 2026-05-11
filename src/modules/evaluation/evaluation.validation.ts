import { z } from "zod";
import { BLOCK_NAMES } from "./evaluation.types.js";

export const generateEvaluationSchema = z.object({
    applicationId: z.string().uuid().optional(),
    regenerate: z.boolean().default(false),
});

export const listEvaluationsQuerySchema = z.object({
    applicationId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const blockNameSchema = z.enum(BLOCK_NAMES);

export const updateBlockSchema = z.object({
    content: z.unknown(),
});

export type GenerateEvaluationInput = z.infer<typeof generateEvaluationSchema>;
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;
