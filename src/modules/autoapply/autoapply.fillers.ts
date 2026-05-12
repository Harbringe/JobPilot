import type { Page } from "playwright";
import { getBrowser, NAV_TIMEOUT_MS, USER_AGENT } from "../portals/playwright.pool.js";
import type { AtsKind, AutoApplyKit, FormField } from "./autoapply.types.js";
import { uploadObject } from "../../lib/supabase.js";

const SCREENSHOT_BASE_URL = process.env.AUTOAPPLY_SCREENSHOT_BASE_URL ?? "/autoapply";

export interface ApplicantData {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    location: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    portfolioUrl: string | null;
    resumePdfPath: string | null;
}

const FIELD_RULES: Array<{
    test: RegExp;
    pick: (a: ApplicantData) => string | null;
    inputTypeHints: string[];
}> = [
    { test: /^(first[\s-]?name|given[\s-]?name)$/i, pick: (a) => a.firstName, inputTypeHints: ["text"] },
    { test: /^(last[\s-]?name|family[\s-]?name|surname)$/i, pick: (a) => a.lastName, inputTypeHints: ["text"] },
    { test: /^(full[\s-]?name|name)$/i, pick: (a) => a.fullName, inputTypeHints: ["text"] },
    { test: /e[\s-]?mail/i, pick: (a) => a.email, inputTypeHints: ["email", "text"] },
    { test: /(phone|mobile|tel)/i, pick: (a) => a.phone, inputTypeHints: ["tel", "text"] },
    { test: /(linkedin)/i, pick: (a) => a.linkedinUrl, inputTypeHints: ["url", "text"] },
    { test: /(github)/i, pick: (a) => a.githubUrl, inputTypeHints: ["url", "text"] },
    { test: /(portfolio|website|personal[\s-]?site)/i, pick: (a) => a.portfolioUrl, inputTypeHints: ["url", "text"] },
    { test: /(city|location|address)/i, pick: (a) => a.location, inputTypeHints: ["text"] },
];

function matchValue(label: string, applicant: ApplicantData): string | null {
    const lower = label.trim();
    for (const rule of FIELD_RULES) {
        if (rule.test.test(lower)) return rule.pick(applicant);
    }
    return null;
}

interface ExtractedField {
    label: string;
    selector: string;
    inputType: string;
    required: boolean;
}

async function extractFields(page: Page, container: string): Promise<ExtractedField[]> {
    return page.$$eval(
        `${container} input, ${container} textarea, ${container} select`,
        (nodes) =>
            nodes.flatMap((n) => {
                const el = n as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                if ((el as HTMLInputElement).type === "hidden") return [];
                const id = el.id;
                let label = "";
                if (id) {
                    const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                    if (lab) label = (lab.textContent ?? "").trim();
                }
                if (!label) {
                    const wrap = el.closest("label");
                    if (wrap) label = (wrap.textContent ?? "").trim();
                }
                if (!label) {
                    label = (el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.name ?? "").trim();
                }
                const required = el.required || el.getAttribute("aria-required") === "true" || /\*$/.test(label);
                const inputType = el.tagName === "TEXTAREA" ? "textarea" : el.tagName === "SELECT" ? "select" : (el as HTMLInputElement).type || "text";
                let selector = id ? `#${CSS.escape(id)}` : "";
                if (!selector && el.name) selector = `[name="${CSS.escape(el.name)}"]`;
                if (!selector) return [];
                return [{ label: label.replace(/\s+\*\s*$/, "").trim(), selector, inputType, required }];
            })
    );
}

async function detectBlockers(page: Page): Promise<string | null> {
    const html = (await page.content()).toLowerCase();
    if (/recaptcha|g-recaptcha|hcaptcha|cf-turnstile|cloudflare challenge/.test(html)) return "CAPTCHA detected";
    if (/are you a human|verify you are human/.test(html)) return "Human-verification challenge detected";
    return null;
}

async function fillField(page: Page, field: ExtractedField, value: string): Promise<boolean> {
    try {
        if (field.inputType === "select") {
            await page.selectOption(field.selector, { label: value }).catch(async () => {
                await page.selectOption(field.selector, value);
            });
        } else if (field.inputType === "file") {
            // skip — handled separately
            return false;
        } else {
            await page.fill(field.selector, value);
        }
        return true;
    } catch {
        return false;
    }
}

async function uploadResume(page: Page, resumePath: string | null): Promise<boolean> {
    if (!resumePath) return false;
    const fileInputs = await page.$$('input[type="file"]');
    for (const input of fileInputs) {
        try {
            await input.setInputFiles(resumePath);
            return true;
        } catch {
            // continue trying
        }
    }
    return false;
}

const CONTAINER_BY_ATS: Record<AtsKind, string> = {
    greenhouse: "form#application_form, form[action*='greenhouse'], main, body",
    lever: "form, [class*='application'], main, body",
    ashby: "form, [class*='application'], main, body",
    unknown: "form, body",
};

export async function fillApplyForm(args: {
    ats: AtsKind;
    applyUrl: string;
    applicant: ApplicantData;
    taskId: string;
}): Promise<AutoApplyKit> {
    const { ats, applyUrl, applicant, taskId } = args;

    const browser = await getBrowser();
    const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "en-US" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    const result: AutoApplyKit = {
        ats,
        applyUrl,
        fields: [],
        screenshotUrl: null,
        blocked: false,
        coverage: { matched: 0, total: 0, requiredMatched: 0, requiredTotal: 0 },
    };

    try {
        await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
        await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {});

        const blocker = await detectBlockers(page);
        if (blocker) {
            result.blocked = true;
            result.blockedReason = blocker;
            return result;
        }

        const container = CONTAINER_BY_ATS[ats];
        const extracted = await extractFields(page, container);

        // Resume upload
        const resumeFilled = await uploadResume(page, applicant.resumePdfPath);

        const filled: FormField[] = [];
        for (const f of extracted) {
            let val: string | null = null;
            if (f.inputType === "file") {
                filled.push({
                    label: f.label || "Resume / CV",
                    value: applicant.resumePdfPath ?? "",
                    inputType: "file",
                    required: f.required,
                    filled: resumeFilled,
                });
                continue;
            }
            val = matchValue(f.label, applicant);
            let didFill = false;
            if (val) {
                didFill = await fillField(page, f, val);
            }
            filled.push({
                label: f.label,
                value: val ?? "",
                inputType: f.inputType,
                required: f.required,
                filled: didFill,
            });
        }

        // Coverage
        const total = filled.length;
        const matched = filled.filter((f) => f.filled).length;
        const requiredTotal = filled.filter((f) => f.required).length;
        const requiredMatched = filled.filter((f) => f.required && f.filled).length;
        result.coverage = { matched, total, requiredMatched, requiredTotal };
        result.fields = filled;

        try {
            const file = `${taskId}.png`;
            const buf = await page.screenshot({ type: "png", fullPage: true });
            await uploadObject("autoapply", file, buf, "image/png");
            result.screenshotUrl = `${SCREENSHOT_BASE_URL}/${file}`;
        } catch (err) {
            console.warn("auto-apply screenshot failed:", (err as Error).message);
        }

        return result;
    } finally {
        await ctx.close();
    }
}
