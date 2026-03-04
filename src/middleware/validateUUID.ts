import { Request, Response, NextFunction } from "express";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware to validate that route params (:id, :applicationId, etc.) are valid UUIDs.
 * Usage: router.get("/:id", validateUUID("id"), handler)
 */
export function validateUUID(...paramNames: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        for (const param of paramNames) {
            const value = req.params[param] as string | undefined;
            if (value && !UUID_REGEX.test(value)) {
                res.status(400).json({
                    success: false,
                    error: {
                        code: "INVALID_PARAM",
                        message: `Parameter '${param}' must be a valid UUID`,
                    },
                });
                return;
            }
        }
        next();
    };
}
