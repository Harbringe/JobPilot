import { Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { profileSchema } from "./profile.validation.js";
import * as profileService from "./profile.service.js";
import type { Response } from "express";

export const profileRouter: Router = Router();

// All profile routes require authentication
profileRouter.use(authenticate);

// GET /profile
profileRouter.get("/", async (req: AuthRequest, res: Response) => {
    const profile = await profileService.getProfile(req.user!.userId);
    if (!profile) {
        res.json({ success: true, data: null });
        return;
    }
    res.json({ success: true, data: profile });
});

// PUT /profile — upsert entire profile
profileRouter.put("/", validate(profileSchema), async (req: AuthRequest, res: Response) => {
    const profile = await profileService.upsertProfile(req.user!.userId, req.body);
    res.json({ success: true, data: profile });
});

// DELETE /profile
profileRouter.delete("/", async (req: AuthRequest, res: Response) => {
    await profileService.deleteProfile(req.user!.userId);
    res.json({ success: true, data: { message: "Profile deleted" } });
});

// GET /profile/export — export profile as JSON (for Chrome extension)
profileRouter.get("/export", async (req: AuthRequest, res: Response) => {
    const profile = await profileService.getProfile(req.user!.userId);
    if (!profile) {
        res.status(404).json({
            success: false,
            error: { code: "PROFILE_NOT_FOUND", message: "No profile found" },
        });
        return;
    }
    res.json({ success: true, data: profile });
});
