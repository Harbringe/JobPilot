import type { Browser } from "playwright";
import { chromium } from "playwright";

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
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

export const NAV_TIMEOUT_MS = Math.max(5000, Number(process.env.PORTAL_NAV_TIMEOUT_MS ?? 30000));
export const USER_AGENT =
    process.env.PORTAL_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
