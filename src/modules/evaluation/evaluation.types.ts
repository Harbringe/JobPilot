export interface RoleSummary {
    summary: string;
    keyResponsibilities: string[];
    teamContext: string;
}

export interface CvMatchAssessment {
    strengths: string[];
    gaps: string[];
    transferable: string[];
    fitScore: number;
}

export interface LevelStrategy {
    targetLevel: string;
    rationale: string;
    yoeFit: string;
    titleSuggestions: string[];
}

export interface CompensationResearch {
    baseRange: string;
    totalComp: string;
    geoAdjusted: string;
    sources: string[];
}

export interface Personalization {
    coverLetterAngles: string[];
    resumeKeywords: string[];
    referralPaths: string[];
}

export interface InterviewPrep {
    likelyQuestions: string[];
    starStoryPrompts: Array<{
        competency: string;
        prompt: string;
        relevantExperienceTitle?: string;
    }>;
    topicsToStudy: string[];
}

export interface EvaluationBlocks {
    roleSummary: RoleSummary;
    cvMatchAssessment: CvMatchAssessment;
    levelStrategy: LevelStrategy;
    compensationResearch: CompensationResearch;
    personalization: Personalization;
    interviewPrep: InterviewPrep;
}

export const BLOCK_NAMES = [
    "roleSummary",
    "cvMatchAssessment",
    "levelStrategy",
    "compensationResearch",
    "personalization",
    "interviewPrep",
] as const;

export type BlockName = (typeof BLOCK_NAMES)[number];
