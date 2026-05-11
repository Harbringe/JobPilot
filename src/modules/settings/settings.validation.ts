import { z } from "zod";

export const aiProviderEnum = z.enum(["GROQ", "ANTHROPIC", "GEMINI", "OPENAI"]);

export const updateAiConfigSchema = z.object({
    provider: aiProviderEnum,
    apiKey: z.string().min(8).max(500).optional(), // omit to keep existing
    model: z.string().min(1).max(120).optional(),
    baseUrl: z.string().url().max(300).optional(),
});

export const testAiConfigSchema = z.object({
    provider: aiProviderEnum,
    apiKey: z.string().min(8).max(500),
    model: z.string().min(1).max(120).optional(),
    baseUrl: z.string().url().max(300).optional(),
});

export type UpdateAiConfigInput = z.infer<typeof updateAiConfigSchema>;
export type TestAiConfigInput = z.infer<typeof testAiConfigSchema>;
