import { Router } from "express";
import type { Response } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { updateAiConfigSchema, testAiConfigSchema } from "./settings.validation.js";
import {
    getAiConfig,
    updateAiConfig,
    deleteAiConfig,
    testAiConfig,
} from "./settings.service.js";

export const settingsRouter: Router = Router();
settingsRouter.use(authenticate);

// GET /settings/ai — read user's AI config (without the secret)
settingsRouter.get("/ai", async (req: AuthRequest, res: Response) => {
    const cfg = await getAiConfig(req.user!.userId);
    res.json({ success: true, data: cfg });
});

// PUT /settings/ai — create or update; encrypts the key at rest
settingsRouter.put("/ai", validate(updateAiConfigSchema), async (req: AuthRequest, res: Response) => {
    await updateAiConfig(req.user!.userId, req.body);
    const cfg = await getAiConfig(req.user!.userId);
    res.json({ success: true, data: cfg });
});

// DELETE /settings/ai — clear it
settingsRouter.delete("/ai", async (req: AuthRequest, res: Response) => {
    await deleteAiConfig(req.user!.userId);
    res.json({ success: true, data: { message: "AI config cleared" } });
});

// POST /settings/ai/test — test arbitrary credentials WITHOUT saving
settingsRouter.post("/ai/test", validate(testAiConfigSchema), async (_req: AuthRequest, res: Response) => {
    const result = await testAiConfig(_req.body);
    res.json({ success: true, data: result });
});
