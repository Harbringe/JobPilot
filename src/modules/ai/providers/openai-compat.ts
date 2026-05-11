import type { AIClient, AiProviderName, ChatMessage, ChatOptions } from "./types.js";

interface OpenAiResponse {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * OpenAI-compatible client. Used for OpenAI proper, Groq, OpenRouter, Together,
 * vLLM, Codex API endpoints — anything with /chat/completions.
 */
export function makeOpenAiCompatClient(args: {
    provider: AiProviderName;
    apiKey: string;
    model: string;
    baseUrl: string;
}): AIClient {
    const { provider, apiKey, model, baseUrl } = args;

    async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
        const { temperature = 0.3, maxTokens = 2000, json = false } = opts;
        const body: Record<string, unknown> = {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
        };
        if (json) body.response_format = { type: "json_object" };

        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = await res.text();
                if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
                    await new Promise((r) => setTimeout(r, 800));
                    continue;
                }
                throw new Error(`${provider} API ${res.status}: ${text.slice(0, 500)}`);
            }
            const data = (await res.json()) as OpenAiResponse;
            return data.choices[0]?.message?.content ?? "";
        }
        throw new Error(`${provider} API: retries exhausted`);
    }

    async function chatJSON<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T | null> {
        try {
            const text = await chat(messages, { ...opts, json: true });
            return JSON.parse(text) as T;
        } catch (err) {
            console.error(`❌ ${provider} chatJSON failed:`, (err as Error).message);
            return null;
        }
    }

    return { provider, model, chat, chatJSON };
}
