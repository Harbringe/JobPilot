import { z } from "zod";

const experienceSchema = z.object({
    id: z.string().uuid().optional(),
    company: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    location: z.string().max(200).nullable().optional(),
    startDate: z.string(),
    endDate: z.string().nullable().optional(),
    current: z.boolean().default(false),
    description: z.string().max(5000).nullable().optional(),
});

const educationSchema = z.object({
    id: z.string().uuid().optional(),
    institution: z.string().min(1).max(300),
    degree: z.string().min(1).max(200),
    field: z.string().max(200).nullable().optional(),
    startDate: z.string(),
    endDate: z.string().nullable().optional(),
    gpa: z.string().max(10).nullable().optional(),
    description: z.string().max(5000).nullable().optional(),
});

const skillSchema = z.object({
    name: z.string().min(1).max(100),
    level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]).default("INTERMEDIATE"),
    category: z.string().max(50).nullable().optional(),
});

const projectSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    url: z.string().url().max(2000).nullable().optional().or(z.literal("")),
    techStack: z.array(z.string().max(50)).max(30).default([]),
});

const certificationSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(300),
    issuer: z.string().min(1).max(200),
    issueDate: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    url: z.string().url().max(2000).nullable().optional().or(z.literal("")),
});

export const profileSchema = z.object({
    fullName: z.string().min(1, "Full name is required").max(200),
    headline: z.string().max(300).nullable().optional(),
    summary: z.string().max(5000).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    linkedinUrl: z.string().url().max(2000).nullable().optional().or(z.literal("")),
    githubUrl: z.string().url().max(2000).nullable().optional().or(z.literal("")),
    portfolioUrl: z.string().url().max(2000).nullable().optional().or(z.literal("")),
    preferences: z.object({
        salaryMin: z.number().int().min(0).optional(),
        salaryMax: z.number().int().min(0).optional(),
        currency: z.string().max(10).default("USD"),
        remoteType: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
        visaRequired: z.boolean().optional(),
        industries: z.array(z.string().max(100)).max(20).optional(),
        locations: z.array(z.string().max(200)).max(20).optional(),
    }).nullable().optional(),
    experiences: z.array(experienceSchema).max(50).default([]),
    educations: z.array(educationSchema).max(30).default([]),
    skills: z.array(skillSchema).max(100).default([]),
    projects: z.array(projectSchema).max(50).default([]),
    certifications: z.array(certificationSchema).max(30).default([]),
});
