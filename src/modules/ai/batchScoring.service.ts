/**
 * Batch Job Scoring Service — scores many jobs against a profile efficiently.
 *
 * Strategy: send 10 jobs per LLM call to minimize API round-trips.
 * Scores are persisted in the JobScore table and reused until re-scored.
 */

import { prisma } from "../../db/index.js";
import { grokJSON, isGrokConfigured } from "../ai/grok.client.js";
import type { MatchScores } from "./matching.service.js";

interface ProfileData {
    fullName: string;
    headline?: string | null;
    summary?: string | null;
    location?: string | null;
    skills: Array<{ name: string; level: string }>;
    experiences: Array<{ title: string; company: string; current: boolean; startDate: string; endDate?: string | null }>;
    educations: Array<{ institution: string; degree: string; field?: string | null }>;
    preferences?: any;
}

interface JobData {
    id: string;
    title: string;
    company: string;
    location?: string | null;
    remoteType?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    description: string;
    requirements: string[];
}

const BATCH_SYSTEM_PROMPT = `You are an expert job matching AI. You will receive a candidate profile and MULTIPLE job postings. Score each job against the candidate.

You MUST respond with valid JSON: an array of objects, one per job, in the SAME ORDER as the jobs were listed.

Each object must have:
{
  "jobIndex": <0-based index matching the job order>,
  "matchScore": <0-100 overall fit>,
  "skillMatch": <0-100>,
  "experienceMatch": <0-100>,
  "locationMatch": <0-100>,
  "salaryMatch": <0-100, default 75 if no salary data>,
  "acceptanceScore": <0-100 likelihood of hire>,
  "matchReason": "<1-2 sentences>",
  "missingSkills": ["<skills candidate lacks>"],
  "strongPoints": ["<candidate strengths that match>"]
}

Scoring: 90-100=perfect, 70-89=strong, 50-69=moderate, 30-49=weak, 0-29=poor.
Be concise in matchReason. Max 3 items in missingSkills and strongPoints.`;

function buildProfileText(profile: ProfileData): string {
    const totalYOE = profile.experiences.reduce((acc, exp) => {
        const start = new Date(exp.startDate);
        const end = exp.endDate ? new Date(exp.endDate) : new Date();
        return acc + (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    }, 0);

    return `CANDIDATE: ${profile.fullName}
Headline: ${profile.headline || "N/A"} | Location: ${profile.location || "N/A"} | YOE: ${Math.round(totalYOE)}
Skills: ${profile.skills.map((s) => `${s.name}(${s.level})`).join(", ")}
Experience: ${profile.experiences.map((e) => `${e.title}@${e.company}`).join(", ")}
Education: ${profile.educations.map((e) => `${e.degree} ${e.field || ""} - ${e.institution}`).join(", ")}
Preferences: ${profile.preferences ? JSON.stringify(profile.preferences) : "None"}`;
}

function buildBatchJobsText(jobs: JobData[]): string {
    return jobs
        .map(
            (job, i) =>
                `[JOB ${i}] "${job.title}" at ${job.company} | ${job.location || "N/A"} (${job.remoteType || "N/A"}) | Salary: ${job.salaryMin || "?"}-${job.salaryMax || "?"} | Tags: ${job.requirements.slice(0, 10).join(", ")} | Desc: ${job.description.substring(0, 500)}`
        )
        .join("\n\n");
}

/**
 * Score a batch of jobs (up to 10) against a profile in a single LLM call.
 */
async function scoreBatch(
    profile: ProfileData,
    jobs: JobData[]
): Promise<Map<string, MatchScores>> {
    const results = new Map<string, MatchScores>();

    const profileText = buildProfileText(profile);
    const jobsText = buildBatchJobsText(jobs);

    const response = await grokJSON<Array<MatchScores & { jobIndex: number }>>([
        { role: "system", content: BATCH_SYSTEM_PROMPT },
        {
            role: "user",
            content: `${profileText}\n\n---\n\n${jobsText}\n\nScore all ${jobs.length} jobs above against this candidate.`,
        },
    ], { temperature: 0.2, maxTokens: 3000 });

    if (!response || !Array.isArray(response)) return results;

    for (const score of response) {
        const idx = score.jobIndex;
        if (idx >= 0 && idx < jobs.length) {
            results.set(jobs[idx].id, {
                matchScore: clamp(score.matchScore),
                skillMatch: clamp(score.skillMatch),
                experienceMatch: clamp(score.experienceMatch),
                locationMatch: clamp(score.locationMatch),
                salaryMatch: clamp(score.salaryMatch),
                acceptanceScore: clamp(score.acceptanceScore),
                matchReason: score.matchReason || "",
                missingSkills: (score.missingSkills || []).slice(0, 5),
                strongPoints: (score.strongPoints || []).slice(0, 5),
            });
        }
    }

    return results;
}

function clamp(val: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, Math.round(val || 0)));
}

export interface BatchScoreResult {
    scored: number;
    skipped: number;
    total: number;
    batches: number;
}

/**
 * Score all active jobs against a user's profile.
 * Processes in batches of 10, skips already-scored jobs (unless force=true).
 */
export async function scoreAllJobs(userId: string, force = false): Promise<BatchScoreResult> {
    if (!isGrokConfigured()) {
        return { scored: 0, skipped: 0, total: 0, batches: 0 };
    }

    // Get user profile
    const profile = await prisma.profile.findUnique({
        where: { userId },
        include: { experiences: true, educations: true, skills: true },
    });

    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    // Get all active jobs
    const allJobs = await prisma.job.findMany({
        where: { isActive: true },
        orderBy: { postedAt: "desc" },
        take: 500, // cap at 500
    });

    // Get already-scored job IDs (skip those unless forced)
    let jobsToScore = allJobs;
    let skipped = 0;

    if (!force) {
        const existingScores = await prisma.jobScore.findMany({
            where: { userId, jobId: { in: allJobs.map((j) => j.id) } },
            select: { jobId: true },
        });
        const scoredIds = new Set(existingScores.map((s) => s.jobId));
        jobsToScore = allJobs.filter((j) => !scoredIds.has(j.id));
        skipped = allJobs.length - jobsToScore.length;
    }

    const profileData: ProfileData = {
        fullName: profile.fullName,
        headline: profile.headline,
        summary: profile.summary,
        location: profile.location,
        skills: profile.skills.map((s) => ({ name: s.name, level: s.level })),
        experiences: profile.experiences.map((e) => ({
            title: e.title,
            company: e.company,
            current: e.current,
            startDate: e.startDate.toISOString(),
            endDate: e.endDate?.toISOString() || null,
        })),
        educations: profile.educations.map((e) => ({
            institution: e.institution,
            degree: e.degree,
            field: e.field,
        })),
        preferences: profile.preferences,
    };

    // Process in batches of 10
    const BATCH_SIZE = 10;
    let scored = 0;
    let batches = 0;

    for (let i = 0; i < jobsToScore.length; i += BATCH_SIZE) {
        const batch = jobsToScore.slice(i, i + BATCH_SIZE);
        const jobData: JobData[] = batch.map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            remoteType: j.remoteType,
            salaryMin: j.salaryMin,
            salaryMax: j.salaryMax,
            description: j.description,
            requirements: j.requirements,
        }));

        try {
            const scores = await scoreBatch(profileData, jobData);

            // Upsert each score
            for (const [jobId, score] of scores) {
                await prisma.jobScore.upsert({
                    where: { userId_jobId: { userId, jobId } },
                    create: {
                        userId,
                        jobId,
                        ...score,
                    },
                    update: {
                        ...score,
                        scoredAt: new Date(),
                    },
                });
                scored++;
            }

            batches++;
            console.log(`   📊 Batch ${batches}: scored ${scores.size}/${batch.length} jobs`);
        } catch (err) {
            console.warn(`   ⚠️ Batch ${batches + 1} failed:`, (err as Error).message);
            batches++;
        }

        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < jobsToScore.length) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    return { scored, skipped, total: allJobs.length, batches };
}

/**
 * Get pre-scored, sorted jobs for a user.
 * Sort: matchScore DESC, then salaryMax DESC.
 */
export async function getMatchedJobs(
    userId: string,
    opts: { page: number; limit: number; minScore?: number }
) {
    const { page, limit, minScore = 0 } = opts;

    const where: any = {
        userId,
        matchScore: { gte: minScore },
    };

    const [scores, total] = await Promise.all([
        prisma.jobScore.findMany({
            where,
            include: {
                job: true,
            },
            orderBy: [
                { matchScore: "desc" },
                { job: { salaryMax: "desc" } },
            ],
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.jobScore.count({ where }),
    ]);

    return {
        items: scores.map((s) => ({
            job: s.job,
            scoring: {
                matchScore: s.matchScore,
                skillMatch: s.skillMatch,
                experienceMatch: s.experienceMatch,
                locationMatch: s.locationMatch,
                salaryMatch: s.salaryMatch,
                acceptanceScore: s.acceptanceScore,
                matchReason: s.matchReason,
                missingSkills: s.missingSkills,
                strongPoints: s.strongPoints,
                scoredAt: s.scoredAt,
            },
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}
