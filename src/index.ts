import "dotenv/config";
import express from "express";
import "express-async-errors";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { authRouter } from "./modules/auth/auth.routes.js";
import { profileRouter } from "./modules/profile/profile.routes.js";
import { applicationRouter } from "./modules/applications/application.routes.js";
import { jobsRouter } from "./modules/jobs/jobs.routes.js";
import { resumesRouter } from "./modules/resumes/resumes.routes.js";
import { errorHandler } from "./middleware/error.js";

const app: express.Express = express();
const PORT = process.env.API_PORT || 3001;

// ─── Middleware ────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.WEB_URL || "http://localhost:3000",
    credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ─── Rate Limiting ─────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many requests, please try again later." } }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many authentication attempts, please try again later." } }
});

app.use(globalLimiter);

// ─── Health Check ──────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ────────────────────────────
app.use("/auth", authLimiter, authRouter);
app.use("/profile", profileRouter);
app.use("/applications", applicationRouter);
app.use("/jobs", jobsRouter);
app.use("/resumes", resumesRouter);

// ─── Error Handler ─────────────────────
app.use(errorHandler);

// ─── Start ─────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 JobPilot API running on http://localhost:${PORT}`);
});

export default app;
