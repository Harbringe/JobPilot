import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { Router } from "express";
import type { Response } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import {
    startAutoApply,
    getAutoApply,
    listAutoApply,
} from "./autoapply.service.js";

export const autoApplyRouter: Router = Router();
autoApplyRouter.use(authenticate);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.resolve(
    __dirname,
    "../../../",
    process.env.AUTOAPPLY_SCREENSHOT_DIR ?? "storage/autoapply"
);

// POST /autoapply/:applicationId — kick off a fill-and-pause run
autoApplyRouter.post("/:applicationId", validateUUID("applicationId"), async (req: AuthRequest, res: Response) => {
    const task = await startAutoApply(req.user!.userId, req.params.applicationId as string);
    res.status(202).json({ success: true, data: task });
});

// GET /autoapply/task/:id — poll a single task
autoApplyRouter.get("/task/:id", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    const task = await getAutoApply(req.user!.userId, req.params.id as string);
    res.json({ success: true, data: task });
});

// GET /autoapply — list user's tasks (optionally filter by application)
autoApplyRouter.get("/", async (req: AuthRequest, res: Response) => {
    const applicationId = typeof req.query.applicationId === "string" ? req.query.applicationId : undefined;
    const items = await listAutoApply(req.user!.userId, applicationId);
    res.json({ success: true, data: items });
});

// GET /autoapply/task/:id/screenshot — stream the prefilled-form screenshot.
// Auth-checked + ownership-checked via getAutoApply.
autoApplyRouter.get("/task/:id/screenshot", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    const task = await getAutoApply(req.user!.userId, req.params.id as string);
    if (!task?.screenshotUrl) {
        res.status(404).json({ success: false, error: { code: "AUTOAPPLY_SCREENSHOT_MISSING", message: "No screenshot available" } });
        return;
    }
    const filename = path.basename(task.screenshotUrl);
    const filePath = path.join(SCREENSHOT_DIR, filename);
    try {
        await fs.access(filePath);
    } catch {
        res.status(404).json({ success: false, error: { code: "AUTOAPPLY_SCREENSHOT_MISSING", message: "Screenshot file no longer exists" } });
        return;
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.sendFile(filePath);
});
