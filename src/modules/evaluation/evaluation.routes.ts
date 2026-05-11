import { Router } from "express";
import type { Response } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import {
    generateEvaluationSchema,
    listEvaluationsQuerySchema,
    updateBlockSchema,
} from "./evaluation.validation.js";
import { BLOCK_NAMES, type BlockName } from "./evaluation.types.js";
import {
    generateEvaluation,
    getEvaluationByJob,
    listEvaluations,
    updateBlock,
    deleteEvaluation,
} from "./evaluation.service.js";

export const evaluationRouter: Router = Router();
evaluationRouter.use(authenticate);

evaluationRouter.get("/", validate(listEvaluationsQuerySchema, "query"), async (req: AuthRequest, res: Response) => {
    const { applicationId, page, limit } = req.query as unknown as {
        applicationId?: string;
        page: number;
        limit: number;
    };
    const data = await listEvaluations(req.user!.userId, {
        applicationId,
        page: Number(page),
        limit: Number(limit),
    });
    res.json({ success: true, data });
});

evaluationRouter.post(
    "/jobs/:jobId",
    validateUUID("jobId"),
    validate(generateEvaluationSchema),
    async (req: AuthRequest, res: Response) => {
        const { applicationId, regenerate } = req.body as {
            applicationId?: string;
            regenerate: boolean;
        };
        const evaluation = await generateEvaluation(
            req.user!.userId,
            req.params.jobId as string,
            applicationId,
            regenerate
        );
        res.status(201).json({ success: true, data: evaluation });
    }
);

evaluationRouter.get("/jobs/:jobId", validateUUID("jobId"), async (req: AuthRequest, res: Response) => {
    const evaluation = await getEvaluationByJob(req.user!.userId, req.params.jobId as string);
    if (!evaluation) {
        res.status(404).json({
            success: false,
            error: { code: "EVALUATION_NOT_FOUND", message: "No evaluation generated yet" },
        });
        return;
    }
    res.json({ success: true, data: evaluation });
});

evaluationRouter.patch(
    "/:id/blocks/:blockName",
    validateUUID("id"),
    validate(updateBlockSchema),
    async (req: AuthRequest, res: Response) => {
        const blockName = req.params.blockName as string;
        if (!(BLOCK_NAMES as readonly string[]).includes(blockName)) {
            res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Unknown block name" },
            });
            return;
        }
        const updated = await updateBlock(
            req.user!.userId,
            req.params.id as string,
            blockName as BlockName,
            req.body.content
        );
        res.json({ success: true, data: updated });
    }
);

evaluationRouter.delete("/:id", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    await deleteEvaluation(req.user!.userId, req.params.id as string);
    res.json({ success: true, data: { message: "Evaluation deleted" } });
});
