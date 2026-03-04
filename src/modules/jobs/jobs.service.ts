import { prisma } from "../../db/index.js";
import { Prisma } from "@prisma/client";

interface JobQuery {
    page: number;
    limit: number;
    search?: string;
    location?: string;
    remoteType?: string;
    salaryMin?: number;
    source?: string;
    sort?: "date" | "salary" | "company";
}

export async function getJobs(query: JobQuery) {
    const { page, limit, search, location, remoteType, salaryMin, source, sort } = query;

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
        where.remoteType = remoteType as any;
    }

    if (salaryMin) {
        where.salaryMin = { gte: salaryMin };
    }

    if (source) {
        where.source = source;
    }

    // Build sort order
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

    const [items, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.job.count({ where }),
    ]);

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

export async function getJobById(id: string) {
    return prisma.job.findUnique({
        where: { id },
    });
}
