import { prisma } from "../../db/index.js";
import { Prisma, RemoteType } from "@prisma/client";

interface JobQuery {
    page: number;
    limit: number;
    search?: string;
    location?: string;
    remoteType?: string;
    salaryMin?: number;
    salaryMax?: number;
    source?: string;
    sources?: string;
    postedWithinDays?: number;
    sort?: "date" | "salary" | "company" | "match" | "easy";
    /** Pass the signed-in user's id to enable match/easy sorts and attach scores. */
    userId?: string;
}

export async function getJobs(query: JobQuery) {
    const {
        page,
        limit,
        search,
        location,
        remoteType,
        salaryMin,
        salaryMax,
        source,
        sources,
        postedWithinDays,
        sort,
        userId,
    } = query;

    // Build dynamic where clause
    const where: Prisma.JobWhereInput = { isActive: true };

    if (search) {
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { company: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
        ];
    }

    if (location) {
        where.location = { contains: location, mode: "insensitive" };
    }

    if (remoteType) {
        where.remoteType = remoteType as RemoteType;
    }

    if (salaryMin) {
        // Prefer salaryMax >= floor (a $80k–$120k job should match salaryMin=$100k).
        where.salaryMax = { gte: salaryMin };
    }

    if (salaryMax) {
        where.salaryMin = { lte: salaryMax };
    }

    if (postedWithinDays) {
        const cutoff = new Date(Date.now() - postedWithinDays * 86_400_000);
        where.postedAt = { gte: cutoff };
    }

    // Source filter: either a single value (legacy) or a comma-separated list.
    const sourceList = (sources?.split(",").map((s) => s.trim()).filter(Boolean)) ?? (source ? [source] : []);
    if (sourceList.length === 1) {
        where.source = sourceList[0];
    } else if (sourceList.length > 1) {
        where.source = { in: sourceList };
    }

    // ── Personalized sorts ────────────────────────────────
    // For match/easy we need to join JobScore and sort by that table.
    // Prisma can't ORDER BY a related table directly here, so we do it in
    // two steps: pull JobScore rows for the user (already indexed by
    // [userId, matchScore desc]), apply the same filters via the joined
    // job, paginate, then hydrate the full Job rows.
    if (userId && (sort === "match" || sort === "easy")) {
        const scoreOrderBy: Prisma.JobScoreOrderByWithRelationInput =
            sort === "easy"
                ? { acceptanceScore: "desc" }
                : { matchScore: "desc" };

        const [scoreRows, total] = await Promise.all([
            prisma.jobScore.findMany({
                where: { userId, job: where },
                orderBy: [scoreOrderBy, { matchScore: "desc" }],
                skip: (page - 1) * limit,
                take: limit,
                include: { job: true },
            }),
            prisma.jobScore.count({ where: { userId, job: where } }),
        ]);

        const items = scoreRows.map((r) => ({
            ...r.job,
            matchScore: r.matchScore,
            acceptanceScore: r.acceptanceScore,
            missingSkills: r.missingSkills,
            strongPoints: r.strongPoints,
        }));

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    // ── Standard sorts ────────────────────────────────────
    let orderBy: Prisma.JobOrderByWithRelationInput;
    switch (sort) {
        case "salary":
            orderBy = { salaryMax: "desc" };
            break;
        case "company":
            orderBy = { company: "asc" };
            break;
        case "date":
        default:
            orderBy = { postedAt: "desc" };
            break;
    }

    const [rawItems, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            // When user is signed in, attach their score (if any) so the UI
            // can show match/acceptance even in date-sorted views.
            include: userId
                ? { jobScores: { where: { userId }, take: 1 } }
                : undefined,
        }),
        prisma.job.count({ where }),
    ]);

    const items = userId
        ? rawItems.map((j) => {
            const score = (j as { jobScores?: { matchScore: number; acceptanceScore: number; missingSkills: string[]; strongPoints: string[] }[] }).jobScores?.[0];
            const { jobScores: _drop, ...rest } = j as typeof j & { jobScores?: unknown };
            void _drop;
            return {
                ...rest,
                matchScore: score?.matchScore,
                acceptanceScore: score?.acceptanceScore,
                missingSkills: score?.missingSkills,
                strongPoints: score?.strongPoints,
            };
        })
        : rawItems;

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getJobById(id: string, userId?: string) {
    const job = await prisma.job.findUnique({
        where: { id },
        include: userId ? { jobScores: { where: { userId }, take: 1 } } : undefined,
    });
    if (!job || !userId) return job;
    const score = (job as { jobScores?: { matchScore: number; acceptanceScore: number; missingSkills: string[]; strongPoints: string[]; matchReason: string }[] }).jobScores?.[0];
    const { jobScores: _drop, ...rest } = job as typeof job & { jobScores?: unknown };
    void _drop;
    return {
        ...rest,
        matchScore: score?.matchScore,
        acceptanceScore: score?.acceptanceScore,
        missingSkills: score?.missingSkills,
        strongPoints: score?.strongPoints,
        matchReason: score?.matchReason,
    };
}

/**
 * Distinct sources currently present in the database — used by the frontend
 * to populate the source filter dropdown with only the providers that have
 * actually returned jobs.
 */
export async function getActiveSources(): Promise<string[]> {
    const rows = await prisma.job.findMany({
        where: { isActive: true },
        select: { source: true },
        distinct: ["source"],
        orderBy: { source: "asc" },
    });
    return rows.map((r) => r.source);
}
