# AGENTS.md — JobPilot Backend Context

> **Purpose:** This document gives any AI coding assistant (Claude, Cursor, Copilot, etc.) full context on the JobPilot backend so it can contribute effectively without re-discovering the architecture.

---

## 1. Project Overview

**JobPilot** is an AI-powered job automation platform. This repo (`jobpilot-api`) is the **standalone Express REST API backend**. It was extracted from a Turborepo monorepo and is now completely independent.

A separate frontend repo (`jobpilot-web`) — built with Next.js 16, React 19, and Tailwind CSS — consumes this API at `http://localhost:3001`.

### Product Features
- **Global Job Aggregation** — pulls jobs from multiple portals
- **AI Matching Engine** — uses `pgvector` for relevance/salary/probability ranking
- **Tailored Resumes** — one-click custom resume generation per job
- **Profile Builder** — centralized hub for experiences, education, skills, preferences
- **Application Tracker** — Kanban-style status tracking
- **AutoApply** — Chrome extension for one-click form filling (planned, Sprint 3)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 4 |
| ORM | Prisma (PostgreSQL with `pgvector` extension) |
| Auth | JWT access tokens (15m) + SHA-256 hashed refresh tokens (7d) |
| Validation | Zod schemas on all request bodies and query params |
| Security | Helmet, CORS (origin-locked), express-rate-limit |
| Error Handling | `express-async-errors` (global async catch) |
| Dev Server | `tsx watch` via `dotenv-cli` |

---

## 3. Project Structure

```
jobpilot-api/
├── prisma/schema.prisma          # Database schema (all models)
├── src/
│   ├── index.ts                  # Express entrypoint + middleware + route mounting
│   ├── seed.ts                   # Database seeder (demo user + 3 jobs)
│   ├── db/index.ts               # Prisma client singleton (dev-safe)
│   ├── types/index.ts            # All shared TypeScript interfaces (API contract)
│   ├── middleware/
│   │   ├── auth.ts               # JWT verification + AuthRequest interface
│   │   ├── validate.ts           # Zod validation middleware (supports body + query)
│   │   ├── validateUUID.ts       # Route param UUID validation middleware
│   │   └── error.ts              # Global error handler (maps error codes → HTTP)
│   └── modules/
│       ├── auth/                 # Register, Login, Refresh, Me, Logout
│       │   ├── auth.routes.ts
│       │   ├── auth.service.ts
│       │   └── auth.validation.ts
│       ├── profile/              # CRUD + export for user profiles
│       │   ├── profile.routes.ts
│       │   ├── profile.service.ts
│       │   └── profile.validation.ts
│       ├── applications/         # Job applications CRUD + stats
│       │   └── application.routes.ts
│       ├── jobs/                 # Public job listing/search
│       │   ├── jobs.routes.ts
│       │   ├── jobs.service.ts
│       │   └── jobs.validation.ts
│       └── resumes/              # Resume generation per application
│           ├── resumes.routes.ts
│           ├── resumes.service.ts
│           └── resumes.validation.ts
├── docker-compose.yml            # PostgreSQL (pgvector) + Redis
├── package.json
├── tsconfig.json
└── .env
```

---

## 4. Database Models (Prisma)

The schema lives in `prisma/schema.prisma`. Key models:

| Model | Description |
|-------|------------|
| `User` | Auth identity (email, passwordHash, plan, provider) |
| `Profile` | User's professional profile (1:1 with User) |
| `WorkExperience` | Work history entries (1:N with Profile) |
| `Education` | Education entries (1:N with Profile) |
| `Skill` | Skills with level/category (1:N with Profile) |
| `Project` | Portfolio projects (1:N with Profile) |
| `Certification` | Professional certs (1:N with Profile) |
| `Job` | Job listings with salary, remote type, requirements |
| `Application` | User ↔ Job link with status tracking |
| `Resume` | Generated PDF resumes per application |
| `RefreshToken` | SHA-256 hashed refresh tokens with expiry |

---

## 5. API Endpoints

### Auth (`/auth`) — Rate limited: 20 req/15min
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ✗ | Register (email, password, name) |
| POST | `/auth/login` | ✗ | Login → returns accessToken + refreshToken |
| POST | `/auth/refresh` | ✗ | Rotate refresh token |
| GET | `/auth/me` | ✓ | Get current user info |
| POST | `/auth/logout` | ✓ | Revoke all refresh tokens |
| POST | `/auth/change-password` | ✓ | Change password (revokes all sessions) |
| POST | `/auth/delete-account` | ✓ | Permanently delete account (requires password) |

### Profile (`/profile`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/profile` | ✓ | Get full profile with nested data |
| PUT | `/profile` | ✓ | Upsert profile (transactional) |
| DELETE | `/profile` | ✓ | Delete profile |
| GET | `/profile/export` | ✓ | Export profile as JSON |

### Jobs (`/jobs`) — Public
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/jobs` | ✗ | List/search with filters (search, location, remoteType, salary) |
| GET | `/jobs/:id` | ✗ | Get single job by ID |

### Applications (`/applications`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/applications` | ✓ | List with pagination + optional status filter |
| POST | `/applications` | ✓ | Create (jobId, notes). Prevents duplicate applies |
| PATCH | `/applications/:id/status` | ✓ | Update application status |
| PUT | `/applications/:id/notes` | ✓ | Update notes |
| GET | `/applications/stats` | ✓ | Aggregated stats grouped by status |
| DELETE | `/applications/:id` | ✓ | Delete an application |

### Resumes (`/resumes`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resumes/:applicationId` | ✓ | Get all resumes for an application |
| POST | `/resumes` | ✓ | Generate a new resume (applicationId, template) |

---

## 6. Security Measures (Already Implemented)

1. **express-async-errors** — All async route handlers are globally wrapped. No unhandled rejections can crash the process.
2. **Refresh Token Hashing** — Tokens are hashed with `crypto.createHash("sha256")` before DB storage. Raw tokens are never persisted.
3. **Rate Limiting** — Global: 100 req/15min per IP. Auth routes: 20 req/15min.
4. **Helmet** — Full HTTP security headers (CSP, HSTS, X-Content-Type-Options, etc.).
5. **CORS** — Origin locked to `process.env.WEB_URL` only.
6. **Zod Validation** — All inputs validated and sanitized before hitting the database.
7. **bcryptjs** — Passwords hashed with 12 salt rounds.

---

## 7. Error Handling Convention

All application errors are thrown as `new Error("ERROR_CODE")` and mapped in `middleware/error.ts`:

| Error Code | HTTP Status | Meaning |
|-----------|-------------|---------|
| `EMAIL_EXISTS` | 409 | Registration with existing email |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `INVALID_REFRESH_TOKEN` | 401 | Expired or invalid refresh token |
| `INVALID_PASSWORD` | 400 | Wrong current password (change password) |
| `APPLICATION_NOT_FOUND` | 404 | Application doesn't exist or unauthorized |
| `PROFILE_NOT_FOUND` | 404 | No profile found |
| `JOB_NOT_FOUND` | 404 | Job doesn't exist |
| `USER_NOT_FOUND` | 404 | User doesn't exist |
| `ALREADY_APPLIED` | 409 | Duplicate application to same job |
| `INVALID_PARAM` | 400 | Route param is not a valid UUID |
| *(default)* | 500 | Internal server error |

**To add a new error:** Throw `new Error("YOUR_CODE")` in the service, then add a mapping block in `middleware/error.ts`.

---

## 8. Development Conventions

### Adding a New Module
1. Create `src/modules/<name>/` with `<name>.routes.ts`, `<name>.service.ts`, `<name>.validation.ts`
2. Import and mount the router in `src/index.ts`
3. Add any new error codes to `middleware/error.ts`
4. Use `authenticate` middleware for protected routes
5. Use `validate(schema)` or `validate(schema, "query")` for input validation

### Running Locally
```bash
docker compose up -d          # Start PostgreSQL + Redis
npx prisma db push            # Push schema to DB
npm run db:seed               # Seed demo data
npm run dev                   # Start dev server on :3001
```

### Demo Credentials
- Email: `demo@jobpilot.dev`
- Password: `Test1234`

---

## 9. What's NOT Yet Implemented (Roadmap)

- [ ] **Automated Testing** — Jest + Supertest integration tests (planned but not yet set up)
- [ ] **AI Matching** — pgvector embeddings for job-profile similarity scoring
- [ ] **Real Resume PDF Generation** — Currently returns a mock URL; needs a PDF renderer (e.g., Puppeteer, React-PDF)
- [ ] **File Upload** — S3/R2 integration for resume file storage
- [ ] **Email Notifications** — Resend integration for application status updates
- [ ] **OAuth** — Google login (env vars exist but not wired)
- [ ] **Redis Caching** — Redis is in docker-compose but not yet used in the API
- [ ] **AutoApply Chrome Extension** — Sprint 3

---

## 10. Shared Types Contract

The `src/types/index.ts` file contains all TypeScript interfaces that define the API contract between backend and frontend. **Both repos have an identical copy.** When changing API response shapes, update BOTH copies.

Key types: `RegisterRequest`, `LoginRequest`, `AuthResponse`, `UserPublic`, `ProfileData`, `JobListing`, `JobSearchParams`, `ApplicationData`, `ApiResponse<T>`, `PaginatedResponse<T>`.
