/**
 * AI Matching Service — scores jobs against user profiles using Grok LLM.
 */

import { grokJSON, isGrokConfigured } from "./grok.client.js";

export interface MatchScores {
    matchScore: number;       // 0-100 overall fit
    skillMatch: number;       // 0-100 skills alignment
    experienceMatch: number;  // 0-100 YOE alignment
    locationMatch: number;    // 0-100 location preference fit
    salaryMatch: number;      // 0-100 salary range overlap
    acceptanceScore: number;  // 0-100 likelihood of getting hired
    matchReason: string;      // 2-3 sentence explanation
    missingSkills: string[];  // skills from JD user lacks
    strongPoints: string[];   // user strengths that match
}

interface ProfileSummary {
    fullName: string;
    headline?: string | null;
    summary?: string | null;
    location?: string | null;
    skills: Array<{ name: string; level: string }>;
    experiences: Array<{ title: string; company: string; current: boolean; startDate: string; endDate?: string | null }>;
    educations: Array<{ institution: string; degree: string; field?: string | null }>;
    preferences?: any;
}

interface JobSummary {
    title: string;
    company: string;
    location?: string | null;
    remoteType?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    description: string;
    requirements: string[];
}

const MATCHING_SYSTEM_PROMPT = `You are an expert job matching AI. You analyze job descriptions and candidate profiles to provide precise compatibility scores.

You MUST respond with valid JSON matching this exact schema:
{
  "matchScore": <0-100 overall fit>,
  "skillMatch": <0-100 how well candidate skills match job requirements>,
  "experienceMatch": <0-100 years of experience alignment>,
  "locationMatch": <0-100 location/remote preference fit>,
  "salaryMatch": <0-100 salary range overlap (100 if no salary data)>,
  "acceptanceScore": <0-100 likelihood candidate would get hired>,
  "matchReason": "<2-3 sentences explaining the overall match>",
  "missingSkills": ["<skills from job that candidate lacks>"],
  "strongPoints": ["<candidate strengths that match well>"]
}

Scoring guidelines:
- 90-100: Near perfect match, candidate exceeds requirements
- 70-89: Strong match, meets most requirements
- 50-69: Moderate match, meets some requirements
- 30-49: Weak match, significant gaps
- 0-29: Poor match, most requirements unmet
- If salary data is missing, default salaryMatch to 75
- If location data is ambiguous, default locationMatch to 70
- Consider both explicit skill matches and transferable skills
- Factor in seniority level from job title vs candidate experience`;

function buildProfileText(profile: ProfileSummary): string {
    const totalYOE = profile.experiences.reduce((acc, exp) => {
        const start = new Date(exp.startDate);
        const end = exp.endDate ? new Date(exp.endDate) : new Date();
        return acc + (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    }, 0);

    return `
CANDIDATE PROFILE:
Name: ${profile.fullName}
Headline: ${profile.headline || "N/A"}
Location: ${profile.location || "N/A"}
Total Years of Experience: ${Math.round(totalYOE * 10) / 10}
Summary: ${profile.summary || "N/A"}

Skills: ${profile.skills.map((s) => `${s.name} (${s.level})`).join(", ")}

Experience:
${profile.experiences.map((e) => `- ${e.title} at ${e.company} (${e.startDate} - ${e.current ? "Present" : e.endDate || "N/A"})`).join("\n")}

Education:
${profile.educations.map((e) => `- ${e.degree} in ${e.field || "N/A"} from ${e.institution}`).join("\n")}

Preferences:
${profile.preferences ? JSON.stringify(profile.preferences) : "No preferences set"}`.trim();
}

function buildJobText(job: JobSummary): string {
    return `
JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "N/A"} (${job.remoteType || "N/A"})
Salary: ${job.salaryMin ? `$${job.salaryMin.toLocaleString()}` : "N/A"} - ${job.salaryMax ? `$${job.salaryMax.toLocaleString()}` : "N/A"}
Requirements/Tags: ${job.requirements.join(", ")}

Description:
${job.description.substring(0, 3000)}`.trim();
}

/**
 * Score a job against a user profile using Grok LLM.
 * Returns null if Grok is not configured — the caller should handle gracefully.
 */
export async function scoreJob(profile: ProfileSummary, job: JobSummary): Promise<MatchScores | null> {
    if (!isGrokConfigured()) {
        return null;
    }

    const profileText = buildProfileText(profile);
    const jobText = buildJobText(job);

    const result = await grokJSON<MatchScores>([
        { role: "system", content: MATCHING_SYSTEM_PROMPT },
        { role: "user", content: `${profileText}\n\n---\n\n${jobText}\n\nAnalyze this candidate-job match and provide scores.` },
    ], { temperature: 0.2, maxTokens: 1000 });

    if (!result) return null;

    // Clamp all scores to 0-100
    return {
        matchScore: clamp(result.matchScore),
        skillMatch: clamp(result.skillMatch),
        experienceMatch: clamp(result.experienceMatch),
        locationMatch: clamp(result.locationMatch),
        salaryMatch: clamp(result.salaryMatch),
        acceptanceScore: clamp(result.acceptanceScore),
        matchReason: result.matchReason || "",
        missingSkills: result.missingSkills || [],
        strongPoints: result.strongPoints || [],
    };
}

function clamp(val: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, Math.round(val || 0)));
}

/**
 * Score multiple jobs against a profile (batch).
 * Processes sequentially to avoid rate limits.
 */
export async function scoreJobs(
    profile: ProfileSummary,
    jobs: JobSummary[]
): Promise<Map<string, MatchScores>> {
    const results = new Map<string, MatchScores>();

    if (!isGrokConfigured()) return results;

    for (const job of jobs) {
        const key = `${job.title}-${job.company}`;
        const scores = await scoreJob(profile, job);
        if (scores) {
            results.set(key, scores);
        }
        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 200));
    }

    return results;
}
