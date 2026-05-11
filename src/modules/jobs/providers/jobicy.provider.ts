/**
 * Jobicy.com job provider — free public API, no key needed.
 * Global remote jobs across many categories.
 * Docs: https://jobicy.com/jobs-rss-feed
 */

import type { NormalizedJob } from "./remotive.provider.js";
import { htmlToMarkdown } from "../../../lib/html-to-markdown.js";

interface JobicyJob {
    id: number;
    url: string;
    jobSlug: string;
    jobTitle: string;
    companyName: string;
    companyLogo: string | null;
    jobIndustry: string | string[];
    jobType: string | string[];
    jobGeo: string;
    jobLevel: string;
    jobExcerpt: string;
    jobDescription: string;
    pubDate: string;
    annualSalaryMin: number | null;
    annualSalaryMax: number | null;
    salaryCurrency: string | null;
}

interface JobicyResponse {
    apiVersion: string;
    jobCount: number;
    jobs: JobicyJob[];
}

function normalizeJobicyJob(job: JobicyJob): NormalizedJob {
    const tags = Array.isArray(job.jobIndustry) ? job.jobIndustry : (job.jobIndustry ? [job.jobIndustry] : []);
    return {
        fingerprint: `jobicy-${job.id}`,
        title: job.jobTitle,
        company: job.companyName,
        companyLogoUrl: job.companyLogo || null,
        location: job.jobGeo || "Worldwide",
        remoteType: "REMOTE",
        salaryMin: job.annualSalaryMin && job.annualSalaryMin > 100 ? job.annualSalaryMin : null,
        salaryMax: job.annualSalaryMax && job.annualSalaryMax > 100 ? job.annualSalaryMax : null,
        salaryCurrency: job.salaryCurrency || "USD",
        description: htmlToMarkdown(job.jobDescription || job.jobExcerpt || ""),
        requirements: tags.slice(0, 30),
        source: "jobicy",
        sourceUrl: job.url,
        applyUrl: job.url,
        postedAt: new Date(job.pubDate),
    };
}

export async function fetchJobicyJobs(): Promise<NormalizedJob[]> {
    try {
        const res = await fetch("https://jobicy.com/api/v2/remote-jobs?count=100", {
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
            console.warn(`⚠️  Jobicy: HTTP ${res.status}`);
            return [];
        }
        const data = (await res.json()) as JobicyResponse;
        const normalized = (data.jobs || []).map(normalizeJobicyJob);
        console.log(`   📥 Jobicy: ${normalized.length} jobs`);
        return normalized;
    } catch (err) {
        console.warn(`⚠️  Jobicy fetch failed:`, (err as Error).message);
        return [];
    }
}
