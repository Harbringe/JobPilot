/**
 * AI Job Insights Service — generates detailed job analyses using Grok LLM.
 *
 * When a user selects a job, this generates a comprehensive breakdown:
 * title, work type, required skills, day-to-day tasks, pay info,
 * company reputation, work-life balance, growth opportunities, etc.
 *
 * Results are cached in the JobInsight table.
 */

import { prisma } from "../../db/index.js";
import { grokJSON, isGrokConfigured } from "./grok.client.js";

export interface JobInsightData {
    overview: {
        title: string;
        workType: string;           // "Full-time Remote", "Hybrid", etc.
        seniorityLevel: string;     // "Junior", "Mid", "Senior", "Lead", "Staff"
        estimatedYOE: string;       // "3-5 years"
        teamSize: string;           // "Small (5-10)", "Medium", "Large"
    };
    skills: {
        required: string[];         // must-have skills
        preferred: string[];        // nice-to-have
        techStack: string[];        // specific technologies mentioned
    };
    responsibilities: string[];     // what you'll actually do day-to-day
    compensation: {
        salaryRange: string;        // "$120K - $180K" or "Not specified"
        currency: string;
        benefits: string[];         // health, 401k, equity, etc.
        estimatedLeaves: string;     // "Standard (15-20 PTO days)" etc.
    };
    company: {
        name: string;
        industry: string;
        reputation: string;         // 2-3 sentences about company
        culture: string;            // work culture insights
        workingHours: string;       // "Standard 9-5", "Flexible", etc.
        growthOpportunities: string; // career growth potential
    };
    applicationTips: string[];      // 3-5 tips for applying
    redFlags: string[];             // potential concerns (if any)
    greenFlags: string[];           // positive signals
}

const INSIGHTS_SYSTEM_PROMPT = `You are an expert career advisor and job market analyst. Given a job posting, generate a comprehensive, detailed analysis that a job seeker would find valuable.

You MUST respond with valid JSON matching this exact schema:
{
  "overview": {
    "title": "<clean job title>",
    "workType": "<Full-time Remote / Full-time Hybrid / Full-time On-site / Contract / etc.>",
    "seniorityLevel": "<Junior / Mid / Senior / Staff / Lead / Principal / Director>",
    "estimatedYOE": "<estimated years of experience required, e.g. '3-5 years'>",
    "teamSize": "<estimated team size if inferable, else 'Unknown'>"
  },
  "skills": {
    "required": ["<must-have skills extracted from job>"],
    "preferred": ["<nice-to-have skills>"],
    "techStack": ["<specific technologies, frameworks, tools mentioned>"]
  },
  "responsibilities": ["<3-6 key day-to-day responsibilities>"],
  "compensation": {
    "salaryRange": "<salary range if mentioned, else 'Not specified'>",
    "currency": "<USD/EUR/etc>",
    "benefits": ["<benefits mentioned or commonly offered by such companies>"],
    "estimatedLeaves": "<PTO estimate based on industry norms>"
  },
  "company": {
    "name": "<company name>",
    "industry": "<industry/sector>",
    "reputation": "<2-3 sentences about the company, what they're known for>",
    "culture": "<work culture insights based on job description tone and company>",
    "workingHours": "<Standard 9-5 / Flexible / Async / etc.>",
    "growthOpportunities": "<career growth potential at this company>"
  },
  "applicationTips": ["<3-5 specific tips for this role>"],
  "redFlags": ["<potential concerns, if any>"],
  "greenFlags": ["<positive signals from the posting>"]
}

Be specific and helpful. Don't just restate the job description — add real insights.
If information isn't in the job posting, make educated inferences based on company, industry, and role norms. Clearly note when you're inferring vs. when info is stated.`;

/**
 * Get or generate AI insights for a job.
 * Returns cached insights if available (less than 7 days old).
 */
export async function getJobInsights(jobId: string): Promise<JobInsightData | null> {
    if (!isGrokConfigured()) return null;

    // Check cache first
    const cached = await prisma.jobInsight.findUnique({
        where: { jobId },
    });

    if (cached) {
        const ageMs = Date.now() - cached.generatedAt.getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (ageMs < sevenDays) {
            return cached.insights as unknown as JobInsightData;
        }
    }

    // Fetch the job
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return null;

    // Generate insights via LLM
    const insights = await grokJSON<JobInsightData>([
        { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
        {
            role: "user",
            content: `Analyze this job posting:\n\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location || "N/A"} (${job.remoteType || "N/A"})\nSalary: ${job.salaryMin ? `$${job.salaryMin.toLocaleString()}` : "N/A"} - ${job.salaryMax ? `$${job.salaryMax.toLocaleString()}` : "N/A"} ${job.salaryCurrency || ""}\nTags/Requirements: ${job.requirements.join(", ")}\nSource: ${job.source}\nApply URL: ${job.applyUrl}\n\nFull Description:\n${job.description.substring(0, 5000)}`,
        },
    ], { temperature: 0.3, maxTokens: 3000 });

    if (!insights) return null;

    // Cache the result
    await prisma.jobInsight.upsert({
        where: { jobId },
        create: { jobId, insights: insights as any },
        update: { insights: insights as any, generatedAt: new Date() },
    });

    return insights;
}
