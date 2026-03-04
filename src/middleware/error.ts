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
