import { prisma } from "../../db/index.js";
import { Prisma } from "@prisma/client";
import type { ProfileData } from "../../types/index.js";

// ─── Get Profile ───────────────────────
export async function getProfile(userId: string) {
    return prisma.profile.findUnique({
        where: { userId },
        include: {
            experiences: { orderBy: { sortOrder: "asc" } },
            educations: { orderBy: { sortOrder: "asc" } },
            skills: true,
            projects: { orderBy: { sortOrder: "asc" } },
            certifications: true,
        },
    });
}

// ─── Upsert Profile ───────────────────
export async function upsertProfile(userId: string, data: ProfileData) {
    // Use a transaction to replace all nested entities atomically
    return prisma.$transaction(async (tx) => {
        // Upsert the profile itself
        const profile = await tx.profile.upsert({
            where: { userId },
            create: {
                userId,
                fullName: data.fullName,
                headline: data.headline,
                summary: data.summary,
                phone: data.phone,
                location: data.location,
                linkedinUrl: data.linkedinUrl,
                githubUrl: data.githubUrl,
                portfolioUrl: data.portfolioUrl,
                preferences: data.preferences as Prisma.InputJsonValue ?? Prisma.JsonNull,
            },
            update: {
                fullName: data.fullName,
                headline: data.headline,
                summary: data.summary,
                phone: data.phone,
                location: data.location,
                linkedinUrl: data.linkedinUrl,
                githubUrl: data.githubUrl,
                portfolioUrl: data.portfolioUrl,
                preferences: data.preferences as Prisma.InputJsonValue ?? Prisma.JsonNull,
            },
        });

        // Replace experiences
        await tx.workExperience.deleteMany({ where: { profileId: profile.id } });
        if (data.experiences.length > 0) {
            await tx.workExperience.createMany({
                data: data.experiences.map((exp, i) => ({
                    profileId: profile.id,
                    company: exp.company,
                    title: exp.title,
                    location: exp.location,
                    startDate: new Date(exp.startDate),
                    endDate: exp.endDate ? new Date(exp.endDate) : null,
                    current: exp.current,
                    description: exp.description,
                    sortOrder: i,
                })),
            });
        }

        // Replace educations
        await tx.education.deleteMany({ where: { profileId: profile.id } });
        if (data.educations.length > 0) {
            await tx.education.createMany({
                data: data.educations.map((edu, i) => ({
                    profileId: profile.id,
                    institution: edu.institution,
                    degree: edu.degree,
                    field: edu.field,
                    startDate: new Date(edu.startDate),
                    endDate: edu.endDate ? new Date(edu.endDate) : null,
                    gpa: edu.gpa,
                    description: edu.description,
                    sortOrder: i,
                })),
            });
        }

        // Replace skills
        await tx.skill.deleteMany({ where: { profileId: profile.id } });
        if (data.skills.length > 0) {
            await tx.skill.createMany({
                data: data.skills.map((skill) => ({
                    profileId: profile.id,
                    name: skill.name,
                    level: skill.level,
                    category: skill.category,
                })),
            });
        }

        // Replace projects
        await tx.project.deleteMany({ where: { profileId: profile.id } });
        if (data.projects.length > 0) {
            await tx.project.createMany({
                data: data.projects.map((proj, i) => ({
                    profileId: profile.id,
                    name: proj.name,
                    description: proj.description,
                    url: proj.url || null,
                    techStack: proj.techStack,
                    sortOrder: i,
                })),
            });
        }

        // Replace certifications
        await tx.certification.deleteMany({ where: { profileId: profile.id } });
        if (data.certifications.length > 0) {
            await tx.certification.createMany({
                data: data.certifications.map((cert) => ({
                    profileId: profile.id,
                    name: cert.name,
                    issuer: cert.issuer,
                    issueDate: cert.issueDate ? new Date(cert.issueDate) : null,
                    expiryDate: cert.expiryDate ? new Date(cert.expiryDate) : null,
                    url: cert.url || null,
                })),
            });
        }

        // Return full profile with relations
        return tx.profile.findUnique({
            where: { id: profile.id },
            include: {
                experiences: { orderBy: { sortOrder: "asc" } },
                educations: { orderBy: { sortOrder: "asc" } },
                skills: true,
                projects: { orderBy: { sortOrder: "asc" } },
                certifications: true,
            },
        });
    });
}

// ─── Delete Profile ───────────────────
export async function deleteProfile(userId: string) {
    try {
        await prisma.profile.delete({ where: { userId } });
    } catch (err) {
        // P2025 = Record not found — that's fine (already deleted)
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
            return;
        }
        throw err; // Re-throw actual errors (DB failures, etc.)
    }
}
