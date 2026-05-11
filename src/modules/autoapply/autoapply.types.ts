export type AtsKind = "greenhouse" | "lever" | "ashby" | "unknown";

export interface FormField {
    label: string;
    /** matched candidate value (may be empty) */
    value: string;
    /** form input type — text, email, tel, file, textarea, select, custom */
    inputType: string;
    required: boolean;
    /** true if we successfully filled it via Playwright */
    filled: boolean;
}

export interface AutoApplyKit {
    ats: AtsKind;
    applyUrl: string;
    fields: FormField[];
    /** path under public/ (relative URL) for the prefilled-form screenshot */
    screenshotUrl: string | null;
    blocked: boolean;
    blockedReason?: string;
    /** how many fields we matched out of how many required */
    coverage: { matched: number; total: number; requiredMatched: number; requiredTotal: number };
}

export function detectAts(url: string): AtsKind {
    const u = url.toLowerCase();
    if (u.includes("greenhouse.io") || u.includes("boards.greenhouse")) return "greenhouse";
    if (u.includes("lever.co") || u.includes("jobs.lever")) return "lever";
    if (u.includes("ashbyhq.com")) return "ashby";
    return "unknown";
}
