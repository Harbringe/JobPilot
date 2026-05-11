import crypto from "crypto";
import pLimit from "p-limit";
import { prisma } from "../../db/index.js";
import { upsertJobs } from "../jobs/jobFetcher.service.js";
import type { NormalizedJob } from "../jobs/providers/remotive.provider.js";
import { ashbyExtractor } from "./extractors/ashby.extractor.js";
import { greenhouseExtractor } from "./extractors/greenhouse.extractor.js";
import { leverExtractor } from "./extractors/lever.extractor.js";
import { workableExtractor } from "./extractors/workable.extractor.js";
import { wellfoundExtractor } from "./extractors/wellfound.extractor.js";
import type { Extractor } from "./extractors/common.js";

type Provider = "ASHBY" | "GREENHOUSE" | "LEVER" | "WORKABLE" | "WELLFOUND" | "CUSTOM";

const EXTRACTORS: Record<Provider, Extractor | null> = {
    ASHBY: ashbyExtractor,
    GREENHOUSE: greenhouseExtractor,
    LEVER: leverExtractor,
    WORKABLE: workableExtractor,
    WELLFOUND: wellfoundExtractor,
    CUSTOM: null,
};

export interface PortalScanProgress {
    taskId: string;
    status: "running" | "done" | "failed";
    started: string;
    finished?: string;
    portalsTotal: number;
    portalsDone: number;
    new: number;
    updated: number;
    errors: Array<{ portalId: string; company: string; provider: string; error: string }>;
}

// In-memory progress store; suitable for single-instance dev/prod.
// To horizontally scale, replace with Redis using ioredis (already a dep).
const TASKS = new Map<string, PortalScanProgress>();
const TASK_TTL_MS = 60 * 60 * 1000; // 1h
function gcTasks() {
    const now = Date.now();
    for (const [id, t] of TASKS) {
        const ts = t.finished ? Date.parse(t.finished) : Date.parse(t.started);
        if (now - ts > TASK_TTL_MS) TASKS.delete(id);
    }
}

export function getScanTask(taskId: string): PortalScanProgress | null {
    gcTasks();
    return TASKS.get(taskId) ?? null;
}

export async function startPortalScan(opts: {
    userId: string;
    portalIds?: string[];
    all?: boolean;
}): Promise<PortalScanProgress> {
    const where: any = {
        enabled: true,
        OR: [{ userId: opts.userId }, { userId: null }],
    };
    if (opts.portalIds && opts.portalIds.length > 0) {
        where.id = { in: opts.portalIds };
    }

    const portals = await prisma.portal.findMany({ where });
    const taskId = crypto.randomUUID();
    const progress: PortalScanProgress = {
        taskId,
        status: "running",
        started: new Date().toISOString(),
        portalsTotal: portals.length,
        portalsDone: 0,
        new: 0,
        updated: 0,
        errors: [],
    };
    TASKS.set(taskId, progress);

    if (portals.length === 0) {
        progress.status = "done";
        progress.finished = new Date().toISOString();
        return progress;
    }

    setImmediate(() => runScan(taskId, portals).catch((err) => {
        const t = TASKS.get(taskId);
        if (!t) return;
        t.status = "failed";
        t.finished = new Date().toISOString();
        t.errors.push({ portalId: "(orchestrator)", company: "", provider: "", error: (err as Error).message });
    }));

    return progress;
}

async function runScan(taskId: string, portals: Array<{ id: string; company: string; provider: Provider; url: string; filterTags: string[] }>) {
    const concurrency = Math.max(1, Number(process.env.PORTAL_SCAN_CONCURRENCY ?? 3));
    const limit = pLimit(concurrency);

    const tasks = portals.map((p) =>
        limit(async () => {
            const t = TASKS.get(taskId);
            if (!t) return;
            try {
                const extractor = EXTRACTORS[p.provider];
                if (!extractor) {
                    t.errors.push({ portalId: p.id, company: p.company, provider: p.provider, error: `No extractor for provider ${p.provider}` });
                    return;
                }
                const jobs: NormalizedJob[] = await extractor({
                    id: p.id,
                    company: p.company,
                    url: p.url,
                    filterTags: p.filterTags,
                });
                if (jobs.length > 0) {
                    const result = await upsertJobs(jobs);
                    t.new += result.new;
                    t.updated += result.updated;
                }
                await prisma.portal.update({
                    where: { id: p.id },
                    data: { lastScannedAt: new Date() },
                });
            } catch (err) {
                t.errors.push({
                    portalId: p.id,
                    company: p.company,
                    provider: p.provider,
                    error: (err as Error).message ?? "unknown error",
                });
            } finally {
                t.portalsDone++;
            }
        })
    );

    await Promise.all(tasks);
    const t = TASKS.get(taskId);
    if (t) {
        t.status = "done";
        t.finished = new Date().toISOString();
    }
}
