import { Router, Response } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import { createResumeSchema } from "./resumes.validation.js";
import * as resumesService from "./resumes.service.js";
import { generateAtsPdf, streamAtsPdf } from "./pdf.service.js";

export const resumesRouter: Router = Router();

resumesRouter.use(authenticate);

// GET /resumes/:applicationId — get all resumes for an application
resumesRouter.get("/:applicationId", validateUUID("applicationId"), async (req: AuthRequest, res: Response) => {
    const resumes = await resumesService.getResumesForApplication(
        req.params.applicationId as string,
        req.user!.userId
    );
    res.json({ success: true, data: resumes });
});

// POST /resumes — generate a new resume
resumesRouter.post("/", validate(createResumeSchema), async (req: AuthRequest, res: Response) => {
    const { applicationId, template, contentSnapshot } = req.body;
    const resume = await resumesService.createResume(
        applicationId,
        req.user!.userId,
        template,
        contentSnapshot
    );
    res.status(201).json({ success: true, data: resume });
});

const atsPdfBodySchema = z.object({ regenerate: z.boolean().default(false) });

// POST /resumes/:applicationId/ats-pdf — generate ATS-optimized PDF via Playwright
resumesRouter.post(
    "/:applicationId/ats-pdf",
    validateUUID("applicationId"),
    validate(atsPdfBodySchema),
    async (req: AuthRequest, res: Response) => {
        const { regenerate } = req.body as { regenerate: boolean };
        const result = await generateAtsPdf(
            req.user!.userId,
            req.params.applicationId as string,
            regenerate
        );
        res.status(201).json({ success: true, data: result });
    }
);

// GET /resumes/:applicationId/ats-pdf — stream the latest ATS PDF
resumesRouter.get(
    "/:applicationId/ats-pdf",
    validateUUID("applicationId"),
    async (req: AuthRequest, res: Response) => {
        const file = await streamAtsPdf(
            req.user!.userId,
            req.params.applicationId as string
        );
        if (!file) {
            res.status(404).json({
                success: false,
                error: { code: "RESUME_NOT_FOUND", message: "No ATS PDF generated yet" },
            });
            return;
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
        res.sendFile(file.filePath);
    }
);
