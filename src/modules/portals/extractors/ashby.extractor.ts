import type { NormalizedJob } from "../../jobs/providers/remotive.provider.js";
import { detectRemoteType, fingerprintFor, stripHtml, tagsFromText, type Extractor } from "./common.js";

interface AshbyJob {
    id: string;
    title: string;
    department?: string;
    team?: string;
    locationName?: string;
    employmentType?: string;
    isRemote?: boolean;
    descriptionHtml?: string;
    descriptionPlain?: string;
    jobUrl?: string;
    applyUrl?: string;
    publishedAt?: string;
}

interface AshbyResponse {
    jobs?: AshbyJob[];
    apiVersion?: string;
}

function extractToken(url: string): string | null {
    const m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i)
        ?? url.match(/ashbyhq\.com\/([^/?#]+)/i);
    return m?.[1] ?? null;
}

export const ashbyExtractor: Extractor = async (portal) => {
    const token = extractToken(portal.url);
    if (!token) throw new Error(`Ashby token not found in URL: ${portal.url}`);

    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
        throw new Error(`Ashby API ${res.status} for ${token}`);
    }
    const data = (await res.json()) as AshbyResponse;

    const jobs: NormalizedJob[] = [];
    for (const j of data.jobs ?? []) {
        const description = j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? "");
        if (!description) continue;

        const location = j.locationName ?? null;
        const remoteType: "REMOTE" | "HYBRID" | "ONSITE" = j.isRemote
            ? "REMOTE"
            : detectRemoteType(`${location} ${j.employmentType ?? ""}`);
        const requirements = tagsFromText(description, 12);

        if (portal.filterTags.length > 0) {
            const matched = portal.filterTags.some((t) => description.toLowerCase().includes(t.toLowerCase()) || j.title.toLowerCase().includes(t.toLowerCase()));
            if (!matched) continue;
        }

        const apply = j.applyUrl ?? j.jobUrl ?? `https://jobs.ashbyhq.com/${token}/${j.id}`;
        jobs.push({
            fingerprint: fingerprintFor("ashby", portal.company, j.title, location, j.id),
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
            source: "ashby",
            sourceUrl: j.jobUrl ?? apply,
            applyUrl: apply,
            postedAt: j.publishedAt ? new Date(j.publishedAt) : new Date(),
        });
    }
    return jobs;
};
