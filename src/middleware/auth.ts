import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { isTokenBlocked } from "./tokenBlocklist.js";

export interface AuthPayload {
    userId: string;
    email: string;
    plan: string;
}

export interface AuthRequest extends Request {
    user?: AuthPayload;
    /** The raw Bearer token, needed for blocklisting on logout */
    rawToken?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
        });
        return;
    }

    const token = header.split(" ")[1];

    // Check if token has been revoked (user logged out or deleted account)
    if (isTokenBlocked(token)) {
        res.status(401).json({
            success: false,
            error: { code: "TOKEN_REVOKED", message: "Token has been revoked. Please log in again." },
        });
        return;
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
        req.user = payload;
        req.rawToken = token;
        next();
    } catch {
        res.status(401).json({
            success: false,
            error: { code: "TOKEN_EXPIRED", message: "Token is invalid or expired" },
        });
    }
}

/**
 * Auth-aware but not auth-required. Populates req.user if a valid token is
 * present, otherwise just falls through. Used for endpoints that personalize
 * the response when logged in but still serve anonymous callers.
 */
export function optionalAuthenticate(req: AuthRequest, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next();
    const token = header.split(" ")[1];
    if (isTokenBlocked(token)) return next();
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
        req.user = payload;
        req.rawToken = token;
    } catch {
        // Ignore — keep going anonymously.
    }
    next();
}
