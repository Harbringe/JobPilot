import { Router, Response, Request } from "express";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { getJobsQuerySchema } from "./jobs.validation.js";
import * as jobsService from "./jobs.service.js";
import { syncJobs } from "./jobFetcher.service.js";
import { scoreAllJobs, getMatchedJobs } from "../ai/batchScoring.service.js";
import { getJobInsights } from "../ai/insights.service.js";

export const jobsRouter: Router = Router();

// GET /jobs — public route to search/list jobs
jobsRouter.get("/", validate(getJobsQuerySchema, "query"), async (req: Request, res: Response) => {
    const result = await jobsService.getJobs(req.query as unknown as Parameters<typeof jobsService.getJobs>[0]);
    res.json({ success: true, data: result });
});

// POST /jobs/sync — fetch jobs from external APIs (authenticated)
jobsRouter.post("/sync", authenticate, async (_req: AuthRequest, res: Response) => {
    const result = await syncJobs();
    res.json({ success: true, data: result });
});

// POST /jobs/score-all — batch score ALL jobs against user profile (authenticated)
jobsRouter.post("/score-all", authenticate, async (req: AuthRequest, res: Response) => {
    const force = req.query.force === "true";
    const result = await scoreAllJobs(req.user!.userId, force);
    res.json({ success: true, data: result });
});

// GET /jobs/matched — get pre-scored jobs sorted by score + salary (authenticated)
jobsRouter.get("/matched", authenticate, async (req: AuthRequest, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const minScore = Number(req.query.minScore) || 0;

    const result = await getMatchedJobs(req.user!.userId, { page, limit, minScore });
    res.json({ success: true, data: result });
});

// GET /jobs/:id/insights — AI-generated job analysis (authenticated)
jobsRouter.get("/:id/insights", validateUUID("id"), authenticate, async (req: AuthRequest, res: Response) => {
    const jobId = req.params.id as string;

    // Verify job exists
    const job = await jobsService.getJobById(jobId);
    if (!job) {
        res.status(404).json({
            success: false,
            error: { code: "JOB_NOT_FOUND", message: "Job not found" },
        });
        return;
    }

    const insights = await getJobInsights(jobId);

    if (!insights) {
        res.json({
            success: true,
            data: { note: "AI insights unavailable — set GROK_API_KEY in .env", job },
        });
        return;
    }

    res.json({ success: true, data: { job, insights } });
});

// GET /jobs/:id — public route to get a single job
jobsRouter.get("/:id", validateUUID("id"), async (req: Request, res: Response) => {
    const job = await jobsService.getJobById(req.params.id as string);

    if (!job) {
        res.status(404).json({
            success: false,
            error: { code: "JOB_NOT_FOUND", message: "Job not found" },
        });
        return;
    }

    res.json({ success: true, data: job });
});
