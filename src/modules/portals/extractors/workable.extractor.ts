import type { NormalizedJob } from "../../jobs/providers/remotive.provider.js";
import { detectRemoteType, fingerprintFor, tagsFromText, type Extractor } from "./common.js";
import { getBrowser, NAV_TIMEOUT_MS, USER_AGENT } from "../playwright.pool.js";

/**
 * Workable doesn't expose a simple public JSON board. We scrape the careers page DOM.
 */

export const workableExtractor: Extractor = async (portal) => {
    const browser = await getBrowser();
    const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "en-US" });
    try {
        const page = await ctx.newPage();
        page.setDefaultTimeout(NAV_TIMEOUT_MS);
        await page.goto(portal.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

        const cards = await page.$$eval("[data-ui='job'] a, ul[class*='job'] li a, a[href*='/j/']", (anchors) =>
            anchors.map((a) => {
                const el = a as HTMLAnchorElement;
                const text = (el.textContent ?? "").trim();
                const href = el.href;
                const cardEl = (el.closest("li") as HTMLElement | null)
                    ?? (el.closest("[data-ui='job']") as HTMLElement | null)
                    ?? (el.parentElement as HTMLElement | null);
                const meta = cardEl ? (cardEl.textContent ?? "").replace(text, "").trim() : "";
                return { title: text, href, meta };
            })
        );

        const seen = new Set<string>();
        const jobs: NormalizedJob[] = [];
        for (const c of cards) {
            if (!c.title || !c.href || seen.has(c.href)) continue;
            seen.add(c.href);

            if (portal.filterTags.length > 0) {
                const blob = `${c.title} ${c.meta}`.toLowerCase();
                const matched = portal.filterTags.some((t) => blob.includes(t.toLowerCase()));
                if (!matched) continue;
            }

            const description = c.meta || c.title;
            const location = c.meta.split(/[,·–—\-|]/).map((s) => s.trim()).find((s) => s.length > 0) ?? null;
            jobs.push({
                fingerprint: fingerprintFor("workable", portal.company, c.title, location, c.href),
                title: c.title,
                company: portal.company,
                companyLogoUrl: null,
                location,
                remoteType: detectRemoteType(`${c.title} ${c.meta}`),
                salaryMin: null,
                salaryMax: null,
                salaryCurrency: "USD",
                description: description.slice(0, 8000),
                requirements: tagsFromText(description, 8),
                source: "workable",
                sourceUrl: c.href,
                applyUrl: c.href,
                postedAt: new Date(),
            });
        }
        return jobs;
    } finally {
        await ctx.close();
    }
};
