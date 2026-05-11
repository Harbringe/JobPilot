import { prisma } from "../../db/index.js";
import { getAIClient } from "../ai/providers/index.js";
import { EVALUATION_SYSTEM_PROMPT } from "./evaluation.prompts.js";
import type { BlockName, EvaluationBlocks } from "./evaluation.types.js";

const CACHE_TTL_DAYS = 7;

function isFresh(generatedAt: Date): boolean {
    const ageMs = Date.now() - generatedAt.getTime();
    return ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function buildProfileText(profile: {
    fullName: string;
    headline: string | null;
    summary: string | null;
    location: string | null;
    preferences: any;
    experiences: Array<{
        title: string;
        company: string;
        location: string | null;
        startDate: Date;
        endDate: Date | null;
        current: boolean;
        description: string | null;
    }>;
    educations: Array<{ institution: string; degree: string; field: string | null }>;
    skills: Array<{ name: string; level: string; category: string | null }>;
}): string {
    const totalYOE = profile.experiences.reduce((acc, exp) => {
        const start = exp.startDate.getTime();
        const end = exp.endDate ? exp.endDate.getTime() : Date.now();
        return acc + (end - start) / (365.25 * 24 * 60 * 60 * 1000);
    }, 0);

    const expBlock = profile.experiences
        .map(
            (e) =>
                `  - ${e.title} @ ${e.company} (${e.startDate.toISOString().slice(0, 7)} - ${e.endDate ? e.endDate.toISOString().slice(0, 7) : "present"})${e.location ? ` [${e.location}]` : ""}: ${e.description ?? "no description"}`
        )
        .join("\n");

    const eduBlock = profile.educations
        .map((e) => `  - ${e.degree}${e.field ? ` in ${e.field}` : ""} @ ${e.institution}`)
        .join("\n");

    const skillsBlock = profile.skills.map((s) => `${s.name}(${s.level})`).join(", ");

    return `CANDIDATE: ${profile.fullName}
Headline: ${profile.headline ?? "N/A"}
Location: ${profile.location ?? "N/A"}
Total YOE: ${totalYOE.toFixed(1)}
Summary: ${profile.summary ?? "N/A"}

Experience:
${expBlock || "  (none)"}

Education:
${eduBlock || "  (none)"}

Skills: ${skillsBlock || "(none)"}

Preferences: ${profile.preferences ? JSON.stringify(profile.preferences) : "None"}`;
}

function buildJobText(job: {
    title: string;
    company: string;
    location: string | null;
    remoteType: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    description: string;
    requirements: string[];
}): string {
    const salary = job.salaryMin || job.salaryMax
        ? `${job.salaryMin ?? "?"}-${job.salaryMax ?? "?"} ${job.salaryCurrency ?? ""}`
        : "not disclosed";
    return `JOB: "${job.title}" at ${job.company}
Location: ${job.location ?? "N/A"} (${job.remoteType ?? "N/A"})
Salary: ${salary}
Requirements: ${job.requirements.slice(0, 20).join(", ")}
Description:
${job.description.substring(0, 4000)}`;
}

export async function generateEvaluation(
    userId: string,
    jobId: string,
    applicationId: string | undefined,
    regenerate: boolean
) {
    const ai = await getAIClient(userId);
    if (!ai) throw new Error("AI_NOT_CONFIGURED");

    const existing = await prisma.jobEvaluation.findUnique({
        where: { userId_jobId: { userId, jobId } },
    });
    if (existing && !regenerate && isFresh(existing.generatedAt)) {
        return existing;
    }

    const [job, profile, jobScore] = await Promise.all([
        prisma.job.findUnique({ where: { id: jobId } }),
        prisma.profile.findUnique({
            where: { userId },
            include: { experiences: true, educations: true, skills: true },
        }),
        prisma.jobScore.findUnique({ where: { userId_jobId: { userId, jobId } } }),
    ]);

    if (!job) throw new Error("JOB_NOT_FOUND");
    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    if (applicationId) {
        const owns = await prisma.application.findFirst({
            where: { id: applicationId, userId, jobId },
            select: { id: true },
        });
        if (!owns) throw new Error("APPLICATION_NOT_FOUND");
    }

    const profileText = buildProfileText(profile);
    const jobText = buildJobText(job);
    const scoreHint = jobScore
        ? `\n\nPrior AI match score: matchScore=${jobScore.matchScore}, skillMatch=${jobScore.skillMatch}. Strong points: ${jobScore.strongPoints.join("; ")}. Missing skills: ${jobScore.missingSkills.join("; ")}.`
        : "";

    const blocks = await ai.chatJSON<EvaluationBlocks>(
        [
            { role: "system", content: EVALUATION_SYSTEM_PROMPT },
            { role: "user", content: `${profileText}\n\n---\n\n${jobText}${scoreHint}` },
        ],
        { temperature: 0.3, maxTokens: 4500 }
    );

    if (!blocks || typeof blocks !== "object") throw new Error("EVALUATION_PARSE_FAILED");

    const required: BlockName[] = [
        "roleSummary",
        "cvMatchAssessment",
        "levelStrategy",
        "compensationResearch",
        "personalization",
        "interviewPrep",
    ];
    for (const k of required) {
        if (!(k in blocks) || blocks[k] === null || typeof blocks[k] !== "object") {
            throw new Error("EVALUATION_PARSE_FAILED");
        }
    }

    return prisma.jobEvaluation.upsert({
        where: { userId_jobId: { userId, jobId } },
        create: {
            userId,
            jobId,
            applicationId: applicationId ?? null,
            roleSummary: blocks.roleSummary as any,
            cvMatchAssessment: blocks.cvMatchAssessment as any,
            levelStrategy: blocks.levelStrategy as any,
            compensationResearch: blocks.compensationResearch as any,
            personalization: blocks.personalization as any,
            interviewPrep: blocks.interviewPrep as any,
            model: ai.model,
        },
        update: {
            applicationId: applicationId ?? null,
            roleSummary: blocks.roleSummary as any,
            cvMatchAssessment: blocks.cvMatchAssessment as any,
            levelStrategy: blocks.levelStrategy as any,
            compensationResearch: blocks.compensationResearch as any,
            personalization: blocks.personalization as any,
            interviewPrep: blocks.interviewPrep as any,
            model: ai.model,
        },
    });
}

export async function getEvaluationByJob(userId: string, jobId: string) {
    return prisma.jobEvaluation.findUnique({
        where: { userId_jobId: { userId, jobId } },
    });
}

export async function listEvaluations(
    userId: string,
    opts: { applicationId?: string; page: number; limit: number }
) {
    const where: any = { userId };
    if (opts.applicationId) where.applicationId = opts.applicationId;

    const [items, total] = await Promise.all([
        prisma.jobEvaluation.findMany({
            where,
            include: { job: true },
            orderBy: { generatedAt: "desc" },
            skip: (opts.page - 1) * opts.limit,
            take: opts.limit,
        }),
        prisma.jobEvaluation.count({ where }),
    ]);

    return {
        items,
        total,
        page: opts.page,
        limit: opts.limit,
        totalPages: Math.ceil(total / opts.limit),
    };
}

export async function updateBlock(
    userId: string,
    id: string,
    blockName: BlockName,
    content: unknown
) {
    const evaluation = await prisma.jobEvaluation.findFirst({ where: { id, userId } });
    if (!evaluation) throw new Error("EVALUATION_NOT_FOUND");

    return prisma.jobEvaluation.update({
        where: { id },
        data: { [blockName]: content as any },
    });
}

export async function deleteEvaluation(userId: string, id: string) {
    const evaluation = await prisma.jobEvaluation.findFirst({ where: { id, userId } });
    if (!evaluation) throw new Error("EVALUATION_NOT_FOUND");
    await prisma.jobEvaluation.delete({ where: { id } });
}
