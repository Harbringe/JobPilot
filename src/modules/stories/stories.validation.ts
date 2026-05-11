import { z } from "zod";

const COMPETENCY_VALUES = [
    "leadership",
    "conflict",
    "scope",
    "ambiguity",
    "technical-deep-dive",
    "mentorship",
    "customer-empathy",
    "prioritization",
    "failure-recovery",
    "growth",
] as const;

export const competencyEnum = z.enum(COMPETENCY_VALUES);

export const storyInputSchema = z.object({
    title: z.string().min(2).max(160),
    situation: z.string().min(10).max(4000),
    task: z.string().min(10).max(4000),
    action: z.string().min(10).max(8000),
    result: z.string().min(10).max(4000),
    reflection: z.string().max(4000).optional().nullable(),
    competencies: z.array(competencyEnum).max(8).default([]),
    tags: z.array(z.string().min(1).max(40)).max(15).default([]),
});

export const storyUpdateSchema = storyInputSchema.partial();

export const listStoriesQuerySchema = z.object({
    competency: z.string().optional(),
    tag: z.string().optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const generateStoriesSchema = z.object({
    experienceIds: z.array(z.string().uuid()).max(20).optional(),
    count: z.number().int().min(1).max(8).default(4),
});

export type StoryInput = z.infer<typeof storyInputSchema>;
export type StoryUpdate = z.infer<typeof storyUpdateSchema>;
export type GenerateStoriesInput = z.infer<typeof generateStoriesSchema>;
