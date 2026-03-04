import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import { createResumeSchema } from "./resumes.validation.js";
import * as resumesService from "./resumes.service.js";

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
