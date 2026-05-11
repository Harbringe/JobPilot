/**
 * Resume Service — LLM-powered resume content generation.
 * Uses Grok to create tailored resume content based on user profile + job description.
 */

import { prisma } from "../../db/index.js";
import { getAIClient, type AIClient } from "../ai/providers/index.js";

interface ResumeContent {
    professionalSummary: string;
    experiences: Array<{
        title: string;
        company: string;
        period: string;
        bullets: string[];
    }>;
    skills: {
        highlighted: string[];
        additional: string[];
    };
    education: Array<{
        degree: string;
        institution: string;
        year: string;
    }>;
}

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer. Given a candidate profile and a target job description, generate tailored resume content that emphasizes relevant experience and skills.

You MUST respond with valid JSON matching this exact schema:
{
  "professionalSummary": "<2-3 sentence tailored summary emphasizing relevant experience for this specific role>",
  "experiences": [
    {
      "title": "<job title>",
      "company": "<company name>",
      "period": "<start - end>",
      "bullets": ["<achievement-focused bullet points tailored to the target job, use metrics where possible>"]
    }
  ],
  "skills": {
    "highlighted": ["<skills that match the job requirements, listed first>"],
    "additional": ["<other relevant skills>"]
  },
  "education": [
    {
      "degree": "<degree>",
      "institution": "<school>",
      "year": "<graduation year>"
    }
  ]
}

Guidelines:
- Rewrite experience bullets to emphasize skills relevant to the target job
- Use action verbs and quantify achievements where possible
- Prioritize skills that match job requirements in the highlighted section
- Keep the summary concise but impactful, mentioning years of experience and key technologies
- Include ALL experiences from the profile but tailor bullet points
- Maximum 4 bullets per experience`;

export async function getResumesForApplication(applicationId: string, userId: string) {
    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
    });

    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    return prisma.resume.findMany({
        where: { applicationId },
        orderBy: { generatedAt: "desc" },
    });
}

export async function createResume(applicationId: string, userId: string, template: string, contentSnapshot?: any) {
    // Verify ownership and get the job + profile
    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
        include: { job: true },
    });

    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    let finalContent = contentSnapshot || {};

    // If AI is configured and no content was provided, generate tailored content
    if (!contentSnapshot) {
        const ai = await getAIClient(userId);
        if (ai) {
            const profile = await prisma.profile.findUnique({
                where: { userId },
                include: { experiences: true, educations: true, skills: true },
            });
            if (profile) {
                const generated = await generateResumeContent(ai, profile, application.job);
                if (generated) {
                    finalContent = generated;
                }
            }
        }
    }

    return prisma.resume.create({
        data: {
            applicationId,
            // pdfUrl is the legacy field; the real ATS PDF lives at atsPdfUrl
            // and is populated by pdf.service.generateAtsPdf().
            pdfUrl: "",
            template,
            contentSnapshot: finalContent,
        },
    });
}

async function generateResumeContent(ai: AIClient, profile: any, job: any): Promise<ResumeContent | null> {
    const profileText = `
CANDIDATE:
Name: ${profile.fullName}
Headline: ${profile.headline || "N/A"}
Summary: ${profile.summary || "N/A"}

Experience:
${profile.experiences.map((e: any) => `- ${e.title} at ${e.company} (${e.startDate.toISOString().split("T")[0]} - ${e.current ? "Present" : e.endDate?.toISOString().split("T")[0] || "N/A"}): ${e.description || ""}`).join("\n")}

Skills: ${profile.skills.map((s: any) => `${s.name} (${s.level})`).join(", ")}

Education:
${profile.educations.map((e: any) => `- ${e.degree} in ${e.field || "N/A"} from ${e.institution}`).join("\n")}`;

    const jobText = `
TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Requirements: ${job.requirements?.join(", ") || "N/A"}
Description: ${job.description?.substring(0, 2000) || "N/A"}`;

    return ai.chatJSON<ResumeContent>([
        { role: "system", content: RESUME_SYSTEM_PROMPT },
        { role: "user", content: `${profileText}\n\n---\n\n${jobText}\n\nGenerate tailored resume content for this candidate targeting this specific job.` },
    ], { temperature: 0.4, maxTokens: 2000 });
}
