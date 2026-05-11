// ──────────────────────────────────────
// Auth Types
// ──────────────────────────────────────

export interface RegisterRequest {
    email: string;
    password: string;
    name: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    user: UserPublic;
}

export interface UserPublic {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    plan: "FREE" | "PRO" | "PREMIUM";
    profileCompleted: boolean;
}

// ──────────────────────────────────────
// Profile Types
// ──────────────────────────────────────

export interface ProfileData {
    fullName: string;
    headline?: string;
    summary?: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    preferences?: JobPreferences;
    experiences: ExperienceData[];
    educations: EducationData[];
    skills: SkillData[];
    projects: ProjectData[];
    certifications: CertificationData[];
}

export interface JobPreferences {
    salaryMin?: number;
    salaryMax?: number;
    currency?: string;
    remoteType?: "REMOTE" | "HYBRID" | "ONSITE";
    visaRequired?: boolean;
    industries?: string[];
    locations?: string[];
}

export interface ExperienceData {
    id?: string;
    company: string;
    title: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current: boolean;
    description?: string;
}

export interface EducationData {
    id?: string;
    institution: string;
    degree: string;
    field?: string;
    startDate: string;
    endDate?: string;
    gpa?: string;
    description?: string;
}

export interface SkillData {
    name: string;
    level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
    category?: string;
}

export interface ProjectData {
    id?: string;
    name: string;
    description?: string;
    url?: string;
    techStack: string[];
}

export interface CertificationData {
    id?: string;
    name: string;
    issuer: string;
    issueDate?: string;
    expiryDate?: string;
    url?: string;
}

// ──────────────────────────────────────
// Job Types
// ──────────────────────────────────────

export interface JobListing {
    id: string;
    title: string;
    company: string;
    companyLogoUrl?: string;
    location?: string;
    remoteType?: "REMOTE" | "HYBRID" | "ONSITE";
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    description: string;
    requirements: string[];
    source: string;
    applyUrl: string;
    postedAt?: string;
    matchScore?: number;
}

export interface JobSearchParams {
    query?: string;
    location?: string;
    remoteType?: string;
    salaryMin?: number;
    source?: string;
    page?: number;
    limit?: number;
    sort?: "relevance" | "salary" | "date" | "match";
}

// ──────────────────────────────────────
// Application Types
// ──────────────────────────────────────

export type ApplicationStatusType =
    | "SAVED"
    | "APPLIED"
    | "SCREENING"
    | "INTERVIEW"
    | "OFFER"
    | "ACCEPTED"
    | "DECLINED"
    | "REJECTED";

export interface ApplicationData {
    id: string;
    jobId: string;
    job: JobListing;
    status: ApplicationStatusType;
    matchScore?: number;
    notes?: string;
    appliedAt: string;
    updatedAt: string;
}

// ──────────────────────────────────────
// API Response Wrapper
// ──────────────────────────────────────

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
