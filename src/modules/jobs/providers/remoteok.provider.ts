/**
 * RemoteOK.com job provider — free public JSON feed, no key.
 * The first element in the array is metadata, the rest are jobs.
 * Docs: https://remoteok.com/api
 */

import type { NormalizedJob } from "./remotive.provider.js";
import { htmlToMarkdown } from "../../../lib/html-to-markdown.js";

interface RemoteOkJob {
    id: string;
    slug?: string;
    epoch?: number;
    date?: string;
    company: string;
    company_logo?: string;
    position: string;
    tags?: string[];
    description?: string;
    location?: string;
    salary_min?: number;
    salary_max?: number;
    apply_url?: string;
    url?: string;
}

function normalizeRemoteOkJob(job: RemoteOkJob): NormalizedJob | null {
    if (!job.id || !job.position || !job.company) return null;
    const apply = job.apply_url || job.url || `https://remoteok.com/remote-jobs/${job.slug || job.id}`;
    const posted = job.epoch
        ? new Date(job.epoch * 1000)
        : job.date
            ? new Date(job.date)
            : new Date();
    return {
        fingerprint: `remoteok-${job.id}`,
        title: job.position,
        company: job.company,
        companyLogoUrl: job.company_logo || null,
        location: job.location || "Worldwide",
        remoteType: "REMOTE",
        salaryMin: job.salary_min && job.salary_min > 100 ? job.salary_min : null,
        salaryMax: job.salary_max && job.salary_max > 100 ? job.salary_max : null,
        salaryCurrency: "USD",
        description: htmlToMarkdown(job.description || ""),
        requirements: (job.tags || []).slice(0, 30),
        source: "remoteok",
        sourceUrl: apply,
        applyUrl: apply,
        postedAt: posted,
    };
}

export async function fetchRemoteOkJobs(): Promise<NormalizedJob[]> {
    try {
        // RemoteOK requires a UA, otherwise returns 403.
        const res = await fetch("https://remoteok.com/api", {
            headers: { "User-Agent": "JobPilot/1.0 (+https://jobpilot.dev)" },
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
            console.warn(`⚠️  RemoteOK: HTTP ${res.status}`);
            return [];
        }
        const raw = (await res.json()) as unknown[];
        // Drop the metadata header element (first item has 0 / "legal" fields).
        const jobs = raw.slice(1) as RemoteOkJob[];
        const normalized = jobs
            .map(normalizeRemoteOkJob)
            .filter((j): j is NormalizedJob => j !== null);
        console.log(`   📥 RemoteOK: ${normalized.length} jobs`);
        return normalized;
    } catch (err) {
        console.warn(`⚠️  RemoteOK fetch failed:`, (err as Error).message);
        return [];
    }
}
