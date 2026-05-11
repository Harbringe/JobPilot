import type { NormalizedJob } from "../../jobs/providers/remotive.provider.js";
import { detectRemoteType, fingerprintFor, stripHtml, tagsFromText, type Extractor } from "./common.js";

interface GhJob {
    id: number;
    title: string;
    location?: { name?: string };
    absolute_url: string;
    updated_at?: string;
    content?: string;
    departments?: Array<{ name: string }>;
}

interface GhResponse {
    jobs: GhJob[];
}

function extractToken(url: string): string | null {
    const m = url.match(/boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([^/?#]+)/i)
        ?? url.match(/job-boards\.greenhouse\.io\/([^/?#]+)/i)
        ?? url.match(/greenhouse\.io\/([^/?#]+)/i);
    return m?.[1] ?? null;
}

export const greenhouseExtractor: Extractor = async (portal) => {
    const token = extractToken(portal.url);
    if (!token) {
        throw new Error(`Greenhouse token not found in URL: ${portal.url}`);
    }

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
        throw new Error(`Greenhouse API ${res.status} for ${token}`);
    }
    const data = (await res.json()) as GhResponse;

    const jobs: NormalizedJob[] = [];
    for (const j of data.jobs ?? []) {
        const description = stripHtml(j.content ?? "");
        if (!description) continue;
        const location = j.location?.name ?? null;
        const remoteType = detectRemoteType(`${location} ${j.title}`);
        const requirements = tagsFromText(description, 12);

        if (portal.filterTags.length > 0) {
            const lowerReq = requirements.map((r) => r.toLowerCase());
            const matched = portal.filterTags.some((t) => lowerReq.includes(t.toLowerCase()) || j.title.toLowerCase().includes(t.toLowerCase()));
            if (!matched) continue;
        }

        jobs.push({
            fingerprint: fingerprintFor("greenhouse", portal.company, j.title, location, String(j.id)),
            title: j.title,
            company: portal.company,
            companyLogoUrl: null,
            location,
            remoteType,
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: "USD",
            description: description.slice(0, 8000),
            requirements,
            source: "greenhouse",
            sourceUrl: j.absolute_url,
            applyUrl: j.absolute_url,
            postedAt: j.updated_at ? new Date(j.updated_at) : new Date(),
        });
    }
    return jobs;
};
