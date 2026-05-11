import { Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import { prisma } from "../../db/index.js";
import { scoreJob } from "../ai/matching.service.js";
import {
    createApplicationSchema,
    updateStatusSchema,
    updateNotesSchema,
    listApplicationsQuerySchema,
} from "./application.validation.js";
import type { Response } from "express";

export const applicationRouter: Router = Router();
applicationRouter.use(authenticate);

// GET /applications — list all user applications
applicationRouter.get("/", validate(listApplicationsQuerySchema, "query"), async (req: AuthRequest, res: Response) => {
    const query = req.query as unknown as { status?: string; page: number; limit: number };
    const { status, page, limit } = query;

    const where: any = { userId: req.user!.userId };
    if (status) where.status = status;

    const pageNum = Number(page);
    const limitNum = Number(limit);

    const [items, total] = await Promise.all([
        prisma.application.findMany({
            where,
            include: { job: true, resumes: true },
            orderBy: { appliedAt: "desc" },
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
        }),
        prisma.application.count({ where }),
    ]);

    res.json({
        success: true,
        data: {
            items,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
        },
    });
});

// POST /applications — create application (auto-scores with AI)
applicationRouter.post("/", validate(createApplicationSchema), async (req: AuthRequest, res: Response) => {
    const { jobId, notes } = req.body;

    const existing = await prisma.application.findUnique({
        where: { userId_jobId: { userId: req.user!.userId, jobId } },
    });

    if (existing) {
        res.status(409).json({
            success: false,
            error: { code: "ALREADY_APPLIED", message: "Already applied to this job" },
        });
        return;
    }

    const application = await prisma.application.create({
        data: {
            userId: req.user!.userId,
            jobId,
            notes,
        },
        include: { job: true },
    });

    // Auto-score in background (don't block response)
    scoreApplicationAsync(req.user!.userId, application.id, application.job).catch((err) =>
        console.warn("⚠️ Background scoring failed:", (err as Error).message)
    );

    res.status(201).json({ success: true, data: application });
});

// PATCH /applications/:id/status — update application status
applicationRouter.patch("/:id/status", validateUUID("id"), validate(updateStatusSchema), async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { status } = req.body;

    const application = await prisma.application.findFirst({
        where: { id, userId: req.user!.userId },
    });

    if (!application) {
        res.status(404).json({
            success: false,
            error: { code: "NOT_FOUND", message: "Application not found" },
        });
        return;
    }

    const updated = await prisma.application.update({
        where: { id },
        data: { status },
        include: { job: true },
    });

    res.json({ success: true, data: updated });
});

// PUT /applications/:id/notes — update notes
applicationRouter.put("/:id/notes", validateUUID("id"), validate(updateNotesSchema), async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { notes } = req.body;

    // Verify the user owns this application (IDOR fix)
    const application = await prisma.application.findFirst({
        where: { id, userId: req.user!.userId },
    });

    if (!application) {
        res.status(404).json({
            success: false,
            error: { code: "NOT_FOUND", message: "Application not found" },
        });
        return;
    }

    const updated = await prisma.application.update({
        where: { id },
        data: { notes },
    });

    res.json({ success: true, data: updated });
});

// GET /applications/stats — get aggregated stats
applicationRouter.get("/stats", async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;

    const stats = await prisma.application.groupBy({
        by: ["status"],
        where: { userId },
        _count: true,
    });

    const total = await prisma.application.count({ where: { userId } });

    res.json({
        success: true,
        data: {
            total,
            byStatus: Object.fromEntries(stats.map((s: any) => [s.status, s._count])),
        },
    });
});

// DELETE /applications/:id — delete an application
applicationRouter.delete("/:id", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const application = await prisma.application.findFirst({
        where: { id, userId: req.user!.userId },
    });

    if (!application) {
        res.status(404).json({
            success: false,
            error: { code: "NOT_FOUND", message: "Application not found" },
        });
        return;
    }

    await prisma.application.delete({ where: { id } });
    res.json({ success: true, data: { message: "Application deleted" } });
});

// ─── Background scoring helper ───────────────────────────────────────────────

async function scoreApplicationAsync(userId: string, applicationId: string, job: any): Promise<void> {
    const profile = await prisma.profile.findUnique({
        where: { userId },
        include: { experiences: true, educations: true, skills: true },
    });

    if (!profile) return; // No profile, can't score

    const scores = await scoreJob(
        userId,
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

    if (!scores) return;

    await prisma.application.update({
        where: { id: applicationId },
        data: {
            matchScore: scores.matchScore,
            skillMatch: scores.skillMatch,
            experienceMatch: scores.experienceMatch,
            locationMatch: scores.locationMatch,
            salaryMatch: scores.salaryMatch,
            acceptanceScore: scores.acceptanceScore,
            matchReason: scores.matchReason,
            missingSkills: scores.missingSkills,
            strongPoints: scores.strongPoints,
        },
    });

    console.log(`✅ Scored application ${applicationId}: ${scores.matchScore}/100`);
}
