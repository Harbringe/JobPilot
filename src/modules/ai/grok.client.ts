/**
 * Grok (xAI) API Client — OpenAI-compatible.
 * Uses the /v1/chat/completions endpoint.
 */

const GROK_BASE_URL = "https://api.x.ai/v1";
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_MODEL = process.env.GROK_MODEL || "grok-3-fast";

export function isGrokConfigured(): boolean {
    return !!GROK_API_KEY;
}

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface GrokResponse {
    choices: Array<{
        message: {
            content: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Send a chat completion request to Grok and get a JSON response.
 * Automatically retries once on failure.
 */
export async function grokChat(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
    if (!GROK_API_KEY) {
        throw new Error("GROK_NOT_CONFIGURED");
    }

    const { temperature = 0.3, maxTokens = 2000 } = options;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${GROK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: GROK_MODEL,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    response_format: { type: "json_object" },
                }),
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Grok API error ${res.status}: ${errorText}`);
            }

            const data = (await res.json()) as GrokResponse;
            return data.choices[0].message.content;
        } catch (err) {
            if (attempt === 0) {
                console.warn("⚠️  Grok API retry:", (err as Error).message);
                await new Promise((r) => setTimeout(r, 1000)); // wait 1s before retry
                continue;
            }
            throw err;
        }
    }

    throw new Error("Grok API: all retries failed");
}

/**
 * Send a chat and parse the JSON response. Returns null on failure.
 */
export async function grokJSON<T>(
    messages: ChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
): Promise<T | null> {
    try {
        const content = await grokChat(messages, options);
        return JSON.parse(content) as T;
    } catch (err) {
        console.error("❌ Grok JSON parse failed:", (err as Error).message);
        return null;
    }
}
