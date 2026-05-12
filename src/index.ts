import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
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
import { storiesRouter } from "./modules/stories/stories.routes.js";
import { evaluationRouter } from "./modules/evaluation/evaluation.routes.js";
import { negotiationRouter } from "./modules/negotiation/negotiation.routes.js";
import { portalsRouter } from "./modules/portals/portals.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { autoApplyRouter } from "./modules/autoapply/autoapply.routes.js";
import { errorHandler } from "./middleware/error.js";

const app: express.Express = express();
const PORT = process.env.PORT || process.env.API_PORT || 3001;
const IS_PROD = process.env.NODE_ENV === "production";

// Hard-fail in production if WEB_URL is missing — prevents accidental open CORS.
if (IS_PROD && !process.env.WEB_URL) {
    console.error("❌ FATAL: WEB_URL must be set in production (CORS origin allowlist).");
    process.exit(1);
}

// Allow comma-separated WEB_URL for staging/production multi-host setups.
const corsOrigins = (process.env.WEB_URL || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// ─── Middleware ────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
}));
app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(IS_PROD ? "combined" : "dev"));

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

// Stricter ceiling for AI- and Playwright-backed endpoints. Each call hits an
// LLM and/or spawns a headless browser — without this, a single user can rack
// up cost or DoS the server.
const expensiveLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "Rate limit reached for AI/PDF endpoints. Try again in an hour." } }
});

app.use(globalLimiter);

// ─── API Docs (root) ──────────────────
// IMPORTANT: do NOT broadly static-serve `public/` — that would expose
// user-private PDFs and screenshots if anything is written under it. Serve
// docs explicitly instead. User-uploaded files live in `storage/` and are
// streamed via auth-gated routes.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "../public/docs.html"));
});
app.get("/openapi.yaml", (_req, res) => {
    res.sendFile(path.join(__dirname, "../public/openapi.yaml"));
});

// ─── Health Check ──────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ────────────────────────────
app.use("/auth", authLimiter, authRouter);
app.use("/profile", profileRouter);
app.use("/applications", applicationRouter);
app.use("/jobs", jobsRouter);
// AI- and Playwright-backed routes get an extra ceiling on top of the global limit.
app.use("/resumes", expensiveLimiter, resumesRouter);
app.use("/stories", expensiveLimiter, storiesRouter);
app.use("/evaluations", expensiveLimiter, evaluationRouter);
app.use("/negotiations", expensiveLimiter, negotiationRouter);
app.use("/portals", portalsRouter);
app.use("/settings", settingsRouter);
app.use("/autoapply", expensiveLimiter, autoApplyRouter);

// ─── Error Handler ─────────────────────
app.use(errorHandler);

// ─── Start ─────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 JobPilot API running on http://localhost:${PORT}`);
});

export default app;
