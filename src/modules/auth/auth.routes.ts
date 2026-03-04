import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { registerSchema, loginSchema, refreshSchema, changePasswordSchema, deleteAccountSchema } from "./auth.validation.js";
import * as authService from "./auth.service.js";
import type { Response } from "express";

export const authRouter: Router = Router();

// POST /auth/register
authRouter.post("/register", validate(registerSchema), async (req, res: Response) => {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
});

// POST /auth/login
authRouter.post("/login", validate(loginSchema), async (req, res: Response) => {
    const result = await authService.login(req.body);
    res.json({ success: true, data: result });
});

// POST /auth/refresh
authRouter.post("/refresh", validate(refreshSchema), async (req, res: Response) => {
    const result = await authService.refreshToken(req.body.refreshToken);
    res.json({ success: true, data: result });
});

// GET /auth/me
authRouter.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
    const user = await authService.getMe(req.user!.userId);
    if (!user) {
        res.status(404).json({
            success: false,
            error: { code: "USER_NOT_FOUND", message: "User not found" },
        });
        return;
    }
    res.json({ success: true, data: user });
});

// POST /auth/logout
authRouter.post("/logout", authenticate, async (req: AuthRequest, res: Response) => {
    await authService.logout(req.user!.userId);
    res.json({ success: true, data: { message: "Logged out successfully" } });
});

// POST /auth/change-password
authRouter.post("/change-password", authenticate, validate(changePasswordSchema), async (req: AuthRequest, res: Response) => {
    await authService.changePassword(req.user!.userId, req.body.currentPassword, req.body.newPassword);
    res.json({ success: true, data: { message: "Password changed. Please log in again." } });
});

// POST /auth/delete-account
authRouter.post("/delete-account", authenticate, validate(deleteAccountSchema), async (req: AuthRequest, res: Response) => {
    await authService.deleteAccount(req.user!.userId, req.body.password);
    res.json({ success: true, data: { message: "Account permanently deleted" } });
});
