import { prisma } from "../../db/index.js";
import type { CreatePortalInput, UpdatePortalInput } from "./portals.validation.js";

export async function listPortals(userId: string) {
    return prisma.portal.findMany({
        where: { OR: [{ userId }, { userId: null }] },
        orderBy: [{ provider: "asc" }, { company: "asc" }],
    });
}

export async function createPortal(userId: string, input: CreatePortalInput) {
    const dup = await prisma.portal.findFirst({
        where: { userId, company: input.company, provider: input.provider },
    });
    if (dup) throw new Error("PORTAL_DUPLICATE");

    return prisma.portal.create({
        data: {
            userId,
            company: input.company,
            provider: input.provider,
            url: input.url,
            filterTags: input.filterTags,
            enabled: input.enabled,
        },
    });
}

export async function updatePortal(userId: string, id: string, input: UpdatePortalInput) {
    const existing = await prisma.portal.findFirst({ where: { id, userId } });
    if (!existing) throw new Error("PORTAL_NOT_FOUND");

    return prisma.portal.update({
        where: { id },
        data: {
            ...(input.company !== undefined && { company: input.company }),
            ...(input.provider !== undefined && { provider: input.provider }),
            ...(input.url !== undefined && { url: input.url }),
            ...(input.filterTags !== undefined && { filterTags: input.filterTags }),
            ...(input.enabled !== undefined && { enabled: input.enabled }),
        },
    });
}

export async function deletePortal(userId: string, id: string) {
    const existing = await prisma.portal.findFirst({ where: { id, userId } });
    if (!existing) throw new Error("PORTAL_NOT_FOUND");
    await prisma.portal.delete({ where: { id } });
}
