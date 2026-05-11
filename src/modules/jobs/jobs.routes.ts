import { Router, Response, Request } from "express";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import { authenticate, optionalAuthenticate, AuthRequest } from "../../middleware/auth.js";
import { getJobsQuerySchema } from "./jobs.validation.js";
import * as jobsService from "./jobs.service.js";
import { syncJobs } from "./jobFetcher.service.js";
import { scoreAllJobs, getMatchedJobs } from "../ai/batchScoring.service.js";
import { getJobInsights } from "../ai/insights.service.js";
import { startPortalScan, getScanTask } from "../portals/scanner.service.js";
import { startScanSchema } from "../portals/portals.validation.js";
import { startDiscover, getDiscoverTask } from "./discover.service.js";
import { z } from "zod";

export const jobsRouter: Router = Router();

// GET /jobs — search/list jobs.
// Public, but personalized (match score, "easiest to get in" sort) when the
// caller is signed in.
jobsRouter.get(
    "/",
    optionalAuthenticate,
    validate(getJobsQuerySchema, "query"),
    async (req: AuthRequest, res: Response) => {
        const query = {
            ...(req.query as unknown as Parameters<typeof jobsService.getJobs>[0]),
            userId: req.user?.userId,
        };
        const result = await jobsService.getJobs(query);
        res.json({ success: true, data: result });
    }
);

// GET /jobs/sources — distinct sources currently populated, for the UI filter.
jobsRouter.get("/sources", async (_req: Request, res: Response) => {
    const sources = await jobsService.getActiveSources();
    res.json({ success: true, data: sources });
});

// POST /jobs/sync — fetch jobs from external APIs (authenticated)
jobsRouter.post("/sync", authenticate, async (_req: AuthRequest, res: Response) => {
    const result = await syncJobs();
    res.json({ success: true, data: result });
});

const discoverSchema = z.object({
    withPortals: z.boolean().default(true),
    force: z.boolean().default(false),
});

// POST /jobs/discover — full pipeline: feeds + portals + AI scoring
jobsRouter.post("/discover", authenticate, validate(discoverSchema), async (req: AuthRequest, res: Response) => {
    const { withPortals, force } = req.body as { withPortals: boolean; force: boolean };
    const task = startDiscover(req.user!.userId, { withPortals, force });
    res.status(202).json({ success: true, data: task });
});

// GET /jobs/discover/:taskId — poll discover progress
jobsRouter.get("/discover/:taskId", authenticate, async (req: AuthRequest, res: Response) => {
    const t = getDiscoverTask(req.params.taskId as string);
    if (!t) {
        res.status(404).json({
            success: false,
            error: { code: "DISCOVER_TASK_NOT_FOUND", message: "Discover task not found or expired" },
        });
        return;
    }
    res.json({ success: true, data: t });
});

// POST /jobs/sync/portals — scan configured ATS portals (authenticated)
jobsRouter.post(
    "/sync/portals",
    authenticate,
    validate(startScanSchema),
    async (req: AuthRequest, res: Response) => {
        const { portalIds, all } = req.body as { portalIds?: string[]; all: boolean };
        const task = await startPortalScan({
            userId: req.user!.userId,
            portalIds,
            all,
        });
        res.status(202).json({ success: true, data: task });
    }
);

// GET /jobs/sync/portals/:taskId — poll scan progress (authenticated)
jobsRouter.get(
    "/sync/portals/:taskId",
    authenticate,
    async (req: AuthRequest, res: Response) => {
        const task = getScanTask(req.params.taskId as string);
        if (!task) {
            res.status(404).json({
                success: false,
                error: { code: "PORTAL_SCAN_TASK_NOT_FOUND", message: "Scan task not found or expired" },
            });
            return;
        }
        res.json({ success: true, data: task });
    }
);

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

    const insights = await getJobInsights(req.user!.userId, jobId);

    if (!insights) {
        res.json({
            success: true,
            data: { note: "AI insights unavailable — configure an AI provider in Settings or set an *_API_KEY in .env", job },
        });
        return;
    }

    res.json({ success: true, data: { job, insights } });
});

// GET /jobs/:id — single job. Includes match score + acceptance score for the
// signed-in user when present.
jobsRouter.get("/:id", validateUUID("id"), optionalAuthenticate, async (req: AuthRequest, res: Response) => {
    const job = await jobsService.getJobById(req.params.id as string, req.user?.userId);

    if (!job) {
        res.status(404).json({
            success: false,
            error: { code: "JOB_NOT_FOUND", message: "Job not found" },
        });
        return;
    }

    res.json({ success: true, data: job });
});
