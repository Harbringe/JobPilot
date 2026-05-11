import { Router } from "express";
import type { Response } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import {
    createPortalSchema,
    updatePortalSchema,
} from "./portals.validation.js";
import {
    listPortals,
    createPortal,
    updatePortal,
    deletePortal,
} from "./portals.service.js";

export const portalsRouter: Router = Router();
portalsRouter.use(authenticate);

portalsRouter.get("/", async (req: AuthRequest, res: Response) => {
    const portals = await listPortals(req.user!.userId);
    res.json({ success: true, data: portals });
});

portalsRouter.post("/", validate(createPortalSchema), async (req: AuthRequest, res: Response) => {
    const portal = await createPortal(req.user!.userId, req.body);
    res.status(201).json({ success: true, data: portal });
});

portalsRouter.put("/:id", validateUUID("id"), validate(updatePortalSchema), async (req: AuthRequest, res: Response) => {
    const portal = await updatePortal(req.user!.userId, req.params.id as string, req.body);
    res.json({ success: true, data: portal });
});

portalsRouter.delete("/:id", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    await deletePortal(req.user!.userId, req.params.id as string);
    res.json({ success: true, data: { message: "Portal deleted" } });
});
