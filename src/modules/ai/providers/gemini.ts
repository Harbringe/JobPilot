import type { AIClient, ChatMessage, ChatOptions } from "./types.js";

interface GeminiResponse {
    candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
    }>;
}

/**
 * Google Gemini client (generateContent API).
 * Uses ?key= URL auth (Gemini's standard pattern).
 */
export function makeGeminiClient(args: {
    apiKey: string;
    model: string;
    baseUrl: string;
}): AIClient {
    const { apiKey, model, baseUrl } = args;

    function buildContents(messages: ChatMessage[]) {
        const systemPrompts = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
        const convo = messages.filter((m) => m.role !== "system");
        const contents = convo.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));
        return { systemInstruction: systemPrompts ? { parts: [{ text: systemPrompts }] } : undefined, contents };
    }

    async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
        const { temperature = 0.3, maxTokens = 2000, json = false } = opts;
        const { systemInstruction, contents } = buildContents(messages);

        const body: Record<string, unknown> = {
            contents,
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                ...(json ? { responseMimeType: "application/json" } : {}),
            },
        };
        if (systemInstruction) body.systemInstruction = systemInstruction;

        const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        for (let attempt = 0; attempt < 2; attempt++) {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = await res.text();
                if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
                    await new Promise((r) => setTimeout(r, 800));
                    continue;
                }
                throw new Error(`Gemini API ${res.status}: ${text.slice(0, 500)}`);
            }
            const data = (await res.json()) as GeminiResponse;
            const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
            return text;
        }
        throw new Error("Gemini API: retries exhausted");
    }

    async function chatJSON<T>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T | null> {
        try {
            const raw = await chat(messages, { ...opts, json: true });
            const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");
            return JSON.parse(cleaned) as T;
        } catch (err) {
            console.error("❌ Gemini chatJSON failed:", (err as Error).message);
            return null;
        }
    }

    return { provider: "GEMINI", model, chat, chatJSON };
}
