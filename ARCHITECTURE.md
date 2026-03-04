# JobPilot Backend — Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│   jobpilot-web (Next.js 16)  ←→  Postman / curl / mobile app       │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTP (JSON)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXPRESS API  (Port 3001)                          │
│                                                                     │
│  ┌─────────┐  ┌──────┐  ┌────────┐  ┌──────────────┐  ┌─────────┐ │
│  │ Helmet  │→ │ CORS │→ │ Morgan │→ │ Rate Limiter │→ │ Router  │ │
│  └─────────┘  └──────┘  └────────┘  └──────────────┘  └────┬────┘ │
│                                                              │      │
│  ┌───────────────────────────────────────────────────────────┘      │
│  │                                                                  │
│  │   /auth ──────► [authLimiter] → validate(zod) → auth.service    │
│  │   /profile ───► [authenticate] → validate(zod) → profile.svc   │
│  │   /applications► [authenticate] → application.routes            │
│  │   /jobs ──────► validate(zod, "query") → jobs.service           │
│  │   /resumes ───► [authenticate] → validate(zod) → resumes.svc   │
│  │                                                                  │
│  └──────────────────────────┬──────────────────────────────────────┘│
│                              │ On error                              │
│                              ▼                                       │
│                    errorHandler middleware                            │
│                    (maps Error codes → HTTP)                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┼─────────────────┐
              ▼                ▼                  ▼
     ┌──────────────┐  ┌────────────┐    ┌──────────────┐
     │  PostgreSQL   │  │   Redis    │    │ File Storage │
     │  (pgvector)   │  │  (Cache)   │    │  (S3 / R2)   │
     │  via Prisma   │  │  planned   │    │   planned    │
     └──────────────┘  └────────────┘    └──────────────┘
```

## Request Lifecycle

```
1. HTTP Request arrives
       │
2. Helmet sets security headers
       │
3. CORS checks origin (WEB_URL only)
       │
4. express.json() parses body (10mb limit)
       │
5. Morgan logs the request
       │
6. Global Rate Limiter checks IP (100/15min)
       │
7. Router matches path
       │
   ┌───┴───────────────────────────────────────┐
   │  If /auth/* → Auth Rate Limiter (20/15min) │
   │  If protected → authenticate middleware    │
   │  If has body/query → validate middleware   │
   └───┬───────────────────────────────────────┘
       │
8. Route handler calls service layer
       │
9. Service uses Prisma to query PostgreSQL
       │
   ┌───┴──────────────────────────────┐
   │ Success → res.json({ success })  │
   │ Error → thrown, caught by        │
   │  express-async-errors → falls    │
   │  to errorHandler middleware      │
   └──────────────────────────────────┘
```

## Authentication Flow

```
┌──────────┐     POST /auth/login        ┌──────────────┐
│  Client  │ ──────────────────────────► │  auth.service │
│          │ { email, password }          │              │
│          │                              │  1. Find user │
│          │                              │  2. bcrypt    │
│          │     { accessToken,           │     compare   │
│          │ ◄────refreshToken, user }──  │  3. Sign JWT  │
│          │                              │  4. Hash      │
│          │                              │     refresh   │
│          │                              │     token     │
│          │                              │  5. Store     │
│          │                              │     hashed    │
└────┬─────┘                              └──────────────┘
     │
     │  GET /profile (protected)
     │  Authorization: Bearer <accessToken>
     │
     ▼
┌──────────────┐
│  auth.ts     │  1. Extract token from header
│  middleware  │  2. jwt.verify(token, JWT_SECRET)
│              │  3. Attach { userId, email, plan } to req.user
│              │  4. Call next()
└──────────────┘

Token Rotation:
  Access Token  → 15 min expiry, signed with JWT_SECRET
  Refresh Token → 7 day expiry, SHA-256 hashed in DB
  On refresh    → old token deleted, new pair issued
```

## Database Schema (ERD)

```
┌──────────────┐       1:1        ┌──────────────┐
│    User       │────────────────►│   Profile     │
│──────────────│                  │──────────────│
│ id (uuid)    │                  │ id (uuid)    │
│ email        │                  │ userId (FK)  │
│ passwordHash │                  │ fullName     │
│ name         │                  │ headline     │
│ plan (enum)  │                  │ summary      │
│ provider     │                  │ phone        │
│ lastLogin    │                  │ location     │
└──────┬───────┘                  │ linkedinUrl  │
       │                          │ githubUrl    │
       │ 1:N                      │ preferences  │
       │                          └──────┬───────┘
       │                                 │ 1:N each
       ▼                                 ▼
┌──────────────┐          ┌──────────────────────────┐
│ RefreshToken │          │ WorkExperience           │
│──────────────│          │ Education                │
│ token (hash) │          │ Skill                    │
│ expiresAt    │          │ Project                  │
│ userId (FK)  │          │ Certification            │
└──────────────┘          └──────────────────────────┘

┌──────────────┐      N:1        ┌──────────────┐
│ Application  │────────────────►│    Job        │
│──────────────│                 │──────────────│
│ id (uuid)    │                 │ id (uuid)    │
│ userId (FK)  │                 │ title        │
│ jobId (FK)   │                 │ company      │
│ status (enum)│                 │ location     │
│ matchScore   │                 │ remoteType   │
│ notes        │                 │ salaryMin/Max│
│ appliedAt    │                 │ description  │
└──────┬───────┘                 │ requirements │
       │                         │ fingerprint  │
       │ 1:N                     │ postedAt     │
       ▼                         └──────────────┘
┌──────────────┐
│   Resume     │
│──────────────│
│ id (uuid)    │
│ appId (FK)   │
│ pdfUrl       │
│ template     │
│ generatedAt  │
└──────────────┘

Enums: Plan(FREE|PRO|PREMIUM), SkillLevel(BEGINNER|..|EXPERT),
       RemoteType(REMOTE|HYBRID|ONSITE),
       ApplicationStatus(SAVED|APPLIED|SCREENING|INTERVIEW|OFFER|ACCEPTED|DECLINED|REJECTED)
```

## Module Dependency Graph

```
src/index.ts (entrypoint)
  ├── middleware/auth.ts          ← jwt, AuthRequest
  ├── middleware/validate.ts      ← zod
  ├── middleware/error.ts         ← error code mapper
  ├── db/index.ts                 ← Prisma singleton
  ├── types/index.ts              ← shared interfaces
  │
  ├── modules/auth/
  │   ├── auth.routes.ts          ← depends on: validate, auth.validation, auth.service
  │   ├── auth.service.ts         ← depends on: db, types, bcrypt, jwt, crypto
  │   └── auth.validation.ts      ← depends on: zod
  │
  ├── modules/profile/
  │   ├── profile.routes.ts       ← depends on: auth, validate, profile.validation, profile.service
  │   ├── profile.service.ts      ← depends on: db, types
  │   └── profile.validation.ts   ← depends on: zod
  │
  ├── modules/applications/
  │   └── application.routes.ts   ← depends on: auth, db (inline queries)
  │
  ├── modules/jobs/
  │   ├── jobs.routes.ts          ← depends on: validate, jobs.validation, jobs.service
  │   ├── jobs.service.ts         ← depends on: db
  │   └── jobs.validation.ts      ← depends on: zod
  │
  └── modules/resumes/
      ├── resumes.routes.ts       ← depends on: auth, validate, resumes.validation, resumes.service
      ├── resumes.service.ts      ← depends on: db
      └── resumes.validation.ts   ← depends on: zod
```
