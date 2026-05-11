import type { AIClient, ChatMessage, ChatOptions } from "./types.js";

interface AnthropicResponse {
    content: Array<{ type: string; text?: string }>;
    stop_reason?: string;
    usage?: { input_tokens: number; output_tokens: number };
}

/**
 * Anthropic Claude client (Messages API).
 * Anthropic doesn't have a generic JSON mode like OpenAI/Groq, so we instruct
 * via the system prompt and parse manually.
 */
export function makeAnthropicClient(args: {
    apiKey: string;
    model: string;
    baseUrl: string;
}): AIClient {
    const { apiKey, model, baseUrl } = args;

    function splitSystem(messages: ChatMessage[]): { system: string; convo: ChatMessage[] } {
        const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
        const convo = messages.filter((m) => m.role !== "system");
        return { system, convo };
    }

    async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
        const { temperature = 0.3, maxTokens = 2000, json = false } = opts;
        const { system, convo } = splitSystem(messages);

        const body: Record<string, unknown> = {
            model,
            max_tokens: maxTokens,
            temperature,
            system: json
                ? `${system}\n\nIMPORTANT: respond ONLY with valid JSON. Do not wrap in markdown code fences. Do not add commentary.`
                : system,
            messages: convo.map((m) => ({ role: m.role, content: m.content })),
        };

        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(`${baseUrl}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = await res.text();
                if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
                    await new Promise((r) => setTimeout(r, 800));
                    continue;
                }
                throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 500)}`);
            }
            const data = (await res.json()) as AnthropicResponse;
            return data.content?.find((c) => c.type === "text")?.text ?? "";
        }
        throw new Error("Anthropic API: retries exhausted");
    }

    async function chatJSON<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T | null> {
        try {
            const raw = await chat(messages, { ...opts, json: true });
            // Strip ```json fences if Claude added them anyway
            const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
            return JSON.parse(cleaned) as T;
        } catch (err) {
            console.error("❌ Anthropic chatJSON failed:", (err as Error).message);
            return null;
        }
    }

    return { provider: "ANTHROPIC", model, chat, chatJSON };
}
