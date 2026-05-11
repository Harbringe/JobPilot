import crypto from "crypto";
import type { NormalizedJob } from "../../jobs/providers/remotive.provider.js";

export function fingerprintFor(source: string, company: string, title: string, location: string | null, externalId?: string): string {
    const key = externalId
        ? `${source}|${company}|${externalId}`
        : `${source}|${company}|${title}|${location ?? ""}`;
    return crypto.createHash("sha1").update(key.toLowerCase()).digest("hex");
}

export function detectRemoteType(text: string | null | undefined): "REMOTE" | "HYBRID" | "ONSITE" {
    if (!text) return "ONSITE";
    const lower = text.toLowerCase();
    if (/\bremote\b|work from anywhere|wfh/.test(lower)) return "REMOTE";
    if (/\bhybrid\b/.test(lower)) return "HYBRID";
    return "ONSITE";
}

export function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}

export function tagsFromText(text: string, max = 12): string[] {
    const tokens = (text.match(/[A-Z][A-Za-z0-9+#.]{1,}|[a-z0-9]+(?:\.js)?/g) ?? []).filter(
        (t) => t.length >= 2 && t.length <= 24
    );
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tokens) {
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
        if (out.length >= max) break;
    }
    return out;
}

export type Extractor = (portal: { id: string; company: string; url: string; filterTags: string[] }) => Promise<NormalizedJob[]>;
