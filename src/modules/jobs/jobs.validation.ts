import { z } from "zod";

export const getJobsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(200).optional(),
    location: z.string().max(200).optional(),
    remoteType: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
    salaryMin: z.coerce.number().int().min(0).optional(),
    salaryMax: z.coerce.number().int().min(0).optional(),
    /** Single source. Kept for backward compat. */
    source: z.string().max(50).optional(),
    /** Comma-separated list of sources (e.g. "remotive,linkedin,greenhouse"). */
    sources: z.string().max(500).optional(),
    /** Only return jobs posted within the last N days. */
    postedWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    /**
     * Sort modes:
     *   date     — newest postings first (default)
     *   salary   — highest salary first
     *   company  — alphabetical
     *   match    — best AI match for the signed-in user (requires auth)
     *   easy     — highest acceptance score (easiest to land) for the signed-in user (requires auth)
     */
    sort: z.enum(["date", "salary", "company", "match", "easy"]).optional().default("date"),
});
