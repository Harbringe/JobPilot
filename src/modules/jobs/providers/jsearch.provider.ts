/**
 * JSearch (RapidAPI) job provider — aggregates LinkedIn / Indeed / Glassdoor / ZipRecruiter.
 * Free tier on RapidAPI is ~200 requests/month.
 *
 * Set up:
 *   1. https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch — subscribe to BASIC (free)
 *   2. Copy your X-RapidAPI-Key
 *   3. Add to .env: JSEARCH_RAPIDAPI_KEY=<key>
 *
 * Env vars:
 *   JSEARCH_RAPIDAPI_KEY    required
 *   JSEARCH_QUERY           defaults to "Software Engineer"
 *   JSEARCH_COUNTRY         ISO-2 country code, defaults to "us"
 *   JSEARCH_PAGES           number of pages (10 results each), defaults to 2
 *   JSEARCH_REMOTE_ONLY     "true" | "false", defaults to "false"
 */

import type { NormalizedJob } from "./remotive.provider.js";

interface JSearchJob {
    job_id: string;
    employer_name: string;
    employer_logo: string | null;
    job_publisher: string;                 // "LinkedIn", "Indeed", "Glassdoor", ...
    job_employment_type: string;
    job_title: string;
    job_apply_link: string;
    job_apply_is_direct: boolean;
    job_description: string;
    job_is_remote: boolean;
    job_posted_at_datetime_utc: string | null;
    job_city: string | null;
    job_state: string | null;
    job_country: string | null;
    job_min_salary: number | null;
    job_max_salary: number | null;
    job_salary_currency: string | null;
    job_required_skills?: string[] | null;
    job_required_experience?: { required_experience_in_months?: number | null } | null;
}

interface JSearchResponse {
    status: string;
    data: JSearchJob[];
}

function normalizeJSearchJob(job: JSearchJob): NormalizedJob {
    const locationParts = [job.job_city, job.job_state, job.job_country].filter(Boolean);
    const publisher = (job.job_publisher || "jsearch").toLowerCase();
    return {
        fingerprint: `jsearch-${publisher}-${job.job_id}`,
        title: job.job_title,
        company: job.employer_name || "Unknown",
        companyLogoUrl: job.employer_logo || null,
        location: locationParts.length > 0 ? locationParts.join(", ") : "Remote",
        remoteType: job.job_is_remote ? "REMOTE" : "ONSITE",
        salaryMin: job.job_min_salary && job.job_min_salary > 100 ? Math.round(job.job_min_salary) : null,
        salaryMax: job.job_max_salary && job.job_max_salary > 100 ? Math.round(job.job_max_salary) : null,
        salaryCurrency: job.job_salary_currency || "USD",
        description: (job.job_description || "").replace(/\s+/g, " ").trim().substring(0, 10000),
        requirements: (job.job_required_skills || []).slice(0, 30),
        // Tag source by underlying publisher so the UI can show "LinkedIn", "Indeed", etc.
        source: `jsearch:${publisher}`,
        sourceUrl: job.job_apply_link,
        applyUrl: job.job_apply_link,
        postedAt: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : new Date(),
    };
}

export async function fetchJSearchJobs(): Promise<NormalizedJob[]> {
    const apiKey = process.env.JSEARCH_RAPIDAPI_KEY;
    if (!apiKey) {
        console.log("   ⏭️  JSearch skipped — JSEARCH_RAPIDAPI_KEY not set (covers LinkedIn/Indeed/Glassdoor)");
        return [];
    }
    const query = process.env.JSEARCH_QUERY || "Software Engineer";
    const country = (process.env.JSEARCH_COUNTRY || "us").toLowerCase();
    const pages = Math.max(1, Math.min(Number(process.env.JSEARCH_PAGES || 2), 5));
    const remoteOnly = process.env.JSEARCH_REMOTE_ONLY === "true";

    const allJobs: NormalizedJob[] = [];
    for (let page = 1; page <= pages; page++) {
        try {
            const url = new URL("https://jsearch.p.rapidapi.com/search");
            url.searchParams.set("query", query);
            url.searchParams.set("page", String(page));
            url.searchParams.set("num_pages", "1");
            url.searchParams.set("country", country);
            if (remoteOnly) url.searchParams.set("work_from_home", "true");

            const res = await fetch(url.toString(), {
                headers: {
                    "X-RapidAPI-Key": apiKey,
                    "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
                },
                signal: AbortSignal.timeout(20_000),
            });
            if (!res.ok) {
                const body = await res.text();
                console.warn(`⚠️  JSearch (page ${page}): HTTP ${res.status} ${body.slice(0, 120)}`);
                break;
            }
            const data = (await res.json()) as JSearchResponse;
            const normalized = (data.data || []).map(normalizeJSearchJob);
            allJobs.push(...normalized);
            if (normalized.length === 0) break;
        } catch (err) {
            console.warn(`⚠️  JSearch (page ${page}) fetch failed:`, (err as Error).message);
            break;
        }
    }
    console.log(`   📥 JSearch: ${allJobs.length} jobs (LinkedIn/Indeed/Glassdoor/etc.)`);
    return allJobs;
}
