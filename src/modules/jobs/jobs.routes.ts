import { Router, Response, Request } from "express";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import { getJobsQuerySchema } from "./jobs.validation.js";
import * as jobsService from "./jobs.service.js";

export const jobsRouter: Router = Router();

// GET /jobs — public route to search jobs
jobsRouter.get("/", validate(getJobsQuerySchema, "query"), async (req: Request, res: Response) => {
    const result = await jobsService.getJobs(req.query as unknown as Parameters<typeof jobsService.getJobs>[0]);
    res.json({ success: true, data: result });
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
