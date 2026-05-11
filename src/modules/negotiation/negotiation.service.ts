import { prisma } from "../../db/index.js";
import { getAIClient } from "../ai/providers/index.js";
import { getPrompt } from "./negotiation.prompts.js";
import type { GenerateNegotiationInput } from "./negotiation.validation.js";

interface AiScript {
    title: string;
    subject: string;
    body: string;
    talkingPoints: string[];
    suggestedCounter: {
        base: number | null;
        equity: string | null;
        total: string | null;
    } | null;
}

export async function listNegotiations(
    userId: string,
    opts: { applicationId?: string; page: number; limit: number }
) {
    const where: any = { userId };
    if (opts.applicationId) where.applicationId = opts.applicationId;

    const [items, total] = await Promise.all([
        prisma.negotiationScript.findMany({
            where,
            include: {
                application: { include: { job: true } },
            },
            orderBy: { generatedAt: "desc" },
            skip: (opts.page - 1) * opts.limit,
            take: opts.limit,
        }),
        prisma.negotiationScript.count({ where }),
    ]);

    return {
        items,
        total,
        page: opts.page,
        limit: opts.limit,
        totalPages: Math.ceil(total / opts.limit),
    };
}

export async function generateScript(userId: string, input: GenerateNegotiationInput) {
    const ai = await getAIClient(userId);
    if (!ai) throw new Error("AI_NOT_CONFIGURED");

    const application = await prisma.application.findFirst({
        where: { id: input.applicationId, userId },
        include: { job: true },
    });
    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    const profile = await prisma.profile.findUnique({
        where: { userId },
        include: { skills: true, experiences: true },
    });
    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    const evaluation = await prisma.jobEvaluation.findUnique({
        where: { userId_jobId: { userId, jobId: application.jobId } },
    });

    const compResearchHint = evaluation
        ? `\nMARKET COMPENSATION RESEARCH (from prior evaluation):\n${JSON.stringify(evaluation.compensationResearch, null, 2)}`
        : "";

    const job = application.job;
    const profileSummary = `Candidate: ${profile.fullName}, ${profile.headline ?? ""}, location ${profile.location ?? "N/A"}.
Top skills: ${profile.skills.slice(0, 12).map((s) => s.name).join(", ")}.
Total roles: ${profile.experiences.length}. Most recent: ${profile.experiences[0]?.title ?? "N/A"} @ ${profile.experiences[0]?.company ?? "N/A"}.`;

    const jobSummary = `Role: "${job.title}" at ${job.company}, ${job.location ?? "N/A"} (${job.remoteType ?? "N/A"}). JD-stated salary: ${job.salaryMin ?? "?"}-${job.salaryMax ?? "?"} ${job.salaryCurrency ?? ""}.`;
    const userContext = `OFFER / CANDIDATE CONTEXT:\n${JSON.stringify(input.context, null, 2)}`;

    const sys = getPrompt(input.type);
    const result = await ai.chatJSON<AiScript>(
        [
            { role: "system", content: sys },
            { role: "user", content: `${profileSummary}\n\n${jobSummary}${compResearchHint}\n\n${userContext}\n\nProduce the negotiation email.` },
        ],
        { temperature: 0.4, maxTokens: 1800 }
    );

    if (!result || typeof result.body !== "string" || result.body.length < 30) {
        throw new Error("NEGOTIATION_GENERATION_FAILED");
    }

    const safeContext: any = {
        ...input.context,
        suggestedCounter: result.suggestedCounter ?? null,
        talkingPoints: result.talkingPoints ?? [],
        subject: result.subject ?? "",
    };

    return prisma.negotiationScript.create({
        data: {
            userId,
            applicationId: input.applicationId,
            type: input.type,
            title: (result.title || `${input.type} script`).slice(0, 200),
            content: result.body,
            context: safeContext,
        },
    });
}

export async function deleteNegotiation(userId: string, id: string) {
    const existing = await prisma.negotiationScript.findFirst({ where: { id, userId } });
    if (!existing) throw new Error("NEGOTIATION_NOT_FOUND");
    await prisma.negotiationScript.delete({ where: { id } });
}
