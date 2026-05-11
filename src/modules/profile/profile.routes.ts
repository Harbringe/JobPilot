import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { profileSchema } from "./profile.validation.js";
import * as profileService from "./profile.service.js";
import { extractTextFromBuffer, parseProfileFromText } from "./resume-import.service.js";
import type { Response } from "express";

export const profileRouter: Router = Router();

const ALLOWED_MIME = new Set([
    "application/pdf",
    "application/x-pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
        files: 1,
        fields: 5,
    },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
            cb(null, false);
            return;
        }
        // Reject sneaky filenames before they hit any path-joining code downstream.
        const safeName = file.originalname.replace(/[^\w.\- ]/g, "_").slice(0, 200);
        file.originalname = safeName;
        cb(null, true);
    },
});

// Resume import calls the AI provider — costly per request. Cap each user at
// 10 imports per hour to prevent abuse / runaway bills.
const importLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => (req as AuthRequest).user?.userId || req.ip || "anon",
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many resume imports. Try again in an hour." } },
});

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

// POST /profile/import-resume — extract profile data from uploaded resume
profileRouter.post(
    "/import-resume",
    importLimiter,
    upload.single("resume"),
    async (req: AuthRequest, res: Response) => {
        if (!req.file) {
            res.status(400).json({
                success: false,
                error: { code: "FILE_REQUIRED", message: "No resume file uploaded" },
            });
            return;
        }
        const text = await extractTextFromBuffer(req.file.buffer, req.file.mimetype);
        if (!text.trim()) {
            res.status(422).json({
                success: false,
                error: { code: "RESUME_EMPTY", message: "Could not extract text from the uploaded file" },
            });
            return;
        }
        const extracted = await parseProfileFromText(req.user!.userId, text);
        res.json({ success: true, data: extracted });
    }
);
