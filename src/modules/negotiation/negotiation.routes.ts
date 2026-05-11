import { Router } from "express";
import type { Response } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import {
    generateNegotiationSchema,
    listNegotiationsQuerySchema,
} from "./negotiation.validation.js";
import {
    generateScript,
    listNegotiations,
    deleteNegotiation,
} from "./negotiation.service.js";

export const negotiationRouter: Router = Router();
negotiationRouter.use(authenticate);

negotiationRouter.get("/", validate(listNegotiationsQuerySchema, "query"), async (req: AuthRequest, res: Response) => {
    const { applicationId, page, limit } = req.query as unknown as {
        applicationId?: string;
        page: number;
        limit: number;
    };
    const data = await listNegotiations(req.user!.userId, {
        applicationId,
        page: Number(page),
        limit: Number(limit),
    });
    res.json({ success: true, data });
});

negotiationRouter.post("/generate", validate(generateNegotiationSchema), async (req: AuthRequest, res: Response) => {
    const script = await generateScript(req.user!.userId, req.body);
    res.status(201).json({ success: true, data: script });
});

negotiationRouter.delete("/:id", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    await deleteNegotiation(req.user!.userId, req.params.id as string);
    res.json({ success: true, data: { message: "Negotiation script deleted" } });
});
