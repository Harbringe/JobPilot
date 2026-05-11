/**
 * TheMuse.com job provider — free public API, no key required for basic usage.
 * Docs: https://www.themuse.com/developers/api/v2
 */

import type { NormalizedJob } from "./remotive.provider.js";
import { htmlToMarkdown } from "../../../lib/html-to-markdown.js";

interface MuseLocation { name: string }
interface MuseCategory { name: string }
interface MuseLevel { name: string }
interface MuseCompany {
    id: number;
    short_name: string;
    name: string;
}
interface MuseJob {
    id: number;
    name: string;
    short_name: string;
    contents: string;
    publication_date: string;
    refs: { landing_page: string };
    company: MuseCompany;
    locations: MuseLocation[];
    categories: MuseCategory[];
    levels: MuseLevel[];
}

interface MuseResponse {
    page: number;
    page_count: number;
    results: MuseJob[];
}

function detectRemote(locations: MuseLocation[]): "REMOTE" | "HYBRID" | "ONSITE" {
    const names = locations.map((l) => l.name.toLowerCase()).join(" ");
    if (names.includes("remote") || names.includes("flexible")) return "REMOTE";
    if (names.includes("hybrid")) return "HYBRID";
    return "ONSITE";
}

function normalizeMuseJob(job: MuseJob): NormalizedJob {
    const location = job.locations?.[0]?.name || "Unknown";
    const remoteType = detectRemote(job.locations || []);
    const tags = [
        ...(job.categories?.map((c) => c.name) || []),
        ...(job.levels?.map((l) => l.name) || []),
    ];
    return {
        fingerprint: `themuse-${job.id}`,
        title: job.name,
        company: job.company.name,
        companyLogoUrl: null,
        location,
        remoteType,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: "USD",
        description: htmlToMarkdown(job.contents || ""),
        requirements: tags.slice(0, 30),
        source: "themuse",
        sourceUrl: job.refs.landing_page,
        applyUrl: job.refs.landing_page,
        postedAt: new Date(job.publication_date),
    };
}

export async function fetchTheMuseJobs(): Promise<NormalizedJob[]> {
    const allJobs: NormalizedJob[] = [];
    // 2 pages × 4 categories = 8 requests; 20 jobs/page ≈ 160 jobs.
    // Previous 5×5 was 25 requests and often hit rate limits / timeouts.
    const maxPages = Number(process.env.THEMUSE_MAX_PAGES ?? 2);
    const categories = ["Engineering", "Data Science", "Product", "Design"];

    for (const category of categories) {
        for (let page = 1; page <= maxPages; page++) {
            try {
                const url = new URL("https://www.themuse.com/api/public/jobs");
                url.searchParams.set("category", category);
                url.searchParams.set("page", String(page));
                const res = await fetch(url.toString(), {
                    signal: AbortSignal.timeout(15_000),
                });
                if (!res.ok) {
                    console.warn(`⚠️  TheMuse (${category}/page=${page}): HTTP ${res.status}`);
                    break;
                }
                const data = (await res.json()) as MuseResponse;
                const normalized = (data.results || []).map(normalizeMuseJob);
                allJobs.push(...normalized);
                if (page >= data.page_count || normalized.length === 0) break;
            } catch (err) {
                console.warn(`⚠️  TheMuse (${category}/page=${page}) fetch failed:`, (err as Error).message);
                break;
            }
        }
    }
    console.log(`   📥 TheMuse: ${allJobs.length} jobs`);
    return allJobs;
}
