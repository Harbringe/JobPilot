import { z } from "zod";

export const negotiationTypeEnum = z.enum([
    "SALARY",
    "GEO_DISCOUNT",
    "COMPETING_OFFER",
    "EQUITY",
    "BENEFITS",
    "COUNTER_OFFER",
]);

export const competingOfferSchema = z.object({
    company: z.string().min(1).max(120),
    base: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    notes: z.string().max(500).optional(),
});

export const negotiationContextSchema = z
    .object({
        offerBase: z.number().nonnegative().optional(),
        offerEquity: z.string().max(200).optional(),
        offerBonus: z.string().max(200).optional(),
        offerBenefits: z.string().max(500).optional(),
        candidateLocation: z.string().max(120).optional(),
        employerLocation: z.string().max(120).optional(),
        targetBase: z.number().nonnegative().optional(),
        competingOffers: z.array(competingOfferSchema).max(5).optional(),
        notes: z.string().max(2000).optional(),
    })
    .default({});

export const generateNegotiationSchema = z.object({
    applicationId: z.string().uuid(),
    type: negotiationTypeEnum,
    context: negotiationContextSchema,
});

export const listNegotiationsQuerySchema = z.object({
    applicationId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GenerateNegotiationInput = z.infer<typeof generateNegotiationSchema>;
