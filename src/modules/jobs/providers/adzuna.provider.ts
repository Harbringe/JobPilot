/**
 * Adzuna job provider — free with API key (register at developer.adzuna.com).
 * Spans 20+ countries: us, gb, de, fr, in, au, ca, sg, nl, ru, br, mx, pl, za, nz, at, ch, be, cz, es, it.
 *
 * Env vars:
 *   ADZUNA_APP_ID
 *   ADZUNA_APP_KEY
 *   ADZUNA_COUNTRIES        comma-separated, defaults to "us,gb,de,in,au,ca"
 *   ADZUNA_QUERY            keyword filter, defaults to "" (everything)
 *   ADZUNA_RESULTS_PER_PAGE max 50 per Adzuna, defaults to 50
 *   ADZUNA_MAX_PAGES        defaults to 2
 */

import type { NormalizedJob } from "./remotive.provider.js";

interface AdzunaJob {
    id: string;
    title: string;
    company: { display_name: string };
    location: { display_name: string; area: string[] };
    description: string;
    redirect_url: string;
    salary_min: number | null;
    salary_max: number | null;
    salary_is_predicted?: string;
    created: string;
    contract_time?: string;
    category?: { tag: string; label: string };
}

interface AdzunaResponse {
    results: AdzunaJob[];
    count: number;
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
    us: "USD", gb: "GBP", de: "EUR", fr: "EUR", in: "INR", au: "AUD",
    ca: "CAD", sg: "SGD", nl: "EUR", ru: "RUB", br: "BRL", mx: "MXN",
    pl: "PLN", za: "ZAR", nz: "NZD", at: "EUR", ch: "CHF", be: "EUR",
    cz: "CZK", es: "EUR", it: "EUR",
};

function detectRemote(title: string, description: string, location: string): "REMOTE" | "HYBRID" | "ONSITE" {
    const haystack = `${title} ${description} ${location}`.toLowerCase();
    if (/\bremote\b|work[- ]from[- ]home|wfh/.test(haystack)) return "REMOTE";
    if (/\bhybrid\b/.test(haystack)) return "HYBRID";
    return "ONSITE";
}

function normalizeAdzunaJob(country: string, job: AdzunaJob): NormalizedJob {
    const desc = (job.description || "").replace(/\s+/g, " ").trim().substring(0, 10000);
    return {
        fingerprint: `adzuna-${country}-${job.id}`,
        title: job.title,
        company: job.company?.display_name || "Unknown",
        companyLogoUrl: null,
        location: job.location?.display_name || country.toUpperCase(),
        remoteType: detectRemote(job.title, desc, job.location?.display_name || ""),
        salaryMin: job.salary_min && job.salary_min > 100 ? Math.round(job.salary_min) : null,
        salaryMax: job.salary_max && job.salary_max > 100 ? Math.round(job.salary_max) : null,
        salaryCurrency: CURRENCY_BY_COUNTRY[country] || "USD",
        description: desc,
        requirements: job.category?.label ? [job.category.label] : [],
        source: "adzuna",
        sourceUrl: job.redirect_url,
        applyUrl: job.redirect_url,
        postedAt: new Date(job.created),
    };
}

export async function fetchAdzunaJobs(): Promise<NormalizedJob[]> {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
        console.log("   ⏭️  Adzuna skipped — ADZUNA_APP_ID / ADZUNA_APP_KEY not set");
        return [];
    }
    const countries = (process.env.ADZUNA_COUNTRIES || "us,gb,de,in,au,ca")
        .split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
    const query = process.env.ADZUNA_QUERY || "";
    const perPage = Math.min(Number(process.env.ADZUNA_RESULTS_PER_PAGE || 50), 50);
    const maxPages = Number(process.env.ADZUNA_MAX_PAGES || 2);

    const allJobs: NormalizedJob[] = [];
    for (const country of countries) {
        for (let page = 1; page <= maxPages; page++) {
            try {
                const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
                url.searchParams.set("app_id", appId);
                url.searchParams.set("app_key", appKey);
                url.searchParams.set("results_per_page", String(perPage));
                if (query) url.searchParams.set("what", query);
                url.searchParams.set("content-type", "application/json");

                const res = await fetch(url.toString(), {
                    signal: AbortSignal.timeout(15_000),
                });
                if (!res.ok) {
                    console.warn(`⚠️  Adzuna (${country}/page=${page}): HTTP ${res.status}`);
                    break;
                }
                const data = (await res.json()) as AdzunaResponse;
                const normalized = (data.results || []).map((j) => normalizeAdzunaJob(country, j));
                allJobs.push(...normalized);
                if (normalized.length < perPage) break;
            } catch (err) {
                console.warn(`⚠️  Adzuna (${country}/page=${page}) fetch failed:`, (err as Error).message);
                break;
            }
        }
    }
    console.log(`   📥 Adzuna: ${allJobs.length} jobs across ${countries.length} countries`);
    return allJobs;
}
