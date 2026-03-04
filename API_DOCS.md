# JobPilot API Documentation

> **Base URL:** `http://localhost:3001`
> **Content-Type:** `application/json`
> **Auth:** Include `Authorization: Bearer <accessToken>` for protected endpoints (\ud83d\udd12)

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
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token expired or already used |
| `INVALID_PASSWORD` | 400 | Current password is wrong (password change) |
| `USER_NOT_FOUND` | 404 | User doesn't exist |
| `PROFILE_NOT_FOUND` | 404 | User has no profile yet |
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

> **Important:** Each refresh token is **single-use**. After calling `/auth/refresh`, the old refresh token is permanently invalidated. Always store the new pair.

---

## Endpoints

---

### \ud83d\udd13 POST `/auth/register`

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

### \ud83d\udd13 POST `/auth/login`

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

### \ud83d\udd13 POST `/auth/refresh`

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

### \ud83d\udd12 GET `/auth/me`

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

### \ud83d\udd12 POST `/auth/logout`

Revoke all refresh tokens for the user.

**Request:** No body needed.

**Response (200):**
```json
{ "success": true, "data": { "message": "Logged out successfully" } }
```

---

### \ud83d\udd12 POST `/auth/change-password`

Change the current user's password. Revokes all sessions.

**Request:**
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass456"
}
```

**Validation:** `newPassword` has the same rules as registration password.

**Response (200):**
```json
{ "success": true, "data": { "message": "Password changed. Please log in again." } }
```

**Errors:** `INVALID_PASSWORD`, `VALIDATION_ERROR`

> **Frontend note:** After success, clear stored tokens and redirect to login. All existing sessions are invalidated.

---

### \ud83d\udd12 POST `/auth/delete-account`

Permanently delete the user's account and all associated data.

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

> **Frontend note:** This is irreversible. Show a confirmation dialog. All data (profile, applications, resumes) is cascade-deleted.

---

### \ud83d\udd12 GET `/profile`

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
      "industries": ["technology", "fintech"],
      "locations": ["San Francisco", "Remote"]
    },
    "updatedAt": "2026-02-20T...",
    "experiences": [
      {
        "id": "uuid",
        "company": "TechCorp",
        "title": "Senior Developer",
        "location": "SF",
        "startDate": "2022-03-01T...",
        "endDate": null,
        "current": true,
        "description": "Led platform dev...",
        "sortOrder": 0
      }
    ],
    "educations": [...],
    "skills": [
      { "id": "uuid", "name": "TypeScript", "level": "EXPERT", "category": "programming" }
    ],
    "projects": [
      { "id": "uuid", "name": "MyApp", "description": "...", "url": "https://...", "techStack": ["React", "Node.js"], "sortOrder": 0 }
    ],
    "certifications": [...]
  }
}
```

**Returns `null` if no profile exists yet:**
```json
{ "success": true, "data": null }
```

---

### \ud83d\udd12 PUT `/profile`

Create or fully replace the user's profile (upsert). Transactional — all-or-nothing.

**Request:**
```json
{
  "fullName": "John Doe",
  "headline": "Full-Stack Developer",
  "summary": "Experienced developer...",
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
    "industries": ["technology"],
    "locations": ["Remote"]
  },
  "experiences": [
    {
      "company": "TechCorp",
      "title": "Senior Developer",
      "location": "SF",
      "startDate": "2022-03-01",
      "endDate": null,
      "current": true,
      "description": "Led platform dev..."
    }
  ],
  "educations": [],
  "skills": [
    { "name": "TypeScript", "level": "EXPERT", "category": "programming" }
  ],
  "projects": [],
  "certifications": []
}
```

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
| `description` (any) | 5000 chars |

> **Important:** This is a full replace operation. Always send the complete profile. Nested arrays are deleted and recreated.

**Response (200):** Full profile object (same as GET).

---

### \ud83d\udd12 DELETE `/profile`

Delete the entire profile and all nested data. Idempotent.

**Response (200):**
```json
{ "success": true, "data": { "message": "Profile deleted" } }
```

---

### \ud83d\udd12 GET `/profile/export`

Export the profile as JSON (for Chrome extension / external use).

**Response:** Same as GET /profile, but returns 404 if no profile.

**Errors:** `PROFILE_NOT_FOUND`

---

### \ud83d\udd13 GET `/jobs`

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
| `source` | string | — | Filter by job source |
| `sort` | enum | `date` | `date` \| `salary` \| `company` |

**Example:** `GET /jobs?search=react&remoteType=REMOTE&limit=10&sort=salary`

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
        "source": "seed",
        "sourceUrl": null,
        "applyUrl": "https://careers.google.com/...",
        "postedAt": "2026-02-18T...",
        "scrapedAt": "2026-02-20T...",
        "fingerprint": "senior-fe-google-mountainview",
        "isActive": true
      }
    ],
    "total": 3,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### \ud83d\udd13 GET `/jobs/:id`

Get a single job by UUID.

**Response (200):** Single job object.

**Errors:** `JOB_NOT_FOUND`, `INVALID_PARAM` (if ID isn't a UUID)

---

### \ud83d\udd12 GET `/applications`

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
        "matchScore": null,
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

---

### \ud83d\udd12 POST `/applications`

Create a new application (save a job).

**Request:**
```json
{
  "jobId": "uuid-of-the-job",
  "notes": "Looks like a great fit!"
}
```

**Validation:** `notes` max 5000 chars.

**Response (201):** Application object with nested `job`.

**Errors:** `ALREADY_APPLIED`, `VALIDATION_ERROR`

---

### \ud83d\udd12 PATCH `/applications/:id/status`

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

### \ud83d\udd12 PUT `/applications/:id/notes`

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

### \ud83d\udd12 DELETE `/applications/:id`

Delete an application and its associated resumes.

**Response (200):**
```json
{ "success": true, "data": { "message": "Application deleted" } }
```

**Errors:** `NOT_FOUND`, `INVALID_PARAM`

---

### \ud83d\udd12 GET `/applications/stats`

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

### \ud83d\udd12 GET `/resumes/:applicationId`

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
      "contentSnapshot": { ... },
      "generatedAt": "2026-02-20T..."
    }
  ]
}
```

**Errors:** `APPLICATION_NOT_FOUND`, `INVALID_PARAM`

---

### \ud83d\udd12 POST `/resumes`

Generate a new resume for an application.

**Request:**
```json
{
  "applicationId": "uuid-of-application",
  "template": "modern",
  "contentSnapshot": { "summary": "Custom summary..." }
}
```

**Templates available:** `modern` (default), `classic`, `minimal`

**Validation:**
- `contentSnapshot` max 50 keys, values max 10K chars each

**Response (201):** Resume object.

**Errors:** `APPLICATION_NOT_FOUND`, `VALIDATION_ERROR`

> **Note:** PDF generation is currently mocked. The `pdfUrl` returns a placeholder URL.

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| **Global** | 100 requests / 15 minutes per IP |
| **Auth routes** (`/auth/*`) | 20 requests / 15 minutes per IP |

When rate-limited, you'll receive:
```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many requests, please try again later."
  }
}
```

---

## TypeScript Types

These interfaces define the API contract. Both frontend and backend repos should share identical copies.

```typescript
// Auth
interface RegisterRequest { email: string; password: string; name: string; }
interface LoginRequest { email: string; password: string; }
interface AuthResponse { accessToken: string; refreshToken: string; user: UserPublic; }
interface UserPublic { id: string; email: string; name: string | null; avatarUrl: string | null; plan: "FREE" | "PRO" | "PREMIUM"; }

// Profile
interface ProfileData {
  fullName: string;
  headline?: string; summary?: string; phone?: string; location?: string;
  linkedinUrl?: string; githubUrl?: string; portfolioUrl?: string;
  preferences?: JobPreferences;
  experiences: ExperienceData[];
  educations: EducationData[];
  skills: SkillData[];
  projects: ProjectData[];
  certifications: CertificationData[];
}

// Jobs
interface JobListing {
  id: string; title: string; company: string; companyLogoUrl?: string;
  location?: string; remoteType?: "REMOTE" | "HYBRID" | "ONSITE";
  salaryMin?: number; salaryMax?: number; salaryCurrency?: string;
  description: string; requirements: string[];
  source: string; applyUrl: string; postedAt?: string; matchScore?: number;
}

// Applications
type ApplicationStatusType = "SAVED" | "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "ACCEPTED" | "DECLINED" | "REJECTED";

// API Wrappers
interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string; }; }
interface PaginatedResponse<T> { items: T[]; total: number; page: number; limit: number; totalPages: number; }
```

---

## Quick Setup for Frontend Dev

```bash
# In the API repo
docker compose up -d       # Start PostgreSQL + Redis
npx prisma db push         # Push schema
npm run db:seed            # Seed demo data
npm run dev                # API running at :3001
```

**Demo login:** `demo@jobpilot.dev` / `Test1234`
