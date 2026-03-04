# JobPilot Backend — Implementation Plan

> This plan documents what has been built, what security patches were applied, and what remains on the roadmap. It serves as the source of truth for the backend development lifecycle.

---

## Phase 1: Core API Foundation ✅ COMPLETED

### 1.1 Auth Module
- **Files:** `modules/auth/auth.routes.ts`, `auth.service.ts`, `auth.validation.ts`
- **Endpoints:** `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`
- **Details:**
  - User registration with Zod validation (email format, password complexity: 8+ chars, 1 uppercase, 1 digit)
  - Login with bcrypt password comparison (12 salt rounds)
  - JWT access tokens (15m expiry) signed with `JWT_SECRET`
  - Refresh token rotation: 48 random bytes → SHA-256 hashed before DB storage, 7-day expiry
  - Logout revokes all user refresh tokens

### 1.2 Profile Module
- **Files:** `modules/profile/profile.routes.ts`, `profile.service.ts`, `profile.validation.ts`
- **Endpoints:** `GET/PUT/DELETE /profile`, `GET /profile/export`
- **Details:**
  - Full profile upsert with transactional integrity (Prisma `$transaction`)
  - Nested data: WorkExperiences, Education, Skills, Projects, Certifications
  - Delete cascades all nested records
  - Export returns full profile as JSON

### 1.3 Applications Module
- **Files:** `modules/applications/application.routes.ts`
- **Endpoints:** `GET/POST /applications`, `PATCH /:id/status`, `PUT /:id/notes`, `GET /stats`
- **Details:**
  - Prevents duplicate applications (`userId_jobId` unique constraint)
  - Ownership verification on all mutations
  - Pagination with `page` and `limit` query params
  - Stats endpoint aggregates counts by status

### 1.4 Jobs Module
- **Files:** `modules/jobs/jobs.routes.ts`, `jobs.service.ts`, `jobs.validation.ts`
- **Endpoints:** `GET /jobs`, `GET /jobs/:id`
- **Details:**
  - Public endpoints (no auth required)
  - Dynamic filtering: search (title/company), location, remoteType, salaryMin
  - Pagination with Zod-validated query params

### 1.5 Resumes Module
- **Files:** `modules/resumes/resumes.routes.ts`, `resumes.service.ts`, `resumes.validation.ts`
- **Endpoints:** `GET /resumes/:applicationId`, `POST /resumes`
- **Details:**
  - Verifies application ownership before access
  - Currently returns mock PDF URLs (real PDF generation is Phase 3)
  - Supports template selection

---

## Phase 2: Security Hardening ✅ COMPLETED

### 2.1 Async Error Handling (Critical Fix)
- **Problem:** Express v4 async route handlers throwing errors caused unhandled promise rejections that would crash the Node.js process
- **Fix:** Installed `express-async-errors` to globally patch all route handlers
- **Impact:** Removed all redundant `try/catch` blocks, centralized error handling in `middleware/error.ts`

### 2.2 Refresh Token Hashing
- **Problem:** Refresh tokens stored in plain text in PostgreSQL
- **Fix:** Hash with `crypto.createHash("sha256")` before storage; hash incoming tokens before DB lookup
- **Impact:** Database compromise no longer leaks usable tokens

### 2.3 Rate Limiting
- **Added:** `express-rate-limit`
- **Global:** 100 requests per 15 minutes per IP
- **Auth routes:** 20 requests per 15 minutes per IP (brute-force protection)

### 2.4 Input Validation
- **Zod schemas** on all endpoints (body AND query params)
- **`validate` middleware** supports `target: "body" | "query"` parameter
- Strips unexpected fields, prevents prototype pollution

### 2.5 HTTP Security
- **Helmet** — CSP, HSTS, X-Content-Type-Options, XSS protection
- **CORS** — Locked to `WEB_URL` origin only

---

## Phase 3: Planned Features (NOT YET IMPLEMENTED)

### 3.1 Automated Testing
- **Framework:** Jest + ts-jest + Supertest
- **Plan:**
  - Integration tests for all auth endpoints
  - Profile CRUD tests with seeded data
  - Job search filter tests
  - Application lifecycle tests
- **Commands:** `npm test` (after setup)

### 3.2 AI Matching Engine
- **Technology:** pgvector (extension already in Docker image)
- **Plan:**
  - Generate embeddings for job descriptions and user profiles
  - Calculate cosine similarity scores
  - Rank job results by match score
  - Store `matchScore` on Application records

### 3.3 Real Resume PDF Generation
- **Current state:** Returns mock URLs
- **Plan:**
  - Integrate Puppeteer or React-PDF for server-side rendering
  - Template system (modern, classic, minimal)
  - Upload generated PDFs to S3/R2
  - Return real download URLs

### 3.4 File Upload & Storage
- **Plan:** S3-compatible storage (AWS S3 or Cloudflare R2)
- **Use cases:** Resume PDFs, profile avatars
- **Env vars:** `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`

### 3.5 Email Notifications
- **Provider:** Resend
- **Use cases:** Email verification, application status updates, weekly job digests
- **Env var:** `RESEND_API_KEY`

### 3.6 OAuth (Google)
- **Env vars exist:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- **Plan:** Passport.js Google strategy, link to existing User model

### 3.7 Redis Caching
- **Infrastructure:** Redis container already in docker-compose
- **Plan:** Cache frequently accessed job listings, rate limit state persistence, session storage

### 3.8 AutoApply Chrome Extension (Sprint 3)
- **Plan:** Browser extension that reads user profile and auto-fills job application forms
- **API support needed:** Endpoint to serve profile data in extension-friendly format

---

## Environment Variables Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✓ | `dev-secret-change-me` | JWT signing secret |
| `JWT_EXPIRES_IN` | ✗ | `15m` | Access token lifespan |
| `API_PORT` | ✗ | `3001` | Server port |
| `WEB_URL` | ✗ | `http://localhost:3000` | CORS allowed origin |
| `NODE_ENV` | ✗ | `development` | Environment flag |
| `REDIS_URL` | ✗ | — | Redis connection (planned) |
| `OPENAI_API_KEY` | ✗ | — | AI features (planned) |
| `S3_*` | ✗ | — | File storage (planned) |
| `RESEND_API_KEY` | ✗ | — | Email (planned) |
| `GOOGLE_CLIENT_*` | ✗ | — | OAuth (planned) |
