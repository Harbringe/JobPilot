/**
 * Job Fetcher Service — orchestrates all providers and upserts into the database.
 * Uses `fingerprint` as the deduplication key.
 */

import { prisma } from "../../db/index.js";
import { fetchRemotiveJobs } from "./providers/remotive.provider.js";
import { fetchArbeitnowJobs } from "./providers/arbeitnow.provider.js";
import type { NormalizedJob } from "./providers/remotive.provider.js";

export interface SyncResult {
    new: number;
    updated: number;
    total: number;
    sources: Record<string, number>;
    errors: string[];
}

async function upsertJobs(jobs: NormalizedJob[]): Promise<{ new: number; updated: number }> {
    let newCount = 0;
    let updatedCount = 0;

    for (const job of jobs) {
        try {
            const existing = await prisma.job.findFirst({
                where: { fingerprint: job.fingerprint },
            });

            if (existing) {
                // Update existing job (refresh data)
                await prisma.job.update({
                    where: { id: existing.id },
                    data: {
                        title: job.title,
                        company: job.company,
                        companyLogoUrl: job.companyLogoUrl,
                        location: job.location,
                        remoteType: job.remoteType as any,
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
                    },
                });
                updatedCount++;
            } else {
                // Create new job
                await prisma.job.create({
                    data: {
                        title: job.title,
                        company: job.company,
                        companyLogoUrl: job.companyLogoUrl,
                        location: job.location,
                        remoteType: job.remoteType as any,
                        salaryMin: job.salaryMin,
                        salaryMax: job.salaryMax,
                        salaryCurrency: job.salaryCurrency,
                        description: job.description,
                        requirements: job.requirements,
                        source: job.source,
                        sourceUrl: job.sourceUrl,
                        applyUrl: job.applyUrl,
                        postedAt: job.postedAt,
                        scrapedAt: new Date(),
                        fingerprint: job.fingerprint,
                        isActive: true,
                    },
                });
                newCount++;
            }
        } catch (err) {
            console.warn(`⚠️  Failed to upsert job "${job.title}":`, (err as Error).message);
        }
    }

    return { new: newCount, updated: updatedCount };
}

export async function syncJobs(): Promise<SyncResult> {
    console.log("🔄 Starting job sync...");

    const errors: string[] = [];
    const sources: Record<string, number> = {};

    // Fetch from all providers in parallel
    const [remotiveJobs, arbeitnowJobs] = await Promise.allSettled([
        fetchRemotiveJobs(),
        fetchArbeitnowJobs(),
    ]);

    const allJobs: NormalizedJob[] = [];

    if (remotiveJobs.status === "fulfilled") {
        allJobs.push(...remotiveJobs.value);
        sources.remotive = remotiveJobs.value.length;
    } else {
        errors.push(`Remotive: ${remotiveJobs.reason}`);
        sources.remotive = 0;
    }

    if (arbeitnowJobs.status === "fulfilled") {
        allJobs.push(...arbeitnowJobs.value);
        sources.arbeitnow = arbeitnowJobs.value.length;
    } else {
        errors.push(`Arbeitnow: ${arbeitnowJobs.reason}`);
        sources.arbeitnow = 0;
    }

    console.log(`📦 Total fetched: ${allJobs.length} jobs from ${Object.keys(sources).length} providers`);

    // Upsert all jobs into database
    const { new: newCount, updated: updatedCount } = await upsertJobs(allJobs);

    console.log(`✅ Sync complete: ${newCount} new, ${updatedCount} updated`);

    return {
        new: newCount,
        updated: updatedCount,
        total: allJobs.length,
        sources,
        errors,
    };
}
