import { prisma } from "../../db/index.js";
import { getAIClient } from "../ai/providers/index.js";
import type { StoryInput, GenerateStoriesInput } from "./stories.validation.js";

interface GeneratedStory {
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
    reflection: string;
    competencies: string[];
    tags: string[];
}

const STORY_SYSTEM_PROMPT = `You are an interview coach producing STAR+Reflection behavioral stories.

You will receive a candidate's profile experiences and a target job. Produce stories that the candidate can use during interviews for that job.

Respond with valid JSON of the shape:
{
  "stories": [
    {
      "title": "<short label, <= 80 chars>",
      "situation": "<2-4 sentences>",
      "task": "<1-3 sentences>",
      "action": "<3-6 sentences with specific decisions, trade-offs, technologies>",
      "result": "<2-4 sentences with quantified outcomes when possible>",
      "reflection": "<1-3 sentences on what was learned>",
      "competencies": ["<single tag from the fixed taxonomy>"],
      "tags": ["<free-form keywords>"]
    }
  ]
}

Taxonomy (use ONLY these for "competencies"):
[leadership, conflict, scope, ambiguity, technical-deep-dive, mentorship,
customer-empathy, prioritization, failure-recovery, growth]

Each story must be grounded in ONE of the candidate's experiences. Do not fabricate companies, projects, or metrics that aren't in the source experiences. If you can't ground a story, omit it.`;

export async function listStories(
    userId: string,
    opts: { competency?: string; tag?: string; q?: string; page: number; limit: number }
) {
    const where: any = { userId };
    if (opts.competency) where.competencies = { has: opts.competency };
    if (opts.tag) where.tags = { has: opts.tag };
    if (opts.q) {
        where.OR = [
            { title: { contains: opts.q, mode: "insensitive" } },
            { situation: { contains: opts.q, mode: "insensitive" } },
            { result: { contains: opts.q, mode: "insensitive" } },
        ];
    }

    const [items, total] = await Promise.all([
        prisma.interviewStory.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            skip: (opts.page - 1) * opts.limit,
            take: opts.limit,
        }),
        prisma.interviewStory.count({ where }),
    ]);

    return {
        items,
        total,
        page: opts.page,
        limit: opts.limit,
        totalPages: Math.ceil(total / opts.limit),
    };
}

export async function getStory(userId: string, id: string) {
    const story = await prisma.interviewStory.findFirst({ where: { id, userId } });
    if (!story) throw new Error("STORY_NOT_FOUND");
    return story;
}

export async function createStory(userId: string, input: StoryInput) {
    return prisma.interviewStory.create({
        data: {
            userId,
            title: input.title,
            situation: input.situation,
            task: input.task,
            action: input.action,
            result: input.result,
            reflection: input.reflection ?? null,
            competencies: input.competencies,
            tags: input.tags,
            isAiGenerated: false,
        },
    });
}

export async function updateStory(userId: string, id: string, input: Partial<StoryInput>) {
    const existing = await prisma.interviewStory.findFirst({ where: { id, userId } });
    if (!existing) throw new Error("STORY_NOT_FOUND");
    return prisma.interviewStory.update({
        where: { id },
        data: {
            ...(input.title !== undefined && { title: input.title }),
            ...(input.situation !== undefined && { situation: input.situation }),
            ...(input.task !== undefined && { task: input.task }),
            ...(input.action !== undefined && { action: input.action }),
            ...(input.result !== undefined && { result: input.result }),
            ...(input.reflection !== undefined && { reflection: input.reflection ?? null }),
            ...(input.competencies !== undefined && { competencies: input.competencies }),
            ...(input.tags !== undefined && { tags: input.tags }),
        },
    });
}

export async function deleteStory(userId: string, id: string) {
    const existing = await prisma.interviewStory.findFirst({ where: { id, userId } });
    if (!existing) throw new Error("STORY_NOT_FOUND");
    await prisma.interviewStory.delete({ where: { id } });
}

export async function generateStoriesFromApplication(
    userId: string,
    applicationId: string,
    opts: GenerateStoriesInput
) {
    const ai = await getAIClient(userId);
    if (!ai) throw new Error("AI_NOT_CONFIGURED");

    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
        include: { job: true },
    });
    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    const profile = await prisma.profile.findUnique({
        where: { userId },
        include: { experiences: true, skills: true },
    });
    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    const expFilter = opts.experienceIds && opts.experienceIds.length > 0
        ? profile.experiences.filter((e) => opts.experienceIds!.includes(e.id))
        : profile.experiences;

    if (expFilter.length === 0) throw new Error("PROFILE_HAS_NO_EXPERIENCES");

    const experiencesText = expFilter
        .map(
            (e, i) =>
                `[EXP ${i}] ${e.title} @ ${e.company} (${e.startDate.toISOString().slice(0, 10)} - ${e.endDate ? e.endDate.toISOString().slice(0, 10) : "present"}): ${e.description ?? "no description"}`
        )
        .join("\n");

    const skillsText = profile.skills.map((s) => s.name).slice(0, 30).join(", ");
    const job = application.job;
    const jobText = `Target role: "${job.title}" at ${job.company}.
Requirements: ${job.requirements.slice(0, 12).join(", ")}.
Description: ${job.description.substring(0, 1200)}`;

    const response = await ai.chatJSON<{ stories: GeneratedStory[] }>(
        [
            { role: "system", content: STORY_SYSTEM_PROMPT },
            {
                role: "user",
                content: `CANDIDATE EXPERIENCES:\n${experiencesText}\n\nCANDIDATE SKILLS: ${skillsText}\n\n${jobText}\n\nProduce ${opts.count} STAR+Reflection stories grounded in the experiences above.`,
            },
        ],
        { temperature: 0.4, maxTokens: 3500 }
    );

    if (!response || !Array.isArray(response.stories) || response.stories.length === 0) {
        throw new Error("STORY_GENERATION_FAILED");
    }

    const created = await prisma.$transaction(
        response.stories.map((s) =>
            prisma.interviewStory.create({
                data: {
                    userId,
                    title: (s.title || "Untitled").slice(0, 160),
                    situation: s.situation || "",
                    task: s.task || "",
                    action: s.action || "",
                    result: s.result || "",
                    reflection: s.reflection || null,
                    competencies: (s.competencies || []).slice(0, 8),
                    tags: (s.tags || []).slice(0, 15),
                    sourceApplicationId: applicationId,
                    isAiGenerated: true,
                },
            })
        )
    );

    return created;
}
