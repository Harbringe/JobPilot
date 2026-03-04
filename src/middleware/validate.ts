import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validate(schema: ZodSchema, target: "body" | "query" = "body") {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = schema.parse(req[target]);
            req[target] = parsed; // Re-assign parsed values (e.g. for default values)
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: `Invalid request ${target}`,
                        details: err.errors.map((e) => ({
                            field: e.path.join("."),
                            message: e.message,
                        })),
                    },
                });
                return;
            }
            next(err);
        }
    };
}
