/**
 * Arbeitnow.com job provider — free API, no key needed.
 * Fetches jobs primarily from European markets.
 */

import type { NormalizedJob } from "./remotive.provider.js";

interface ArbeitnowJob {
    slug: string;
    company_name: string;
    title: string;
    description: string;
    remote: boolean;
    url: string;
    tags: string[];
    job_types: string[];
    location: string;
    created_at: number;
}

interface ArbeitnowResponse {
    data: ArbeitnowJob[];
    links: { next: string | null };
    meta: { current_page: number; last_page: number };
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x26;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\\n/g, "\n")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 10000);
}

function normalizeArbeitnowJob(job: ArbeitnowJob): NormalizedJob {
    return {
        fingerprint: `arbeitnow-${job.slug}`,
        title: job.title,
        company: job.company_name,
        companyLogoUrl: null,
        location: job.location || "Europe",
        remoteType: job.remote ? "REMOTE" : "ONSITE",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: "EUR",
        description: stripHtml(job.description),
        requirements: job.tags?.slice(0, 30) || [],
        source: "arbeitnow",
        sourceUrl: job.url,
        applyUrl: job.url,
        postedAt: new Date(job.created_at * 1000),
    };
}

export async function fetchArbeitnowJobs(): Promise<NormalizedJob[]> {
    const allJobs: NormalizedJob[] = [];
    let page = 1;
    const maxPages = 3; // Limit to 3 pages (~300 jobs)

    while (page <= maxPages) {
        try {
            const res = await fetch(
                `https://www.arbeitnow.com/api/job-board-api?page=${page}`
            );
            if (!res.ok) {
                console.warn(`⚠️  Arbeitnow (page ${page}): HTTP ${res.status}`);
                break;
            }

            const data = (await res.json()) as ArbeitnowResponse;
            const normalized = data.data.map(normalizeArbeitnowJob);
            allJobs.push(...normalized);
            console.log(`   📥 Arbeitnow (page ${page}): ${normalized.length} jobs`);

            if (!data.links.next || page >= data.meta.last_page) break;
            page++;
        } catch (err) {
            console.warn(`⚠️  Arbeitnow (page ${page}) fetch failed:`, (err as Error).message);
            break;
        }
    }

    return allJobs;
}
