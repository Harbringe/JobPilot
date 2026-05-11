import { Router } from "express";
import type { Response } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { validateUUID } from "../../middleware/validateUUID.js";
import {
    storyInputSchema,
    storyUpdateSchema,
    listStoriesQuerySchema,
    generateStoriesSchema,
} from "./stories.validation.js";
import {
    listStories,
    getStory,
    createStory,
    updateStory,
    deleteStory,
    generateStoriesFromApplication,
} from "./stories.service.js";

export const storiesRouter: Router = Router();
storiesRouter.use(authenticate);

storiesRouter.get("/", validate(listStoriesQuerySchema, "query"), async (req: AuthRequest, res: Response) => {
    const { competency, tag, q, page, limit } = req.query as unknown as {
        competency?: string;
        tag?: string;
        q?: string;
        page: number;
        limit: number;
    };
    const data = await listStories(req.user!.userId, {
        competency,
        tag,
        q,
        page: Number(page),
        limit: Number(limit),
    });
    res.json({ success: true, data });
});

storiesRouter.get("/:id", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    const story = await getStory(req.user!.userId, req.params.id as string);
    res.json({ success: true, data: story });
});

storiesRouter.post("/", validate(storyInputSchema), async (req: AuthRequest, res: Response) => {
    const story = await createStory(req.user!.userId, req.body);
    res.status(201).json({ success: true, data: story });
});

storiesRouter.put("/:id", validateUUID("id"), validate(storyUpdateSchema), async (req: AuthRequest, res: Response) => {
    const story = await updateStory(req.user!.userId, req.params.id as string, req.body);
    res.json({ success: true, data: story });
});

storiesRouter.delete("/:id", validateUUID("id"), async (req: AuthRequest, res: Response) => {
    await deleteStory(req.user!.userId, req.params.id as string);
    res.json({ success: true, data: { message: "Story deleted" } });
});

storiesRouter.post(
    "/from-application/:applicationId",
    validateUUID("applicationId"),
    validate(generateStoriesSchema),
    async (req: AuthRequest, res: Response) => {
        const stories = await generateStoriesFromApplication(
            req.user!.userId,
            req.params.applicationId as string,
            req.body
        );
        res.status(201).json({ success: true, data: { stories } });
    }
);
