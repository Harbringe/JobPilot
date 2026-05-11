import { prisma } from "../../../db/index.js";
import { decryptSecret } from "../../../lib/crypto.js";
import type { AIClient, AiProviderName } from "./types.js";
import { PROVIDER_DEFAULTS } from "./types.js";
import { makeOpenAiCompatClient } from "./openai-compat.js";
import { makeAnthropicClient } from "./anthropic.js";
import { makeGeminiClient } from "./gemini.js";

export type { AIClient, ChatMessage, ChatOptions, AiProviderName } from "./types.js";

interface ResolvedConfig {
    provider: AiProviderName;
    apiKey: string;
    model: string;
    baseUrl: string;
}

function envFallback(): ResolvedConfig | null {
    const provider = (process.env.AI_PROVIDER as AiProviderName | undefined) ?? "GROQ";
    const defaults = PROVIDER_DEFAULTS[provider];
    if (!defaults) return null;

    const keyEnv: Record<AiProviderName, string | undefined> = {
        GROQ: process.env.GROQ_API_KEY,
        ANTHROPIC: process.env.ANTHROPIC_API_KEY,
        GEMINI: process.env.GEMINI_API_KEY,
        OPENAI: process.env.OPENAI_API_KEY,
    };
    const apiKey = keyEnv[provider];
    if (!apiKey) return null;

    const modelEnv: Record<AiProviderName, string | undefined> = {
        GROQ: process.env.GROQ_MODEL,
        ANTHROPIC: process.env.ANTHROPIC_MODEL,
        GEMINI: process.env.GEMINI_MODEL,
        OPENAI: process.env.OPENAI_MODEL,
    };
    const baseUrlEnv: Record<AiProviderName, string | undefined> = {
        GROQ: process.env.GROQ_BASE_URL,
        ANTHROPIC: process.env.ANTHROPIC_BASE_URL,
        GEMINI: process.env.GEMINI_BASE_URL,
        OPENAI: process.env.OPENAI_BASE_URL,
    };

    return {
        provider,
        apiKey,
        model: modelEnv[provider] ?? defaults.model,
        baseUrl: baseUrlEnv[provider] ?? defaults.baseUrl,
    };
}

async function userConfig(userId: string): Promise<ResolvedConfig | null> {
    const cfg = await prisma.userAiConfig.findUnique({ where: { userId } });
    if (!cfg || !cfg.apiKeyEncrypted) return null;
    const defaults = PROVIDER_DEFAULTS[cfg.provider];
    let apiKey: string;
    try {
        apiKey = decryptSecret(cfg.apiKeyEncrypted);
    } catch (err) {
        console.error("AI key decrypt failed for user", userId, (err as Error).message);
        return null;
    }
    return {
        provider: cfg.provider as AiProviderName,
        apiKey,
        model: cfg.model ?? defaults.model,
        baseUrl: cfg.baseUrl ?? defaults.baseUrl,
    };
}

function build(cfg: ResolvedConfig): AIClient {
    switch (cfg.provider) {
        case "ANTHROPIC":
            return makeAnthropicClient({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl });
        case "GEMINI":
            return makeGeminiClient({ apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl });
        case "GROQ":
        case "OPENAI":
        default:
            return makeOpenAiCompatClient({
                provider: cfg.provider,
                apiKey: cfg.apiKey,
                model: cfg.model,
                baseUrl: cfg.baseUrl,
            });
    }
}

/**
 * Resolves the AI client to use for a given user. Order of precedence:
 *   1. User's UserAiConfig (encrypted key)
 *   2. Server env fallback (AI_PROVIDER + matching *_API_KEY)
 * Returns null if no provider is configured for this user.
 */
export async function getAIClient(userId: string): Promise<AIClient | null> {
    const cfg = (await userConfig(userId)) ?? envFallback();
    if (!cfg) return null;
    return build(cfg);
}

export async function isAIConfigured(userId: string): Promise<boolean> {
    return (await getAIClient(userId)) !== null;
}

export async function getCurrentProviderName(userId: string): Promise<{ source: "user" | "env" | null; provider: AiProviderName | null; model: string | null }> {
    const u = await userConfig(userId);
    if (u) return { source: "user", provider: u.provider, model: u.model };
    const e = envFallback();
    if (e) return { source: "env", provider: e.provider, model: e.model };
    return { source: null, provider: null, model: null };
}
