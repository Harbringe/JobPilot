import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { prisma } from "../../db/index.js";
import { getAIClient } from "../ai/providers/index.js";
import { createResume } from "./resumes.service.js";
import { downloadObject, uploadObject } from "../../lib/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.resolve(__dirname, "../../../templates/ats-resume.html");
const PDF_BASE_URL = process.env.RESUME_PDF_BASE_URL ?? "/resumes";

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
    if (!browserPromise) {
        browserPromise = chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        });
    }
    return browserPromise;
}

export async function shutdownBrowser(): Promise<void> {
    if (browserPromise) {
        const b = await browserPromise;
        await b.close();
        browserPromise = null;
    }
}

interface ContentSnapshot {
    professionalSummary?: string;
    experiences?: Array<{
        title: string;
        company: string;
        period: string;
        bullets: string[];
    }>;
    skills?: { highlighted?: string[]; additional?: string[] };
    education?: Array<{ degree: string; institution: string; year: string }>;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderExperiencesHtml(content: ContentSnapshot): string {
    if (!content.experiences?.length) return "";
    return content.experiences
        .map(
            (e) => `
    <article style="margin-bottom: 4mm;">
      <div class="role">
        <h3>${escapeHtml(e.title || "")}</h3>
        <span class="period">${escapeHtml(e.period || "")}</span>
      </div>
      <div class="company">${escapeHtml(e.company || "")}</div>
      <ul>
        ${(e.bullets ?? []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
      </ul>
    </article>`
        )
        .join("");
}

function renderSkillsHtml(content: ContentSnapshot): string {
    const all = [
        ...(content.skills?.highlighted ?? []),
        ...(content.skills?.additional ?? []),
    ];
    if (all.length === 0) return "";
    return `<div class="skill-row">${all.map((s) => `<span>${escapeHtml(s)}</span>`).join("")}</div>`;
}

function renderEducationHtml(content: ContentSnapshot): string {
    if (!content.education?.length) return "";
    return content.education
        .map(
            (ed) => `
    <div class="education-line">
      <div><strong>${escapeHtml(ed.degree || "")}</strong>, ${escapeHtml(ed.institution || "")}</div>
      <div>${escapeHtml(ed.year || "")}</div>
    </div>`
        )
        .join("");
}

function renderKeywordsHtml(keywords: string[]): string {
    if (!keywords.length) return "";
    return keywords.map((k) => escapeHtml(k)).join(" · ");
}

/**
 * Tiny mustache-lite: handles {{var}}, {{{rawVar}}}, and {{#if var}}...{{/if}} blocks.
 * Intentionally minimal — no loops, no nested conditions. Avoids adding a template-engine dep.
 */
function renderTemplate(tpl: string, vars: Record<string, string | undefined | null>): string {
    let out = tpl.replace(/\{\{#if\s+([\w]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key: string, body: string) => {
        const v = vars[key];
        return v && String(v).length > 0 ? body : "";
    });
    out = out.replace(/\{\{\{(\w+)\}\}\}/g, (_m, key: string) => {
        const v = vars[key];
        return v == null ? "" : String(v);
    });
    out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
        const v = vars[key];
        return v == null ? "" : escapeHtml(String(v));
    });
    return out;
}

async function readTemplate(): Promise<string> {
    try {
        return await fs.readFile(TEMPLATE_PATH, "utf-8");
    } catch (err) {
        console.error("Template read failed at", TEMPLATE_PATH, (err as Error).message);
        throw new Error("RESUME_TEMPLATE_FAIL");
    }
}

async function extractKeywordsViaAi(userId: string, jobTitle: string, requirements: string[], description: string): Promise<string[]> {
    const ai = await getAIClient(userId);
    if (!ai) return [];
    const res = await ai.chatJSON<{ keywords: string[] }>(
        [
            {
                role: "system",
                content:
                    "Extract 8-12 ATS-relevant keywords (technologies, frameworks, methodologies, role-specific terms) from the job. Respond as JSON: { \"keywords\": [string, ...] }",
            },
            {
                role: "user",
                content: `Title: ${jobTitle}\nRequirements: ${requirements.slice(0, 20).join(", ")}\nDescription: ${description.substring(0, 2000)}`,
            },
        ],
        { temperature: 0.2, maxTokens: 400 }
    );
    return Array.isArray(res?.keywords) ? res!.keywords.slice(0, 12) : [];
}

export async function generateAtsPdf(
    userId: string,
    applicationId: string,
    regenerate: boolean
): Promise<{ resumeId: string; atsPdfUrl: string; keywords: string[] }> {
    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
        include: { job: true, resumes: { orderBy: { generatedAt: "desc" }, take: 1 } },
    });
    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    const profile = await prisma.profile.findUnique({
        where: { userId },
        include: { user: true },
    });
    if (!profile) throw new Error("PROFILE_NOT_FOUND");

    let resume = application.resumes[0];
    if (!resume || regenerate || !resume.contentSnapshot) {
        resume = await createResume(applicationId, userId, "ats", undefined);
    }

    const evaluation = await prisma.jobEvaluation.findUnique({
        where: { userId_jobId: { userId, jobId: application.jobId } },
    });
    let keywords: string[] = [];
    const personalization = (evaluation?.personalization as any) ?? null;
    if (Array.isArray(personalization?.resumeKeywords)) {
        keywords = personalization.resumeKeywords.slice(0, 12);
    } else {
        keywords = await extractKeywordsViaAi(
            userId,
            application.job.title,
            application.job.requirements,
            application.job.description
        );
    }

    const content = (resume.contentSnapshot as ContentSnapshot) ?? {};
    const tpl = await readTemplate();
    const html = renderTemplate(tpl, {
        fullName: profile.fullName,
        headline: profile.headline ?? "",
        location: profile.location ?? "",
        email: profile.user.email ?? "",
        phone: profile.phone ?? "",
        linkedinUrl: profile.linkedinUrl ?? "",
        githubUrl: profile.githubUrl ?? "",
        portfolioUrl: profile.portfolioUrl ?? "",
        summary: content.professionalSummary ?? profile.summary ?? "",
        experiencesHtml: renderExperiencesHtml(content),
        skillsHtml: renderSkillsHtml(content),
        educationHtml: renderEducationHtml(content),
        keywordsHtml: renderKeywordsHtml(keywords),
    });

    const filename = `${resume.id}.pdf`;

    let pdfBuffer: Buffer;
    const browser = await getBrowser();
    const ctx = await browser.newContext({
        locale: "en-US",
        userAgent: process.env.PORTAL_USER_AGENT,
    });
    try {
        const page = await ctx.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });
        await page.emulateMedia({ media: "print" });
        pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "12mm", bottom: "12mm", left: "14mm", right: "14mm" },
        });
    } catch (err) {
        console.error("PDF render failed:", (err as Error).message);
        throw new Error("PDF_RENDER_FAIL");
    } finally {
        await ctx.close();
    }

    await uploadObject("resumes", filename, pdfBuffer, "application/pdf");

    const atsPdfUrl = `${PDF_BASE_URL}/${filename}`;
    await prisma.resume.update({
        where: { id: resume.id },
        data: {
            atsPdfUrl,
            keywords,
            pdfGeneratedAt: new Date(),
        },
    });

    return { resumeId: resume.id, atsPdfUrl, keywords };
}

export async function streamAtsPdf(
    userId: string,
    applicationId: string
): Promise<{ buffer: Buffer; filename: string } | null> {
    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
        include: { resumes: { orderBy: { generatedAt: "desc" }, take: 1 } },
    });
    if (!application) throw new Error("APPLICATION_NOT_FOUND");
    const resume = application.resumes[0];
    if (!resume?.atsPdfUrl) return null;
    const filename = path.basename(resume.atsPdfUrl);
    try {
        const buffer = await downloadObject("resumes", filename);
        return { buffer, filename };
    } catch (err) {
        console.warn("ATS PDF fetch failed:", (err as Error).message);
        return null;
    }
}
