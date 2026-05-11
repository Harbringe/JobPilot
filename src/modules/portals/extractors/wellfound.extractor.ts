import type { NormalizedJob } from "../../jobs/providers/remotive.provider.js";
import { detectRemoteType, fingerprintFor, tagsFromText, type Extractor } from "./common.js";
import { getBrowser, NAV_TIMEOUT_MS, USER_AGENT } from "../playwright.pool.js";

/**
 * Wellfound (formerly AngelList) has aggressive anti-bot. Best-effort scrape:
 * - Set realistic UA + locale
 * - Wait for network idle, then scroll twice to trigger lazy-load
 * - One retry on TimeoutError
 */

async function attemptScrape(url: string) {
    const browser = await getBrowser();
    const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "en-US", viewport: { width: 1280, height: 1024 } });
    try {
        const page = await ctx.newPage();
        page.setDefaultTimeout(NAV_TIMEOUT_MS);
        await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });

        // lazy-load nudge
        for (let i = 0; i < 2; i++) {
            await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
            await page.waitForTimeout(1500);
        }

        const cards = await page.$$eval("a[href*='/jobs/'], a[href*='/company/']", (anchors) =>
            anchors
                .map((a) => {
                    const el = a as HTMLAnchorElement;
                    const text = (el.textContent ?? "").trim();
                    const href = el.href;
                    const card = el.closest("[class*='job']") as HTMLElement | null;
                    const meta = card ? (card.textContent ?? "").replace(text, "").trim() : "";
                    return { title: text, href, meta };
                })
                .filter((c) => c.title && c.href.includes("/jobs/"))
        );
        return cards;
    } finally {
        await ctx.close();
    }
}

export const wellfoundExtractor: Extractor = async (portal) => {
    let cards: Array<{ title: string; href: string; meta: string }>;
    try {
        cards = await attemptScrape(portal.url);
    } catch (err) {
        const msg = (err as Error).message ?? "";
        if (!/timeout/i.test(msg)) throw err;
        console.warn(`Wellfound first attempt timed out for ${portal.company}, retrying once`);
        cards = await attemptScrape(portal.url);
    }

    const seen = new Set<string>();
    const jobs: NormalizedJob[] = [];
    for (const c of cards) {
        if (seen.has(c.href)) continue;
        seen.add(c.href);

        if (portal.filterTags.length > 0) {
            const blob = `${c.title} ${c.meta}`.toLowerCase();
            const matched = portal.filterTags.some((t) => blob.includes(t.toLowerCase()));
            if (!matched) continue;
        }

        const description = c.meta || c.title;
        const location = c.meta.split(/[,·–—\-|]/).map((s) => s.trim()).find((s) => s.length > 0) ?? null;

        jobs.push({
            fingerprint: fingerprintFor("wellfound", portal.company, c.title, location, c.href),
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
            source: "wellfound",
            sourceUrl: c.href,
            applyUrl: c.href,
            postedAt: new Date(),
        });
    }
    return jobs;
};
