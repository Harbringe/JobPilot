import type { NormalizedJob } from "../../jobs/providers/remotive.provider.js";
import { detectRemoteType, fingerprintFor, stripHtml, tagsFromText, type Extractor } from "./common.js";

interface LeverPosting {
    id: string;
    text: string;
    hostedUrl: string;
    applyUrl?: string;
    categories?: { commitment?: string; location?: string; team?: string };
    description?: string;
    descriptionPlain?: string;
    lists?: Array<{ text?: string; content?: string }>;
    createdAt?: number;
}

function extractToken(url: string): string | null {
    const m = url.match(/jobs\.lever\.co\/([^/?#]+)/i) ?? url.match(/lever\.co\/([^/?#]+)/i);
    return m?.[1] ?? null;
}

export const leverExtractor: Extractor = async (portal) => {
    const token = extractToken(portal.url);
    if (!token) throw new Error(`Lever token not found in URL: ${portal.url}`);

    const apiUrl = `https://api.lever.co/v0/postings/${token}?mode=json`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`Lever API ${res.status} for ${token}`);
    const data = (await res.json()) as LeverPosting[];

    const jobs: NormalizedJob[] = [];
    for (const p of data ?? []) {
        const listsText = (p.lists ?? [])
            .map((l) => `${l.text ?? ""}: ${stripHtml(l.content ?? "")}`)
            .join(" \n ");
        const description = (p.descriptionPlain ?? stripHtml(p.description ?? "")) + "\n" + listsText;
        if (!description.trim()) continue;

        const location = p.categories?.location ?? null;
        const remoteType = detectRemoteType(`${location} ${p.categories?.commitment ?? ""}`);
        const requirements = tagsFromText(description, 12);

        if (portal.filterTags.length > 0) {
            const matched = portal.filterTags.some((t) => description.toLowerCase().includes(t.toLowerCase()) || p.text.toLowerCase().includes(t.toLowerCase()));
            if (!matched) continue;
        }

        jobs.push({
            fingerprint: fingerprintFor("lever", portal.company, p.text, location, p.id),
            title: p.text,
            company: portal.company,
            companyLogoUrl: null,
            location,
            remoteType,
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: "USD",
            description: description.slice(0, 8000),
            requirements,
            source: "lever",
            sourceUrl: p.hostedUrl,
            applyUrl: p.applyUrl ?? p.hostedUrl,
            postedAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        });
    }
    return jobs;
};
