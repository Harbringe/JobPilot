import { z } from "zod";

export const getJobsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(200).optional(),
    location: z.string().max(200).optional(),
    remoteType: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
    salaryMin: z.coerce.number().int().min(0).optional(),
    source: z.string().max(50).optional(),
    sort: z.enum(["date", "salary", "company"]).optional().default("date"),
});
