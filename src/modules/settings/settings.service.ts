import { prisma } from "../../db/index.js";
import { encryptSecret } from "../../lib/crypto.js";
import { PROVIDER_DEFAULTS } from "../ai/providers/types.js";
import { makeOpenAiCompatClient } from "../ai/providers/openai-compat.js";
import { makeAnthropicClient } from "../ai/providers/anthropic.js";
import { makeGeminiClient } from "../ai/providers/gemini.js";
import type { UpdateAiConfigInput, TestAiConfigInput } from "./settings.validation.js";

export async function getAiConfig(userId: string) {
    const cfg = await prisma.userAiConfig.findUnique({ where: { userId } });
    if (!cfg) {
        return {
            provider: null,
            model: null,
            baseUrl: null,
            hasKey: false,
            updatedAt: null,
        };
    }
    return {
        provider: cfg.provider,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        hasKey: cfg.hasKey,
        updatedAt: cfg.updatedAt,
    };
}

export async function updateAiConfig(userId: string, input: UpdateAiConfigInput) {
    const existing = await prisma.userAiConfig.findUnique({ where: { userId } });
    const data: any = {
        provider: input.provider,
        model: input.model ?? existing?.model ?? PROVIDER_DEFAULTS[input.provider].model,
        baseUrl: input.baseUrl ?? existing?.baseUrl ?? null,
    };
    if (input.apiKey) {
        data.apiKeyEncrypted = encryptSecret(input.apiKey);
        data.hasKey = true;
    } else if (!existing) {
        // First-time save without a key — refuse, since the config is useless
        throw new Error("AI_KEY_REQUIRED");
    }

    return prisma.userAiConfig.upsert({
        where: { userId },
        create: { userId, hasKey: !!input.apiKey, ...data },
        update: data,
    });
}

export async function deleteAiConfig(userId: string) {
    await prisma.userAiConfig.deleteMany({ where: { userId } });
}

/**
 * Send a tiny test prompt directly using the supplied credentials WITHOUT persisting them.
 * Lets the frontend "Test connection" before saving.
 */
export async function testAiConfig(input: TestAiConfigInput): Promise<{ ok: boolean; message: string; sample?: string }> {
    const defaults = PROVIDER_DEFAULTS[input.provider];
    const model = input.model ?? defaults.model;
    const baseUrl = input.baseUrl ?? defaults.baseUrl;

    let client;
    if (input.provider === "ANTHROPIC") {
        client = makeAnthropicClient({ apiKey: input.apiKey, model, baseUrl });
    } else if (input.provider === "GEMINI") {
        client = makeGeminiClient({ apiKey: input.apiKey, model, baseUrl });
    } else {
        client = makeOpenAiCompatClient({ provider: input.provider, apiKey: input.apiKey, model, baseUrl });
    }

    try {
        const reply = await client.chat(
            [
                { role: "system", content: "Reply in fewer than 10 words." },
                { role: "user", content: "Say hi and name the model you are." },
            ],
            { temperature: 0, maxTokens: 32 }
        );
        return { ok: true, message: "Connected", sample: reply.slice(0, 200) };
    } catch (err) {
        return { ok: false, message: (err as Error).message ?? "Unknown failure" };
    }
}
