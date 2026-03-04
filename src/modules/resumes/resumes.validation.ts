import { z } from "zod";

export const createResumeSchema = z.object({
    applicationId: z.string().uuid(),
    template: z.string().max(50).optional().default("modern"),
    contentSnapshot: z
        .record(z.string().max(10000))
        .refine((obj) => Object.keys(obj).length <= 50, {
            message: "contentSnapshot cannot have more than 50 keys",
        })
        .optional(),
});
