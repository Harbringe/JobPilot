import path from "path";
import os from "os";
import { promises as fs } from "fs";
import { prisma } from "../../db/index.js";
import { fillApplyForm, type ApplicantData } from "./autoapply.fillers.js";
import { detectAts } from "./autoapply.types.js";
import { generateAtsPdf } from "../resumes/pdf.service.js";
import { downloadObject } from "../../lib/supabase.js";

function dailyCap(): number {
    return Math.max(1, Number(process.env.AUTOAPPLY_DAILY_CAP ?? 20));
}

async function todaysCount(userId: string): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return prisma.autoApplyJob.count({
        where: { userId, createdAt: { gte: since } },
    });
}

function splitName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function materializeResumePdf(applicationId: string): Promise<string | null> {
    const resume = await prisma.resume.findFirst({
        where: { applicationId, atsPdfUrl: { not: null } },
        orderBy: { generatedAt: "desc" },
    });
    if (!resume?.atsPdfUrl) return null;
    const filename = path.basename(resume.atsPdfUrl);
    try {
        const buf = await downloadObject("resumes", filename);
        const tmp = path.join(os.tmpdir(), `jobpilot-${Date.now()}-${filename}`);
        await fs.writeFile(tmp, buf);
        return tmp;
    } catch (err) {
        console.warn("autoapply: resume materialize failed:", (err as Error).message);
        return null;
    }
}

export async function startAutoApply(userId: string, applicationId: string) {
    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
        include: { job: true },
    });
    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    const ats = detectAts(application.job.applyUrl);
    if (ats === "unknown") throw new Error("AUTOAPPLY_NOT_SUPPORTED");

    const used = await todaysCount(userId);
    if (used >= dailyCap()) throw new Error("AUTOAPPLY_DAILY_CAP");

    const profile = await prisma.profile.findUnique({
        where: { userId },
        include: { user: true },
    });
    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    let resumePdfPath = await materializeResumePdf(applicationId);
    if (!resumePdfPath) {
        try {
            await generateAtsPdf(userId, applicationId, false);
            resumePdfPath = await materializeResumePdf(applicationId);
        } catch (err) {
            console.warn("auto-apply: tailor-on-the-fly failed:", (err as Error).message);
        }
        if (!resumePdfPath) throw new Error("AUTOAPPLY_RESUME_MISSING");
    }

    // Create the task row up front so a polling client can find it
    const task = await prisma.autoApplyJob.create({
        data: {
            userId,
            applicationId,
            status: "FILLING",
            ats,
            applyUrl: application.job.applyUrl,
            reviewUrl: application.job.applyUrl,
        },
    });

    // Run async; don't block the response
    setImmediate(async () => {
        try {
            const { firstName, lastName } = splitName(profile.fullName);
            const applicant: ApplicantData = {
                fullName: profile.fullName,
                firstName,
                lastName,
                email: profile.user.email,
                phone: profile.phone,
                location: profile.location,
                linkedinUrl: profile.linkedinUrl,
                githubUrl: profile.githubUrl,
                portfolioUrl: profile.portfolioUrl,
                resumePdfPath,
            };

            const kit = await fillApplyForm({
                ats,
                applyUrl: application.job.applyUrl,
                applicant,
                taskId: task.id,
            });

            await prisma.autoApplyJob.update({
                where: { id: task.id },
                data: {
                    status: kit.blocked ? "BLOCKED" : "READY_FOR_REVIEW",
                    blockedReason: kit.blockedReason ?? null,
                    filledFields: kit.fields as any,
                    screenshotUrl: kit.screenshotUrl,
                    finishedAt: new Date(),
                },
            });
        } catch (err) {
            console.error("auto-apply task failed:", (err as Error).message);
            await prisma.autoApplyJob.update({
                where: { id: task.id },
                data: {
                    status: "FAILED",
                    errors: { message: (err as Error).message } as any,
                    finishedAt: new Date(),
                },
            });
        } finally {
            if (resumePdfPath) {
                fs.unlink(resumePdfPath).catch(() => {});
            }
        }
    });

    return task;
}

export async function getAutoApply(userId: string, id: string) {
    const task = await prisma.autoApplyJob.findFirst({
        where: { id, userId },
        include: { application: { include: { job: true } } },
    });
    if (!task) throw new Error("AUTOAPPLY_NOT_FOUND");
    return task;
}

export async function listAutoApply(userId: string, applicationId?: string) {
    return prisma.autoApplyJob.findMany({
        where: { userId, ...(applicationId ? { applicationId } : {}) },
        include: { application: { include: { job: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
    });
}
