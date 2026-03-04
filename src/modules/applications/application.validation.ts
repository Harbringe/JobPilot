import { z } from "zod";

export const createApplicationSchema = z.object({
    jobId: z.string().uuid("Invalid job ID"),
    notes: z.string().max(5000).optional(),
});

export const updateStatusSchema = z.object({
    status: z.enum([
        "SAVED",
        "APPLIED",
        "SCREENING",
        "INTERVIEW",
        "OFFER",
        "ACCEPTED",
        "DECLINED",
        "REJECTED",
    ]),
});

export const updateNotesSchema = z.object({
    notes: z.string().max(5000),
});

export const listApplicationsQuerySchema = z.object({
    status: z.enum([
        "SAVED",
        "APPLIED",
        "SCREENING",
        "INTERVIEW",
        "OFFER",
        "ACCEPTED",
        "DECLINED",
        "REJECTED",
    ]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
