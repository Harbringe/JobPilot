export type AiProviderName = "GROQ" | "ANTHROPIC" | "GEMINI" | "OPENAI";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatOptions {
    temperature?: number;
    maxTokens?: number;
    json?: boolean; // if true, hint the provider to return JSON
}

export interface AIClient {
    provider: AiProviderName;
    model: string;
    chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
    chatJSON<T>(messages: ChatMessage[], opts?: ChatOptions): Promise<T | null>;
}

export const PROVIDER_DEFAULTS: Record<AiProviderName, { baseUrl: string; model: string }> = {
    GROQ: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    ANTHROPIC: { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-6" },
    GEMINI: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-1.5-pro-latest" },
    OPENAI: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
};
