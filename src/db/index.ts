export { PrismaClient } from "@prisma/client";
export type {
    User,
    Profile,
    WorkExperience,
    Education,
    Skill,
    Project,
    Certification,
    Job,
    Application,
    Resume,
    RefreshToken,
} from "@prisma/client";

export {
    Plan,
    SkillLevel,
    RemoteType,
    ApplicationStatus,
} from "@prisma/client";

import { PrismaClient } from "@prisma/client";

// Singleton pattern for dev (avoids multiple instances with hot reload)
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
