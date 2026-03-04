import { Router, Response, Request } from "express";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { getJobsQuerySchema } from "./jobs.validation.js";
import * as jobsService from "./jobs.service.js";
import { syncJobs } from "./jobFetcher.service.js";
import { scoreJob } from "../ai/matching.service.js";
import { prisma } from "../../db/index.js";

export const jobsRouter: Router = Router();

// GET /jobs — public route to search jobs
jobsRouter.get("/", validate(getJobsQuerySchema, "query"), async (req: Request, res: Response) => {
    const result = await jobsService.getJobs(req.query as unknown as Parameters<typeof jobsService.getJobs>[0]);
    res.json({ success: true, data: result });
});

// POST /jobs/sync — fetch jobs from external APIs (authenticated)
jobsRouter.post("/sync", authenticate, async (_req: AuthRequest, res: Response) => {
    const result = await syncJobs();
    res.json({ success: true, data: result });
});

// GET /jobs/matched — get jobs scored against user profile (authenticated)
jobsRouter.get("/matched", authenticate, async (req: AuthRequest, res: Response) => {
    // Get user's profile
    const profile = await prisma.profile.findUnique({
        where: { userId: req.user!.userId },
        include: {
            experiences: true,
            educations: true,
            skills: true,
        },
    });

    if (!profile) {
        res.status(400).json({
            success: false,
            error: { code: "PROFILE_REQUIRED", message: "Create a profile first to get matched jobs" },
        });
        return;
    }

    // Get query params for pagination
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 10, 20); // Max 20 per batch (LLM is slow)

    // Get recent jobs
    const jobs = await prisma.job.findMany({
        where: { isActive: true },
        orderBy: { postedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
    });

    // Score each job against profile
    const scoredJobs = [];
    for (const job of jobs) {
        const scores = await scoreJob(
            {
                fullName: profile.fullName,
                headline: profile.headline,
                summary: profile.summary,
                location: profile.location,
                skills: profile.skills.map((s) => ({ name: s.name, level: s.level })),
                experiences: profile.experiences.map((e) => ({
                    title: e.title,
                    company: e.company,
                    current: e.current,
                    startDate: e.startDate.toISOString(),
                    endDate: e.endDate?.toISOString() || null,
                })),
                educations: profile.educations.map((e) => ({
                    institution: e.institution,
                    degree: e.degree,
                    field: e.field,
                })),
                preferences: profile.preferences,
            },
            {
                title: job.title,
                company: job.company,
                location: job.location,
                remoteType: job.remoteType,
                salaryMin: job.salaryMin,
                salaryMax: job.salaryMax,
                description: job.description,
                requirements: job.requirements,
            }
        );

        scoredJobs.push({
            ...job,
            scoring: scores || { matchScore: null, note: "AI scoring unavailable — set GROK_API_KEY" },
        });
    }

    // Sort by matchScore descending
    scoredJobs.sort((a, b) => {
        const aScore = (a.scoring as any)?.matchScore ?? 0;
        const bScore = (b.scoring as any)?.matchScore ?? 0;
        return bScore - aScore;
    });

    res.json({ success: true, data: { items: scoredJobs, page, limit } });
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
