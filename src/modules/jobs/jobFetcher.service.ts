/**
 * Job Fetcher Service — orchestrates all providers and upserts into the database.
 * Uses `fingerprint` as the deduplication key.
 */

import { prisma } from "../../db/index.js";
import { fetchRemotiveJobs } from "./providers/remotive.provider.js";
import { fetchArbeitnowJobs } from "./providers/arbeitnow.provider.js";
import { fetchJobicyJobs } from "./providers/jobicy.provider.js";
import { fetchTheMuseJobs } from "./providers/themuse.provider.js";
import { fetchRemoteOkJobs } from "./providers/remoteok.provider.js";
import { fetchAdzunaJobs } from "./providers/adzuna.provider.js";
import { fetchJSearchJobs } from "./providers/jsearch.provider.js";
import type { NormalizedJob } from "./providers/remotive.provider.js";

export interface SyncResult {
    new: number;
    updated: number;
    total: number;
    sources: Record<string, number>;
    errors: string[];
}

/**
 * Atomic upsert keyed on Job.fingerprint (@unique).
 * Returns `created: true` when this was a new row.
 */
async function upsertOne(job: NormalizedJob): Promise<{ created: boolean } | null> {
    // We can't tell create vs. update directly from prisma.upsert, so check
    // first whether this fingerprint already exists. One read + one write
    // beats the previous read + (read or write) for the create path.
    try {
        const existed = await prisma.job.findUnique({
            where: { fingerprint: job.fingerprint },
            select: { id: true },
        });
        const data = {
            title: job.title,
            company: job.company,
            companyLogoUrl: job.companyLogoUrl,
            location: job.location,
            remoteType: job.remoteType,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            salaryCurrency: job.salaryCurrency,
            description: job.description,
            requirements: job.requirements,
            sourceUrl: job.sourceUrl,
            applyUrl: job.applyUrl,
            postedAt: job.postedAt,
            scrapedAt: new Date(),
            isActive: true,
        };
        await prisma.job.upsert({
            where: { fingerprint: job.fingerprint },
            create: { ...data, source: job.source, fingerprint: job.fingerprint },
            update: data,
        });
        return { created: !existed };
    } catch (err) {
        console.warn(`⚠️  Failed to upsert job "${job.title}":`, (err as Error).message);
        return null;
    }
}

export async function upsertJobs(jobs: NormalizedJob[]): Promise<{ new: number; updated: number }> {
    // Bounded concurrency — running every upsert in parallel would saturate the
    // DB connection pool (Render Postgres free tier is small). 10-wide gives a
    // ~10× speedup over the previous serial loop without overwhelming the pool.
    const CONCURRENCY = Number(process.env.JOB_UPSERT_CONCURRENCY ?? 10);
    let newCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        const slice = jobs.slice(i, i + CONCURRENCY);
        const results = await Promise.all(slice.map(upsertOne));
        for (const r of results) {
            if (!r) continue;
            if (r.created) newCount++;
            else updatedCount++;
        }
    }

    return { new: newCount, updated: updatedCount };
}

type ProviderFn = () => Promise<NormalizedJob[]>;

const PROVIDERS: Record<string, ProviderFn> = {
    remotive: fetchRemotiveJobs,
    arbeitnow: fetchArbeitnowJobs,
    jobicy: fetchJobicyJobs,
    themuse: fetchTheMuseJobs,
    remoteok: fetchRemoteOkJobs,
    adzuna: fetchAdzunaJobs,   // skipped if key missing
    jsearch: fetchJSearchJobs, // skipped if key missing
};

const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS ?? 45_000);

/**
 * Run a provider with a hard timeout so a hanging HTTP request from one
 * source can't stall the entire sync.
 */
function withTimeout<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${name} timed out after ${PROVIDER_TIMEOUT_MS}ms`));
        }, PROVIDER_TIMEOUT_MS);
        fn().then(
            (v) => { clearTimeout(timer); resolve(v); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}

export async function syncJobs(): Promise<SyncResult> {
    console.log("🔄 Starting job sync...");
    const t0 = Date.now();

    const errors: string[] = [];
    const sources: Record<string, number> = {};
    const allJobs: NormalizedJob[] = [];

    // Fetch from all providers in parallel, each capped by PROVIDER_TIMEOUT_MS
    const entries = Object.entries(PROVIDERS);
    const settled = await Promise.allSettled(
        entries.map(([name, fn]) => withTimeout(name, fn))
    );

    settled.forEach((result, i) => {
        const [name] = entries[i];
        if (result.status === "fulfilled") {
            allJobs.push(...result.value);
            sources[name] = result.value.length;
        } else {
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            errors.push(`${name}: ${reason}`);
            sources[name] = 0;
            console.warn(`⚠️  Provider ${name} failed: ${reason}`);
        }
    });

    console.log(`📦 Fetched ${allJobs.length} jobs from ${Object.keys(sources).length} providers in ${Date.now() - t0}ms`);
    console.log("   Breakdown:", sources);

    // Upsert all jobs into database
    const t1 = Date.now();
    const { new: newCount, updated: updatedCount } = await upsertJobs(allJobs);
    console.log(`✅ Sync complete: ${newCount} new, ${updatedCount} updated in ${Date.now() - t1}ms`);

    return {
        new: newCount,
        updated: updatedCount,
        total: allJobs.length,
        sources,
        errors,
    };
}
