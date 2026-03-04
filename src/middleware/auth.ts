import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
    userId: string;
    email: string;
    plan: string;
}

export interface AuthRequest extends Request {
    user?: AuthPayload;
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

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
        req.user = payload;
        next();
    } catch {
        res.status(401).json({
            success: false,
            error: { code: "TOKEN_EXPIRED", message: "Token is invalid or expired" },
        });
    }
}
