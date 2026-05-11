import { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
    console.error("❌ Error:", err.message);

    // Map known application errors to appropriate HTTP responses
    const errorMap: Record<string, { status: number; code: string; message: string }> = {
        EMAIL_EXISTS: { status: 409, code: "EMAIL_EXISTS", message: "An account with this email already exists" },
        INVALID_CREDENTIALS: { status: 401, code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
        INVALID_REFRESH_TOKEN: { status: 401, code: "INVALID_REFRESH_TOKEN", message: "Refresh token is invalid or expired" },
        APPLICATION_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Application not found or unauthorized" },
        PROFILE_NOT_FOUND: { status: 404, code: "PROFILE_NOT_FOUND", message: "No profile found for this user" },
        JOB_NOT_FOUND: { status: 404, code: "JOB_NOT_FOUND", message: "Job not found" },
        ALREADY_APPLIED: { status: 409, code: "ALREADY_APPLIED", message: "Already applied to this job" },
        USER_NOT_FOUND: { status: 404, code: "USER_NOT_FOUND", message: "User not found" },
        INVALID_PASSWORD: { status: 400, code: "INVALID_PASSWORD", message: "Current password is incorrect" },
        RESUME_NOT_FOUND: { status: 404, code: "RESUME_NOT_FOUND", message: "Resume not found" },
        STORY_NOT_FOUND: { status: 404, code: "STORY_NOT_FOUND", message: "Story not found or unauthorized" },
        EVALUATION_NOT_FOUND: { status: 404, code: "EVALUATION_NOT_FOUND", message: "Evaluation not found or unauthorized" },
        EVALUATION_PARSE_FAILED: { status: 502, code: "EVALUATION_PARSE_FAILED", message: "AI returned malformed evaluation; try again" },
        STORY_GENERATION_FAILED: { status: 502, code: "STORY_GENERATION_FAILED", message: "AI failed to generate stories; try again" },
        NEGOTIATION_NOT_FOUND: { status: 404, code: "NEGOTIATION_NOT_FOUND", message: "Negotiation script not found or unauthorized" },
        NEGOTIATION_GENERATION_FAILED: { status: 502, code: "NEGOTIATION_GENERATION_FAILED", message: "AI failed to generate negotiation script; try again" },
        PORTAL_NOT_FOUND: { status: 404, code: "PORTAL_NOT_FOUND", message: "Portal not found" },
        PORTAL_DUPLICATE: { status: 409, code: "PORTAL_DUPLICATE", message: "A portal with this company and provider already exists" },
        PORTAL_SCAN_TASK_NOT_FOUND: { status: 404, code: "PORTAL_SCAN_TASK_NOT_FOUND", message: "Portal scan task not found" },
        PROFILE_HAS_NO_EXPERIENCES: { status: 400, code: "PROFILE_HAS_NO_EXPERIENCES", message: "Profile has no work experiences to generate from" },
        AI_NOT_CONFIGURED: { status: 503, code: "AI_NOT_CONFIGURED", message: "No AI provider configured. Add an API key under Settings → AI Provider, or set *_API_KEY in the server .env." },
        AI_KEY_REQUIRED: { status: 400, code: "AI_KEY_REQUIRED", message: "An API key is required when configuring an AI provider for the first time" },
        AI_KEY_ENCRYPTION_SECRET_MISSING: { status: 503, code: "AI_KEY_ENCRYPTION_SECRET_MISSING", message: "Server is missing AI_KEY_ENCRYPTION_SECRET — cannot store user API keys." },
        AI_KEY_DECRYPT_FAILED: { status: 500, code: "AI_KEY_DECRYPT_FAILED", message: "Stored AI key could not be decrypted" },
        AUTOAPPLY_NOT_SUPPORTED: { status: 400, code: "AUTOAPPLY_NOT_SUPPORTED", message: "Auto-apply isn't supported for this job's ATS provider" },
        AUTOAPPLY_BLOCKED: { status: 409, code: "AUTOAPPLY_BLOCKED", message: "Auto-apply was blocked (CAPTCHA or unrecognized form). Open the job to apply manually." },
        AUTOAPPLY_DAILY_CAP: { status: 429, code: "AUTOAPPLY_DAILY_CAP", message: "Daily auto-apply cap reached" },
        AUTOAPPLY_RESUME_MISSING: { status: 400, code: "AUTOAPPLY_RESUME_MISSING", message: "Generate the ATS PDF first — auto-apply needs an uploaded resume" },
        AUTOAPPLY_NOT_FOUND: { status: 404, code: "AUTOAPPLY_NOT_FOUND", message: "Auto-apply task not found" },
        AUTOAPPLY_SCREENSHOT_MISSING: { status: 404, code: "AUTOAPPLY_SCREENSHOT_MISSING", message: "No screenshot available for this task" },
        DISCOVER_TASK_NOT_FOUND: { status: 404, code: "DISCOVER_TASK_NOT_FOUND", message: "Discover task not found" },
        PDF_RENDER_FAIL: { status: 500, code: "PDF_RENDER_FAIL", message: "Failed to render PDF" },
        RESUME_TEMPLATE_FAIL: { status: 500, code: "RESUME_TEMPLATE_FAIL", message: "Failed to load resume template" },
    };

    const mapped = errorMap[err.message];
    if (mapped) {
        res.status(mapped.status).json({
            success: false,
            error: { code: mapped.code, message: mapped.message },
        });
        return;
    }

    // Default to 500
    res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_ERROR",
            message: process.env.NODE_ENV === "production" ? "An unexpected error occurred" : err.message,
        },
    });
}
