# JobPilot API 🚀

The backend REST API for JobPilot — an AI-powered job automation platform.

## Tech Stack
- **Runtime:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (with `pgvector`) via Prisma ORM
- **Auth:** JWT access tokens + SHA-256 hashed refresh tokens
- **Security:** Helmet, CORS, express-rate-limit, Zod validation

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL & Redis
docker compose up -d

# 3. Push database schema
npx prisma db push

# 4. Seed demo data
npm run db:seed

# 5. Start the dev server
npm run dev
```

The API will be running at **http://localhost:3001**.

## Demo Credentials
- **Email:** `demo@jobpilot.dev`
- **Password:** `Test1234`

## API Endpoints

### Auth (`/auth`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ✗ | Register a new user |
| POST | `/auth/login` | ✗ | Login and get tokens |
| POST | `/auth/refresh` | ✗ | Refresh access token |
| GET | `/auth/me` | ✓ | Get current user |
| POST | `/auth/logout` | ✓ | Logout (revoke tokens) |

### Profile (`/profile`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/profile` | ✓ | Get user profile |
| PUT | `/profile` | ✓ | Create/update profile |
| DELETE | `/profile` | ✓ | Delete profile |
| GET | `/profile/export` | ✓ | Export profile as JSON |

### Jobs (`/jobs`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/jobs` | ✗ | List/search jobs |
| GET | `/jobs/:id` | ✗ | Get job by ID |

### Applications (`/applications`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/applications` | ✓ | List user applications |
| POST | `/applications` | ✓ | Create application |
| PATCH | `/applications/:id/status` | ✓ | Update status |
| PUT | `/applications/:id/notes` | ✓ | Update notes |
| GET | `/applications/stats` | ✓ | Get aggregated stats |

### Resumes (`/resumes`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resumes/:applicationId` | ✓ | Get resumes for application |
| POST | `/resumes` | ✓ | Generate a new resume |

## Project Structure
```
jobpilot-api/
├── prisma/schema.prisma    # Database schema
├── src/
│   ├── index.ts            # Express entrypoint
│   ├── seed.ts             # Database seeder
│   ├── db/                 # Prisma client singleton
│   ├── types/              # TypeScript interfaces
│   ├── middleware/          # Auth, validation, error handling
│   └── modules/            # Feature modules
│       ├── auth/
│       ├── profile/
│       ├── applications/
│       ├── jobs/
│       └── resumes/
├── docker-compose.yml      # PostgreSQL + Redis
├── package.json
└── tsconfig.json
```

## Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled production build |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio GUI |
