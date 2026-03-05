# JobPilot API Documentation

> **Base URL:** `http://localhost:3001`
> **Content-Type:** `application/json`
> **Auth:** Include `Authorization: Bearer <accessToken>` for protected endpoints (🔒)

---

## Response Format

All endpoints return a consistent response wrapper:

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [{ "field": "email", "message": "Invalid email" }]  // only for VALIDATION_ERROR
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

## Error Codes Reference

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Request body/query fails Zod validation |
| `INVALID_PARAM` | 400 | Route parameter is not a valid UUID |
| `UNAUTHORIZED` | 401 | Missing or invalid `Authorization` header |
| `TOKEN_EXPIRED` | 401 | JWT access token is expired or invalid |
| `TOKEN_REVOKED` | 401 | Access token has been blocklisted (post-logout/password-change) |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token expired or already used |
| `INVALID_PASSWORD` | 400 | Current password is wrong (password change) |
| `USER_NOT_FOUND` | 404 | User doesn't exist |
| `PROFILE_NOT_FOUND` | 404 | User has no profile yet |
| `PROFILE_REQUIRED` | 400 | Profile must be created before using AI matching |
| `JOB_NOT_FOUND` | 404 | Job ID doesn't exist |
| `NOT_FOUND` | 404 | Application not found or not owned by user |
| `EMAIL_EXISTS` | 409 | Registration with already-registered email |
| `ALREADY_APPLIED` | 409 | Duplicate application to same job |
| `TOO_MANY_REQUESTS` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Auth Flow

```
1. Register or Login  →  receive { accessToken, refreshToken, user }
2. Store both tokens (localStorage, secure cookie, etc.)
3. Attach accessToken to all requests: Authorization: Bearer <token>
4. When accessToken expires (15min):
     → Call POST /auth/refresh with refreshToken
     → Receive new { accessToken, refreshToken } pair
     → Replace both stored tokens (old refreshToken is now invalid)
5. When refreshToken expires (7 days) → redirect to login
```

> **Token Blocklist:** Logout, password change, and account deletion immediately blocklist the access token. Using a blocklisted token returns `TOKEN_REVOKED` (401). Each refresh token is **single-use**.

---

## Endpoints

---

### 🔓 POST `/auth/register`

Create a new account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "MyPass123",
  "name": "John Doe"
}
```

**Validation:**
- `email` — valid email format
- `password` — min 8 chars, at least 1 uppercase letter, at least 1 digit
- `name` — 1-100 characters

**Response (201):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "a1b2c3d4e5f6...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": null,
      "plan": "FREE"
    }
  }
}
```

**Errors:** `EMAIL_EXISTS`, `VALIDATION_ERROR`

---

### 🔓 POST `/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "MyPass123"
}
```

**Response (200):** Same shape as register response.

**Errors:** `INVALID_CREDENTIALS`, `VALIDATION_ERROR`

---

### 🔓 POST `/auth/refresh`

Rotate tokens. Old refresh token is deleted.

**Request:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (200):** Same shape as register response (new token pair + user).

**Errors:** `INVALID_REFRESH_TOKEN`

---

### 🔒 GET `/auth/me`

Get the current authenticated user's info.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null,
    "plan": "FREE"
  }
}
```

**Errors:** `USER_NOT_FOUND`

---

### 🔒 POST `/auth/logout`

Blocklists the current access token and revokes all refresh tokens.

**Request:** No body needed.

**Response (200):**
```json
{ "success": true, "data": { "message": "Logged out successfully" } }
```

> **Frontend:** Clear stored tokens. The used access token is immediately invalid (`TOKEN_REVOKED`).

---

### 🔒 POST `/auth/change-password`

Change the current user's password. Blocklists current token and revokes all sessions.

**Request:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456"
}
```

**Response (200):**
```json
{ "success": true, "data": { "message": "Password changed. Please log in again." } }
```

**Errors:** `INVALID_PASSWORD`, `VALIDATION_ERROR`

---

### 🔒 POST `/auth/delete-account`

Permanently delete the user's account and all associated data. Blocklists current token.

**Request:**
```json
{
  "password": "MyPass123"
}
```

**Response (200):**
```json
{ "success": true, "data": { "message": "Account permanently deleted" } }
```

**Errors:** `INVALID_PASSWORD`

> **Frontend:** Irreversible. Show a confirmation dialog. All data (profile, applications, resumes, scores) is cascade-deleted.

---

### 🔒 GET `/profile`

Get the authenticated user's full profile with all nested data.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "fullName": "John Doe",
    "headline": "Full-Stack Developer",
    "summary": "5+ years experience...",
    "phone": "+1-555-0123",
    "location": "San Francisco, CA",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "githubUrl": "https://github.com/johndoe",
    "portfolioUrl": "https://johndoe.dev",
    "preferences": {
      "salaryMin": 120000,
      "salaryMax": 200000,
      "currency": "USD",
      "remoteType": "REMOTE",
      "visaRequired": false,
      "industries": ["technology", "fintech"]
    },
    "experiences": [
      {
        "id": "uuid",
        "company": "TechCorp",
        "title": "Senior Developer",
        "location": "SF",
        "startDate": "2022-03-01T...",
        "endDate": null,
        "current": true,
        "description": "Led platform dev..."
      }
    ],
    "educations": [...],
    "skills": [
      { "id": "uuid", "name": "TypeScript", "level": "EXPERT", "category": "programming" }
    ],
    "projects": [...],
    "certifications": [...]
  }
}
```

**Returns `null` if no profile exists yet.**

---

### 🔒 PUT `/profile`

Create or fully replace the user's profile (upsert). Transactional — all-or-nothing.

**Request:** Full profile object (see GET response shape for field names).

**Limits:**
| Field | Max |
|-------|-----|
| `experiences` | 50 items |
| `educations` | 30 items |
| `skills` | 100 items |
| `projects` | 50 items |
| `certifications` | 30 items |
| `fullName` | 200 chars |
| `headline` | 300 chars |
| `summary` | 5000 chars |

> **Important:** This is a full replace operation. Always send the complete profile payload.

**Response (200):** Full profile object.

---

### 🔒 DELETE `/profile`

Delete the entire profile and all nested data. Idempotent.

**Response (200):**
```json
{ "success": true, "data": { "message": "Profile deleted" } }
```

---

### 🔒 GET `/profile/export`

Export the profile as JSON (for Chrome extension / external use).

**Response:** Same as GET /profile, but returns 404 if no profile.

**Errors:** `PROFILE_NOT_FOUND`

---

### 🔓 GET `/jobs`

Search and list active jobs. No auth required.

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number (min: 1) |
| `limit` | number | 20 | Results per page (1-100) |
| `search` | string | — | Search in title, company, description |
| `location` | string | — | Filter by location (partial match) |
| `remoteType` | enum | — | `REMOTE` \| `HYBRID` \| `ONSITE` |
| `salaryMin` | number | — | Minimum salary filter |
| `source` | string | — | Filter by job source (`remotive`, `arbeitnow`, `seed`) |
| `sort` | enum | `date` | `date` \| `salary` \| `company` |

**Example:** `GET /jobs?search=react&remoteType=REMOTE&source=remotive&limit=10&sort=salary`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "Senior Frontend Engineer",
        "company": "Google",
        "companyLogoUrl": null,
        "location": "Mountain View, CA",
        "remoteType": "HYBRID",
        "salaryMin": 180000,
        "salaryMax": 280000,
        "salaryCurrency": "USD",
        "description": "Join Google's Cloud team...",
        "requirements": ["React", "TypeScript", "5+ years"],
        "source": "remotive",
        "sourceUrl": "https://remotive.com/job/...",
        "applyUrl": "https://...",
        "postedAt": "2026-02-18T...",
        "fingerprint": "remotive-12345",
        "isActive": true
      }
    ],
    "total": 342,
    "page": 1,
    "limit": 20,
    "totalPages": 18
  }
}
```

---

### 🔓 GET `/jobs/:id`

Get a single job by UUID.

**Response (200):** Single job object.

**Errors:** `JOB_NOT_FOUND`, `INVALID_PARAM`

---

### 🔒 POST `/jobs/sync`

Fetch jobs from external APIs (Remotive + Arbeitnow) and upsert into the database.

Deduplicates via the `fingerprint` field — safe to call multiple times.

**Request:** No body needed.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "new": 287,
    "updated": 13,
    "total": 300,
    "sources": {
      "remotive": 193,
      "arbeitnow": 107
    },
    "errors": []
  }
}
```

> **External APIs used:**
> - **Remotive** (`remotive.com/api/remote-jobs`) — remote tech jobs, 4 categories: software-dev, devops, data, product
> - **Arbeitnow** (`arbeitnow.com/api/job-board-api`) — European jobs, up to 3 pages

---

### 🔒 POST `/jobs/score-all`

Batch-score ALL active jobs against the authenticated user's profile using Grok LLM.

Processes 10 jobs per LLM call for efficiency. Scores are stored persistently in the `job_scores` table — no need to re-score.

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `force` | boolean | `false` | Set `true` to re-score already-scored jobs |

**Request:** No body needed.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "scored": 287,
    "skipped": 13,
    "total": 300,
    "batches": 29
  }
}
```

> **Requires `GROK_API_KEY`** in `.env`. Returns `{ scored: 0 }` if not set.
> **Requires a profile.** Returns error `PROFILE_NOT_FOUND` if no profile exists.

---

### 🔒 GET `/jobs/matched`

Get pre-scored jobs for the current user, sorted by matchScore DESC then salaryMax DESC.

Reads from the persistent `job_scores` table (call `/jobs/score-all` first).

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Results per page (1-100) |
| `minScore` | number | 0 | Minimum matchScore filter (0-100) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "job": {
          "id": "uuid",
          "title": "Senior React Developer",
          "company": "Stripe",
          "location": "Remote",
          "remoteType": "REMOTE",
          "salaryMin": 180000,
          "salaryMax": 250000,
          "salaryCurrency": "USD",
          "description": "...",
          "requirements": ["React", "TypeScript", "Node.js"],
          "source": "remotive",
          "applyUrl": "https://..."
        },
        "scoring": {
          "matchScore": 92,
          "skillMatch": 95,
          "experienceMatch": 88,
          "locationMatch": 100,
          "salaryMatch": 85,
          "acceptanceScore": 78,
          "matchReason": "Strong match — candidate has 7 years React/TypeScript experience, exactly matching the Senior level. Remote preference aligns perfectly.",
          "missingSkills": ["Kubernetes", "gRPC"],
          "strongPoints": ["TypeScript Expert", "React Expert", "Team leadership"],
          "scoredAt": "2026-03-05T..."
        }
      }
    ],
    "total": 287,
    "page": 1,
    "limit": 50,
    "totalPages": 6
  }
}
```

**Scoring dimensions:**

| Field | Range | Description |
|-------|-------|-------------|
| `matchScore` | 0-100 | Overall fit (weighted combination) |
| `skillMatch` | 0-100 | How well user skills match job requirements |
| `experienceMatch` | 0-100 | Years of experience alignment |
| `locationMatch` | 0-100 | Location/remote preference fit |
| `salaryMatch` | 0-100 | Salary range overlap (75 if no data) |
| `acceptanceScore` | 0-100 | Estimated likelihood of getting hired |
| `matchReason` | string | 1-2 sentence explanation |
| `missingSkills` | string[] | Skills from job the user lacks |
| `strongPoints` | string[] | User strengths that match well |

---

### 🔒 GET `/jobs/:id/insights`

Get AI-generated comprehensive job analysis. Results are cached for 7 days.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "job": { ... },
    "insights": {
      "overview": {
        "title": "Senior React Developer",
        "workType": "Full-time Remote",
        "seniorityLevel": "Senior",
        "estimatedYOE": "5-7 years",
        "teamSize": "Medium (10-20)"
      },
      "skills": {
        "required": ["React", "TypeScript", "Node.js"],
        "preferred": ["GraphQL", "AWS", "Docker"],
        "techStack": ["React 18", "Next.js", "PostgreSQL", "Redis"]
      },
      "responsibilities": [
        "Lead frontend architecture decisions",
        "Build and maintain React component library",
        "Collaborate with backend team on API design",
        "Mentor junior developers"
      ],
      "compensation": {
        "salaryRange": "$180,000 - $250,000",
        "currency": "USD",
        "benefits": ["Health insurance", "401k matching", "Equity", "Home office stipend"],
        "estimatedLeaves": "Unlimited PTO (standard for tech)"
      },
      "company": {
        "name": "Stripe",
        "industry": "Fintech / Payments",
        "reputation": "Stripe is a leading payments infrastructure company valued at $50B+. Known for engineering excellence and developer-first culture.",
        "culture": "Engineering-driven, high ownership, fast-paced. Strong focus on code quality and developer experience.",
        "workingHours": "Flexible — async-friendly with core hours overlap",
        "growthOpportunities": "Clear IC track (Senior → Staff → Principal). Strong internal mobility."
      },
      "applicationTips": [
        "Highlight experience building component libraries or design systems",
        "Mention any fintech or payments domain experience",
        "Include metrics: 'Reduced bundle size by X%' or 'Improved load time by Xs'"
      ],
      "redFlags": [],
      "greenFlags": [
        "Clear salary range posted",
        "Remote-first with established async culture",
        "Engineering blog indicates strong technical investment"
      ]
    }
  }
}
```

> Without `GROK_API_KEY`, returns `{ job, note: "AI insights unavailable" }`.

---

### 🔒 GET `/applications`

List authenticated user's applications with pagination.

**Query Params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Results per page (1-100) |
| `status` | enum | — | Filter by status |

**Status values:** `SAVED` | `APPLIED` | `SCREENING` | `INTERVIEW` | `OFFER` | `ACCEPTED` | `DECLINED` | `REJECTED`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "userId": "uuid",
        "jobId": "uuid",
        "status": "APPLIED",
        "matchScore": 85,
        "skillMatch": 90,
        "experienceMatch": 80,
        "locationMatch": 100,
        "salaryMatch": 75,
        "acceptanceScore": 72,
        "matchReason": "Strong skill alignment...",
        "missingSkills": ["Kubernetes"],
        "strongPoints": ["TypeScript Expert", "Team lead experience"],
        "notes": "Great culture fit",
        "appliedAt": "2026-02-20T...",
        "updatedAt": "2026-02-20T...",
        "job": { ... },
        "resumes": [ ... ]
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

> Applications are **auto-scored in the background** when created (if GROK_API_KEY is set). Scoring fields will be `null` initially and populated within a few seconds.

---

### 🔒 POST `/applications`

Create a new application (save a job). Auto-scores against profile in background.

**Request:**
```json
{
  "jobId": "uuid-of-the-job",
  "notes": "Looks like a great fit!"
}
```

**Validation:** `notes` max 5000 chars.

**Response (201):** Application object with nested `job`. AI scoring fields populate asynchronously.

**Errors:** `ALREADY_APPLIED`, `VALIDATION_ERROR`

---

### 🔒 PATCH `/applications/:id/status`

Update an application's status.

**Request:**
```json
{
  "status": "INTERVIEW"
}
```

**Response (200):** Updated application with `job`.

**Errors:** `NOT_FOUND`

---

### 🔒 PUT `/applications/:id/notes`

Update an application's notes.

**Request:**
```json
{
  "notes": "Had first interview, went well!"
}
```

**Response (200):** Updated application.

**Errors:** `NOT_FOUND`

---

### 🔒 DELETE `/applications/:id`

Delete an application and its associated resumes.

**Response (200):**
```json
{ "success": true, "data": { "message": "Application deleted" } }
```

**Errors:** `NOT_FOUND`, `INVALID_PARAM`

---

### 🔒 GET `/applications/stats`

Get aggregated application statistics.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 12,
    "byStatus": {
      "SAVED": 3,
      "APPLIED": 5,
      "INTERVIEW": 2,
      "OFFER": 1,
      "REJECTED": 1
    }
  }
}
```

---

### 🔒 GET `/resumes/:applicationId`

Get all generated resumes for a specific application.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "applicationId": "uuid",
      "pdfUrl": "https://storage.example.com/resumes/...",
      "template": "modern",
      "contentSnapshot": {
        "professionalSummary": "Senior engineer with 7+ years React/TypeScript...",
        "experiences": [
          {
            "title": "Senior Software Engineer",
            "company": "TechCorp",
            "period": "2021 - Present",
            "bullets": [
              "Led development of platform serving 2M+ users, reducing API latency by 40%",
              "Architected microservices migration improving deployment frequency by 3x"
            ]
          }
        ],
        "skills": {
          "highlighted": ["React", "TypeScript", "Node.js"],
          "additional": ["PostgreSQL", "Docker", "AWS"]
        },
        "education": [
          { "degree": "BS Computer Science", "institution": "MIT", "year": "2018" }
        ]
      },
      "generatedAt": "2026-02-20T..."
    }
  ]
}
```

---

### 🔒 POST `/resumes`

Generate a new resume for an application. If `GROK_API_KEY` is set and no `contentSnapshot` is provided, the LLM auto-generates tailored content based on the user's profile + target job.

**Request:**
```json
{
  "applicationId": "uuid-of-application",
  "template": "modern",
  "contentSnapshot": null
}
```

**Templates:** `modern` (default), `classic`, `minimal`

| Param | Required | Description |
|-------|----------|-------------|
| `applicationId` | yes | Application UUID |
| `template` | no | Resume template |
| `contentSnapshot` | no | Pass custom content or omit for AI generation |

**Response (201):** Resume object with LLM-generated `contentSnapshot` (see GET response above).

> **Note:** PDF generation is currently mocked. `pdfUrl` returns a placeholder URL.
> Without `GROK_API_KEY`, `contentSnapshot` will be `{}` unless manually provided.

---

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="redis://localhost:6379"

# Auth
JWT_SECRET="your-64-char-hex-secret"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="7d"

# App
NODE_ENV="development"
API_PORT=3001

# AI (optional — features degrade gracefully without it)
GROK_API_KEY="xai-..."         # Get from https://console.x.ai
GROK_MODEL="grok-3-fast"       # or "grok-3" for higher quality
```

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| **Global** | 100 requests / 15 minutes per IP |
| **Auth routes** (`/auth/*`) | 20 requests / 15 minutes per IP |

---

## Typical Frontend Flow

```
1. Register/Login → store tokens
2. Upsert profile → PUT /profile (skills, experience, ed, preferences)
3. Sync jobs → POST /jobs/sync (fetches 300+ real jobs)
4. Score all → POST /jobs/score-all (batch AI scoring)
5. Browse matched → GET /jobs/matched?limit=50 (sorted by score)
6. View insights → GET /jobs/:id/insights (detailed AI analysis)
7. Apply → POST /applications { jobId } (auto-scored in background)
8. Generate resume → POST /resumes { applicationId } (AI-tailored content)
9. Track → PATCH /applications/:id/status (SAVED → APPLIED → INTERVIEW → ...)
```

---

## Quick Setup

```bash
docker compose up -d       # Start PostgreSQL + Redis
npx prisma db push         # Push schema
npm run db:seed            # Seed demo data (3 sample jobs)
npm run dev                # API at :3001
```

**Demo login:** `demo@jobpilot.dev` / `Test1234`

**To get real jobs:** Call `POST /jobs/sync` after logging in — fetches 300+ jobs from Remotive + Arbeitnow.
