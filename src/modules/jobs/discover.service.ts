import crypto from "crypto";
import { syncJobs } from "./jobFetcher.service.js";
import { startPortalScan, getScanTask } from "../portals/scanner.service.js";
import { scoreAllJobs } from "../ai/batchScoring.service.js";

export type DiscoverPhase = "syncing-feeds" | "scanning-portals" | "scoring" | "done" | "failed";

export interface DiscoverProgress {
    taskId: string;
    phase: DiscoverPhase;
    started: string;
    finished?: string;
    feeds?: { new: number; updated: number; total: number; sources: Record<string, number>; errors: string[] };
    portals?: { taskId: string; status: string; portalsTotal: number; portalsDone: number; new: number; updated: number; errors: number };
    scoring?: { scored: number; skipped: number; total: number; batches: number };
    error?: string;
}

const TASKS = new Map<string, DiscoverProgress>();
const TTL_MS = 60 * 60 * 1000;
function gc() {
    const now = Date.now();
    for (const [k, v] of TASKS) {
        const ts = Date.parse(v.finished ?? v.started);
        if (now - ts > TTL_MS) TASKS.delete(k);
    }
}

export function getDiscoverTask(id: string): DiscoverProgress | null {
    gc();
    return TASKS.get(id) ?? null;
}

export function startDiscover(userId: string, opts: { withPortals?: boolean; force?: boolean } = {}): DiscoverProgress {
    const taskId = crypto.randomUUID();
    const progress: DiscoverProgress = {
        taskId,
        phase: "syncing-feeds",
        started: new Date().toISOString(),
    };
    TASKS.set(taskId, progress);

    setImmediate(() => run(userId, taskId, opts).catch((err) => {
        const t = TASKS.get(taskId);
        if (!t) return;
        t.phase = "failed";
        t.error = (err as Error).message;
        t.finished = new Date().toISOString();
    }));

    return progress;
}

async function run(userId: string, taskId: string, opts: { withPortals?: boolean; force?: boolean }) {
    const t = TASKS.get(taskId);
    if (!t) return;

    // Phase 1 — feed sync across all configured providers
    // (Remotive, Arbeitnow, Jobicy, TheMuse, RemoteOK, Adzuna*, JSearch*)
    // * key-gated; skipped when not configured.
    t.phase = "syncing-feeds";
    try {
        const feeds = await syncJobs();
        t.feeds = {
            new: feeds.new,
            updated: feeds.updated,
            total: feeds.total,
            sources: feeds.sources,
            errors: feeds.errors,
        };
    } catch (err) {
        t.feeds = { new: 0, updated: 0, total: 0, sources: {}, errors: [(err as Error).message] };
    }

    // Phase 2 — portal scan (best effort; opt-in)
    if (opts.withPortals) {
        t.phase = "scanning-portals";
        const scanTask = await startPortalScan({ userId, all: true });
        // Poll the scan task until done
        for (let i = 0; i < 600; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const s = getScanTask(scanTask.taskId);
            if (!s) break;
            t.portals = {
                taskId: s.taskId,
                status: s.status,
                portalsTotal: s.portalsTotal,
                portalsDone: s.portalsDone,
                new: s.new,
                updated: s.updated,
                errors: s.errors.length,
            };
            if (s.status !== "running") break;
        }
    }

    // Phase 3 — AI scoring
    t.phase = "scoring";
    try {
        const scoring = await scoreAllJobs(userId, opts.force ?? false);
        t.scoring = scoring;
    } catch (err) {
        t.error = `Scoring failed: ${(err as Error).message}`;
    }

    t.phase = "done";
    t.finished = new Date().toISOString();
}
