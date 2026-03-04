/**
 * Remotive.com job provider — free API, no key needed.
 * Fetches remote software development jobs.
 */

interface RemotiveJob {
    id: number;
    url: string;
    title: string;
    company_name: string;
    company_logo_url: string | null;
    category: string;
    tags: string[];
    job_type: string;
    publication_date: string;
    candidate_required_location: string;
    salary: string;
    description: string;
}

interface RemotiveResponse {
    "job-count": number;
    jobs: RemotiveJob[];
}

export interface NormalizedJob {
    fingerprint: string;
    title: string;
    company: string;
    companyLogoUrl: string | null;
    location: string | null;
    remoteType: "REMOTE" | "HYBRID" | "ONSITE";
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string;
    description: string;
    requirements: string[];
    source: string;
    sourceUrl: string | null;
    applyUrl: string;
    postedAt: Date;
}

function parseSalary(salary: string): { min: number | null; max: number | null } {
    if (!salary) return { min: null, max: null };

    // Try to extract numbers from salary strings like "$60,000 - $80,000" or "60000-80000"
    const numbers = salary.replace(/[,$£€]/g, "").match(/\d+/g);
    if (!numbers || numbers.length === 0) return { min: null, max: null };

    const values = numbers.map(Number).filter((n) => n > 100); // filter out non-salary numbers
    if (values.length >= 2) {
        return { min: Math.min(...values), max: Math.max(...values) };
    }
    if (values.length === 1) {
        return { min: values[0], max: values[0] };
    }
    return { min: null, max: null };
}

function normalizeRemotiveJob(job: RemotiveJob): NormalizedJob {
    const { min, max } = parseSalary(job.salary);

    return {
        fingerprint: `remotive-${job.id}`,
        title: job.title,
        company: job.company_name,
        companyLogoUrl: job.company_logo_url || null,
        location: job.candidate_required_location || "Remote",
        remoteType: "REMOTE",
        salaryMin: min,
        salaryMax: max,
        salaryCurrency: "USD",
        description: job.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().substring(0, 10000),
        requirements: job.tags?.slice(0, 30) || [],
        source: "remotive",
        sourceUrl: job.url,
        applyUrl: job.url,
        postedAt: new Date(job.publication_date),
    };
}

export async function fetchRemotiveJobs(): Promise<NormalizedJob[]> {
    const categories = ["software-dev", "devops", "data", "product"];
    const allJobs: NormalizedJob[] = [];

    for (const category of categories) {
        try {
            const res = await fetch(
                `https://remotive.com/api/remote-jobs?category=${category}&limit=50`
            );
            if (!res.ok) {
                console.warn(`⚠️  Remotive (${category}): HTTP ${res.status}`);
                continue;
            }

            const data = (await res.json()) as RemotiveResponse;
            const normalized = data.jobs.map(normalizeRemotiveJob);
            allJobs.push(...normalized);
            console.log(`   📥 Remotive (${category}): ${normalized.length} jobs`);
        } catch (err) {
            console.warn(`⚠️  Remotive (${category}) fetch failed:`, (err as Error).message);
        }
    }

    return allJobs;
}
