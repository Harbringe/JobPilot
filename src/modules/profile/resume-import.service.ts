import { createRequire } from "module";
import { getAIClient } from "../ai/providers/index.js";
import type { ProfileData } from "../../types/index.js";
import type { ChatMessage } from "../ai/providers/types.js";

const require = createRequire(import.meta.url);

type PdfParseResult = { text: string; numpages: number; info: Record<string, unknown> };
type PdfParseFn = (dataBuffer: Buffer) => Promise<PdfParseResult>;

function getPdfParse(): PdfParseFn {
    // pdf-parse v1 is CJS; createRequire returns module.exports which is the function itself.
    // Guard against interop wrappers that may nest it under .default.
    const mod = require("pdf-parse") as PdfParseFn | { default: PdfParseFn };
    return typeof mod === "function" ? mod : (mod as { default: PdfParseFn }).default;
}

// ─── Text extraction ──────────────────────────────────────────────

export async function extractTextFromBuffer(buffer: Buffer, mimetype: string): Promise<string> {
    if (mimetype === "application/pdf" || mimetype === "application/x-pdf") {
        const pdfParse = getPdfParse();
        const data = await pdfParse(buffer);
        return data.text;
    }

    if (
        mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mimetype === "application/docx"
    ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }

    // Plain text or DOC fallback
    return buffer.toString("utf-8");
}

// ─── Deterministic pre-extraction ─────────────────────────────────
// LLMs sometimes hallucinate or miss contact details. Pull the obvious
// stuff with regex first, then pass it to the model as ground truth.

interface PreExtracted {
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    otherUrls: string[];
}

function normalizeUrl(raw: string): string | undefined {
    let url = raw.trim().replace(/[),.;]+$/, "");
    if (!url) return undefined;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
        new URL(url);
        return url;
    } catch {
        return undefined;
    }
}

function preExtract(text: string): PreExtracted {
    const out: PreExtracted = { otherUrls: [] };

    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) out.email = emailMatch[0];

    // International + US phone formats. Order matters — try longest first.
    const phoneMatch =
        text.match(/\+\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{0,4}/) ||
        text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    if (phoneMatch) {
        out.phone = phoneMatch[0].replace(/\s+/g, " ").trim();
    }

    const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_-]+\/?/i);
    if (linkedinMatch) out.linkedinUrl = normalizeUrl(linkedinMatch[0]);

    const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i);
    if (githubMatch) out.githubUrl = normalizeUrl(githubMatch[0]);

    // Generic URL hunter — captures portfolios, dev.to, behance, dribbble, etc.
    const allUrls = text.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?/gi) ?? [];
    for (const u of allUrls) {
        const norm = normalizeUrl(u);
        if (!norm) continue;
        const host = new URL(norm).hostname.toLowerCase();
        if (host.includes("linkedin.com")) continue;
        if (host.includes("github.com")) continue;
        if (host.endsWith("@") || /^[\w.+-]+@/.test(u)) continue; // skip emails
        if (!out.otherUrls.includes(norm)) out.otherUrls.push(norm);
    }

    // First non-linkedin/non-github URL is the portfolio candidate.
    if (out.otherUrls.length > 0) {
        out.portfolioUrl = out.otherUrls.find((u) => {
            const h = new URL(u).hostname;
            // Skip company sites that are likely a current employer, not a portfolio.
            return !/\.(?:gov|edu)$/.test(h);
        });
    }

    return out;
}

// ─── AI profile extraction ────────────────────────────────────────

const SYSTEM_PROMPT = `You are a meticulous resume parser. Your job is to extract EVERY piece of information from the resume into structured JSON. You never invent facts — but you MAY infer obvious things from context (e.g. derive a headline from the most recent job title, infer skill level from seniority words). Return only valid JSON. No markdown fences, no commentary.`;

const USER_TEMPLATE = (text: string, hints: PreExtracted) => `Extract ALL structured profile information from the resume text below.

# Hints (already extracted with regex — use these verbatim where provided, do NOT invent alternatives)
${hints.email ? `- email: ${hints.email}` : "- email: (not found)"}
${hints.phone ? `- phone: ${hints.phone}` : "- phone: (not found)"}
${hints.linkedinUrl ? `- linkedinUrl: ${hints.linkedinUrl}` : "- linkedinUrl: (not found)"}
${hints.githubUrl ? `- githubUrl: ${hints.githubUrl}` : "- githubUrl: (not found)"}
${hints.portfolioUrl ? `- portfolioUrl candidate: ${hints.portfolioUrl}` : "- portfolioUrl: (not found)"}

# Required JSON shape
{
  "fullName": "string — the candidate's full name",
  "headline": "string — current or most recent job title; if absent, infer from the most recent experience",
  "summary": "string — full professional summary/objective. If the resume has no explicit summary section, GENERATE a tight 2–3 sentence summary from the most recent role, total years of experience, and top skills.",
  "phone": "string",
  "location": "string — 'City, Country' or 'City, State'. Infer from the most recent role's location if no top-line location is given.",
  "linkedinUrl": "string (full https URL or empty string)",
  "githubUrl": "string (full https URL or empty string)",
  "portfolioUrl": "string (full https URL or empty string) — personal website / portfolio. If absent, leave empty.",
  "experiences": [
    {
      "company": "string",
      "title": "string",
      "location": "string",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or null if current",
      "current": false,
      "bullets": ["each bullet point exactly as written — one array item per bullet. Capture EVERY bullet, never summarise."]
    }
  ],
  "educations": [
    {
      "institution": "string",
      "degree": "string — e.g. 'B.S.', 'M.S.', 'PhD', 'B.Tech'",
      "field": "string — e.g. 'Computer Science', 'Mechanical Engineering'",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or null if ongoing",
      "gpa": "string — only if explicitly listed, e.g. '3.8/4.0' or '8.7/10'"
    }
  ],
  "skills": [
    {
      "name": "string — single skill like 'TypeScript' or 'AWS Lambda'. Split comma-separated lists into individual items.",
      "level": "BEGINNER | INTERMEDIATE | ADVANCED | EXPERT — infer from years of experience and seniority signals (Senior/Lead/Principal => ADVANCED+, 5+ years => ADVANCED, primary stack at current role => ADVANCED, mentioned once => INTERMEDIATE)",
      "category": "string — one of: 'Languages', 'Frameworks', 'Databases', 'Cloud & DevOps', 'Tools', 'Soft Skills', 'Domain'"
    }
  ],
  "projects": [
    {
      "name": "string",
      "bullets": ["each bullet / description line as separate array item — capture EVERY one"],
      "url": "string (full https URL or empty string)",
      "techStack": ["string — one tech per item"]
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "issueDate": "YYYY-MM",
      "url": "string (full https URL or empty string)"
    }
  ]
}

# Hard rules
- Dates MUST be YYYY-MM. If only a year is given, use "YYYY-01". If only a month name is given without year, infer year from neighbours; if impossible, omit.
- For currently-held jobs/education: set endDate to null AND current to true.
- bullets[] for experiences AND projects: list EVERY single bullet point. Never merge, summarise, or drop bullets.
- Skills: split "Python, JavaScript, SQL" into THREE separate entries — never one entry with comma-joined names.
- Include EVERY experience, EVERY education entry, EVERY skill, EVERY project, EVERY certification. Completeness matters more than brevity.
- Use the regex-extracted contact info verbatim. Do not "improve" emails or phone numbers.
- URLs must include the https:// scheme. If the resume shows "linkedin.com/in/foo", output "https://linkedin.com/in/foo".

Resume text:
${text.slice(0, 16000)}`;

// Focused follow-up call when the main parse truncates and emits empty
// arrays for trailing sections. Asks the model for ONLY those sections so
// the output budget isn't spent on re-listing experience bullets.
async function fillMissingSections(
    ai: NonNullable<Awaited<ReturnType<typeof getAIClient>>>,
    resumeText: string,
    missing: { educations: boolean; skills: boolean; projects: boolean; certifications: boolean }
): Promise<Record<string, unknown> | null> {
    const wanted: string[] = [];
    if (missing.educations) wanted.push(`"educations": [{"institution":"string","degree":"string","field":"string","startDate":"YYYY-MM","endDate":"YYYY-MM or null","gpa":"string"}]`);
    if (missing.skills) wanted.push(`"skills": [{"name":"string — ONE skill per entry, never comma-joined","level":"BEGINNER|INTERMEDIATE|ADVANCED|EXPERT","category":"Languages|Frameworks|Databases|Cloud & DevOps|Tools|Soft Skills|Domain"}]`);
    if (missing.projects) wanted.push(`"projects": [{"name":"string","bullets":["each bullet as a separate item — capture EVERY bullet"],"url":"string","techStack":["string"]}]`);
    if (missing.certifications) wanted.push(`"certifications": [{"name":"string","issuer":"string","issueDate":"YYYY-MM","url":"string"}]`);
    if (wanted.length === 0) return null;

    return ai.chatJSON<Record<string, unknown>>(
        [
            {
                role: "system",
                content: "You extract structured data from resumes. Return only valid JSON, no markdown. Include every item — do not summarise.",
            },
            {
                role: "user",
                content: `Extract ONLY these sections from the resume below. Return a JSON object with the requested keys (use empty arrays for sections genuinely not present).

Required shape:
{
  ${wanted.join(",\n  ")}
}

Rules:
- Split comma-separated skill lists into individual entries.
- Dates strictly YYYY-MM; year-only becomes "YYYY-01".
- Skills.category MUST be one of: Languages, Frameworks, Databases, Cloud & DevOps, Tools, Soft Skills, Domain.
- For projects/certifications: include EVERY entry from the resume, do not drop any.

Resume text:
${resumeText.slice(0, 16000)}`,
            },
        ],
        { temperature: 0.1, maxTokens: 5000 }
    );
}

async function generateSummaryFallback(
    ai: NonNullable<Awaited<ReturnType<typeof getAIClient>>>,
    profile: Partial<ProfileData>
): Promise<string | undefined> {
    if (!profile.experiences || profile.experiences.length === 0) return undefined;
    const exp = profile.experiences.slice(0, 3).map((e) =>
        `${e.title} at ${e.company} (${e.startDate}${e.endDate ? `–${e.endDate}` : "–present"})`
    ).join("; ");
    const topSkills = (profile.skills ?? []).slice(0, 12).map((s) => s.name).join(", ");
    const res = await ai.chatJSON<{ summary: string }>(
        [
            {
                role: "system",
                content: "You write 2–3 sentence professional summaries for resumes. Respond as JSON: { \"summary\": \"...\" }. No markdown.",
            },
            {
                role: "user",
                content: `Headline: ${profile.headline ?? "(unspecified)"}\nRecent roles: ${exp}\nTop skills: ${topSkills}\n\nWrite a tight 2–3 sentence summary in the first person voice (no "I", drop the pronoun — e.g. "Senior engineer with 8 years building..."). Focus on years of experience, primary stack, and the kind of impact in the most recent roles.`,
            },
        ],
        { temperature: 0.4, maxTokens: 300 }
    );
    return res?.summary?.slice(0, 2000);
}

export async function parseProfileFromText(userId: string, resumeText: string): Promise<Partial<ProfileData>> {
    const ai = await getAIClient(userId);
    if (!ai) {
        throw new Error("AI provider not configured. Set your API key in Settings.");
    }

    const hints = preExtract(resumeText);

    const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_TEMPLATE(resumeText, hints) },
    ];

    type WithBullets = { bullets?: string[]; [k: string]: unknown };
    // Resumes can have a lot of detail (experience bullets, skill lists). The
    // default 2 KB output budget gets exhausted mid-JSON and the model emits
    // empty arrays for the trailing sections (education/skills/projects) to
    // close the response cleanly. Give this call a generous budget.
    const raw = await ai.chatJSON<Record<string, unknown>>(messages, {
        temperature: 0.1,
        maxTokens: 8000,
    });
    if (!raw) return {};

    // Accept valid http(s) URLs, prepend https:// when missing.
    // Returns "" for unparseable input (Zod accepts empty string via .or(z.literal(""))).
    const safeUrl = (v: unknown): string | undefined => {
        if (typeof v !== "string") return undefined;
        const trimmed = v.trim();
        if (!trimmed) return "";
        const norm = normalizeUrl(trimmed);
        return norm ?? "";
    };

    // null → undefined for optional string fields (Zod rejects null)
    const safeStr = (v: unknown): string | undefined =>
        v == null || v === "" ? undefined : typeof v === "string" ? v.trim() : undefined;

    // Clamp a string to the Zod-schema max so we never trigger validation errors.
    // Undefined passes through unchanged so optional fields stay optional.
    const clamp = (s: string | undefined, max: number): string | undefined =>
        s == null ? undefined : s.length > max ? s.slice(0, max) : s;

    // GPA is z.string().max(10) — AIs love to append "First Class" / "Magna Cum Laude".
    // Strip everything after the numeric portion so we don't blow the 10-char limit.
    const cleanGpa = (v: unknown): string | undefined => {
        const s = safeStr(v);
        if (!s) return undefined;
        const m = s.match(/(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/);
        const numeric = (m?.[1] ?? s).replace(/\s+/g, "");
        return numeric.slice(0, 10);
    };

    // Join bullets[] → description string, or fall through to plain string
    const bulletsToDesc = (item: WithBullets): string | undefined => {
        if (Array.isArray(item.bullets) && item.bullets.length > 0) {
            return item.bullets
                .map((b: unknown) => String(b).replace(/^[-•·*]\s*/, "• "))
                .filter((b) => b.replace(/^•\s*/, "").length > 0)
                .join("\n")
                .slice(0, 4900);
        }
        return safeStr(item.description)?.slice(0, 4900);
    };

    const experiences: ProfileData["experiences"] = Array.isArray(raw.experiences)
        ? (raw.experiences as WithBullets[]).map((e) => ({
            company: clamp(String(e.company ?? "").trim(), 200) || "",
            title: clamp(String(e.title ?? "").trim(), 200) || "",
            location: clamp(safeStr(e.location), 200),
            startDate: safeStr(e.startDate) ?? "2000-01",
            endDate: e.current ? undefined : safeStr(e.endDate) ?? undefined,
            current: Boolean(e.current),
            description: bulletsToDesc(e),
        })).filter((e) => e.company && e.title).slice(0, 50)
        : [];

    const educations: ProfileData["educations"] = Array.isArray(raw.educations)
        ? (raw.educations as Record<string, unknown>[]).map((e) => ({
            institution: clamp(String(e.institution ?? "").trim(), 300) || "",
            degree: clamp(String(e.degree ?? "").trim(), 200) || "",
            field: clamp(safeStr(e.field), 200),
            startDate: safeStr(e.startDate) ?? "2000-01",
            endDate: safeStr(e.endDate),
            gpa: cleanGpa(e.gpa),
        })).filter((e) => e.institution && e.degree).slice(0, 30)
        : [];

    // Dedupe skills by lowercase name (LLMs sometimes emit "React" and "react.js").
    const skillSeen = new Set<string>();
    const skills: ProfileData["skills"] = Array.isArray(raw.skills)
        ? (raw.skills as Record<string, unknown>[])
            .flatMap((s) => {
                // Split any "Python, JS, SQL" the AI failed to break apart.
                const name = String(s.name ?? "").trim();
                const parts = name.split(/\s*[,;•]\s*/).filter(Boolean);
                return parts.map((p) => ({
                    name: clamp(p, 100) || "",
                    level: (["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].includes(String(s.level))
                        ? s.level : "INTERMEDIATE") as ProfileData["skills"][number]["level"],
                    category: clamp(safeStr(s.category), 50),
                }));
            })
            .filter((s) => {
                if (!s.name) return false;
                const key = s.name.toLowerCase();
                if (skillSeen.has(key)) return false;
                skillSeen.add(key);
                return true;
            })
            .slice(0, 100)
        : [];

    const projects: ProfileData["projects"] = Array.isArray(raw.projects)
        ? (raw.projects as WithBullets[]).map((p) => ({
            name: clamp(String(p.name ?? "").trim(), 200) || "",
            description: bulletsToDesc(p),
            url: safeUrl(p.url),
            techStack: Array.isArray(p.techStack)
                ? p.techStack
                    .map((t) => clamp(String(t).trim(), 50))
                    .filter((t): t is string => Boolean(t))
                    .slice(0, 30)
                : [],
        })).filter((p) => p.name).slice(0, 50)
        : [];

    const certifications: ProfileData["certifications"] = Array.isArray(raw.certifications)
        ? (raw.certifications as Record<string, unknown>[]).map((c) => ({
            name: clamp(String(c.name ?? "").trim(), 300) || "",
            issuer: clamp(String(c.issuer ?? "").trim(), 200) || "",
            // accept both issueDate (correct) and dateObtained (legacy AI hallucination)
            dateObtained: safeStr(c.issueDate) ?? safeStr(c.dateObtained),
            credentialUrl: safeUrl(c.url) ?? safeUrl(c.credentialUrl),
        })).filter((c) => c.name && c.issuer).slice(0, 30)
        : [];

    // Build the result, with regex-extracted contact info as the source of truth
    // and AI output as the secondary source (or alternative phone format, etc.)
    const result: Partial<ProfileData> = {
        fullName: clamp(safeStr(raw.fullName), 200),
        headline: clamp(safeStr(raw.headline), 300),
        summary: clamp(safeStr(raw.summary), 4900),
        phone: clamp(hints.phone ?? safeStr(raw.phone), 30),
        location: clamp(safeStr(raw.location), 200),
        linkedinUrl: hints.linkedinUrl ?? safeUrl(raw.linkedinUrl),
        githubUrl: hints.githubUrl ?? safeUrl(raw.githubUrl),
        portfolioUrl: safeUrl(raw.portfolioUrl) || hints.portfolioUrl || undefined,
        experiences,
        educations,
        skills,
        projects,
        certifications,
    };

    // Recovery pass: if any trailing sections came back empty, the main parse
    // probably hit its output-token cap. Ask for ONLY the missing sections.
    const missing = {
        educations: educations.length === 0,
        skills: skills.length === 0,
        projects: projects.length === 0,
        certifications: certifications.length === 0,
    };
    if (missing.educations || missing.skills || missing.projects || missing.certifications) {
        try {
            const recovered = await fillMissingSections(ai, resumeText, missing);
            if (recovered) {
                if (missing.educations && Array.isArray(recovered.educations)) {
                    result.educations = (recovered.educations as Record<string, unknown>[])
                        .map((e) => ({
                            institution: clamp(String(e.institution ?? "").trim(), 300) || "",
                            degree: clamp(String(e.degree ?? "").trim(), 200) || "",
                            field: clamp(safeStr(e.field), 200),
                            startDate: safeStr(e.startDate) ?? "2000-01",
                            endDate: safeStr(e.endDate),
                            gpa: cleanGpa(e.gpa),
                        }))
                        .filter((e) => e.institution && e.degree)
                        .slice(0, 30);
                }
                if (missing.skills && Array.isArray(recovered.skills)) {
                    const seen = new Set<string>();
                    result.skills = (recovered.skills as Record<string, unknown>[])
                        .flatMap((s) => {
                            const name = String(s.name ?? "").trim();
                            const parts = name.split(/\s*[,;•]\s*/).filter(Boolean);
                            return parts.map((p) => ({
                                name: clamp(p, 100) || "",
                                level: (["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].includes(String(s.level))
                                    ? s.level : "INTERMEDIATE") as ProfileData["skills"][number]["level"],
                                category: clamp(safeStr(s.category), 50),
                            }));
                        })
                        .filter((s) => {
                            if (!s.name) return false;
                            const k = s.name.toLowerCase();
                            if (seen.has(k)) return false;
                            seen.add(k);
                            return true;
                        })
                        .slice(0, 100);
                }
                if (missing.projects && Array.isArray(recovered.projects)) {
                    result.projects = (recovered.projects as WithBullets[])
                        .map((p) => ({
                            name: clamp(String(p.name ?? "").trim(), 200) || "",
                            description: bulletsToDesc(p),
                            url: safeUrl(p.url),
                            techStack: Array.isArray(p.techStack)
                                ? p.techStack
                                    .map((t) => clamp(String(t).trim(), 50))
                                    .filter((t): t is string => Boolean(t))
                                    .slice(0, 30)
                                : [],
                        }))
                        .filter((p) => p.name)
                        .slice(0, 50);
                }
                if (missing.certifications && Array.isArray(recovered.certifications)) {
                    result.certifications = (recovered.certifications as Record<string, unknown>[])
                        .map((c) => ({
                            name: clamp(String(c.name ?? "").trim(), 300) || "",
                            issuer: clamp(String(c.issuer ?? "").trim(), 200) || "",
                            dateObtained: safeStr(c.issueDate) ?? safeStr(c.dateObtained),
                            credentialUrl: safeUrl(c.url) ?? safeUrl(c.credentialUrl),
                        }))
                        .filter((c) => c.name && c.issuer)
                        .slice(0, 30);
                }
            }
        } catch (err) {
            console.warn("recovery pass for missing sections failed:", (err as Error).message);
        }
    }

    // Fallbacks: if AI missed headline/summary/location, derive them.
    if (!result.headline && experiences.length > 0) {
        result.headline = experiences[0].title;
    }
    if (!result.location && experiences.length > 0) {
        result.location = experiences.find((e) => e.location)?.location;
    }
    if (!result.summary || result.summary.length < 30) {
        try {
            const generated = await generateSummaryFallback(ai, result);
            if (generated) result.summary = generated;
        } catch (err) {
            console.warn("summary fallback failed:", (err as Error).message);
        }
    }

    return result;
}
