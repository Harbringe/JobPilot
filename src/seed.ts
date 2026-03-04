import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seed() {
    console.log("🌱 Seeding database...");

    // Create a test user
    const passwordHash = await bcrypt.hash("Test1234", 12);
    const user = await prisma.user.upsert({
        where: { email: "demo@jobpilot.dev" },
        update: {},
        create: {
            email: "demo@jobpilot.dev",
            passwordHash,
            name: "Demo User",
            provider: "email",
            emailVerified: true,
        },
    });
    console.log(`  ✅ User: ${user.email}`);

    // Create a profile
    const profile = await prisma.profile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
            userId: user.id,
            fullName: "Demo User",
            headline: "Full-Stack Developer | React, Node.js, Python",
            summary:
                "Experienced full-stack developer with 5+ years building scalable web applications. Passionate about clean code, great UX, and building products that make a difference.",
            phone: "+1-555-0123",
            location: "San Francisco, CA",
            linkedinUrl: "https://linkedin.com/in/demouser",
            githubUrl: "https://github.com/demouser",
            preferences: {
                salaryMin: 120000,
                salaryMax: 200000,
                currency: "USD",
                remoteType: "REMOTE",
                visaRequired: false,
                industries: ["technology", "fintech", "saas"],
            },
        },
    });

    // Add work experiences
    await prisma.workExperience.createMany({
        skipDuplicates: true,
        data: [
            {
                profileId: profile.id,
                company: "TechCorp Inc.",
                title: "Senior Full-Stack Developer",
                location: "San Francisco, CA",
                startDate: new Date("2022-03-01"),
                current: true,
                description:
                    "Led development of the core platform serving 100K+ users. Built microservices with Node.js and React frontend. Reduced API response times by 60%.",
                sortOrder: 0,
            },
            {
                profileId: profile.id,
                company: "StartupXYZ",
                title: "Full-Stack Developer",
                location: "Remote",
                startDate: new Date("2019-06-01"),
                endDate: new Date("2022-02-28"),
                description:
                    "Built the entire web application from scratch. Implemented CI/CD pipelines, developed REST APIs, and created responsive UI components.",
                sortOrder: 1,
            },
        ],
    });

    // Add education
    await prisma.education.createMany({
        skipDuplicates: true,
        data: [
            {
                profileId: profile.id,
                institution: "University of California, Berkeley",
                degree: "Bachelor of Science",
                field: "Computer Science",
                startDate: new Date("2015-08-01"),
                endDate: new Date("2019-05-15"),
                gpa: "3.7",
                sortOrder: 0,
            },
        ],
    });

    // Add skills
    await prisma.skill.createMany({
        skipDuplicates: true,
        data: [
            { profileId: profile.id, name: "TypeScript", level: "EXPERT", category: "programming" },
            { profileId: profile.id, name: "React", level: "EXPERT", category: "framework" },
            { profileId: profile.id, name: "Node.js", level: "ADVANCED", category: "framework" },
            { profileId: profile.id, name: "Python", level: "ADVANCED", category: "programming" },
            { profileId: profile.id, name: "PostgreSQL", level: "ADVANCED", category: "database" },
            { profileId: profile.id, name: "Docker", level: "INTERMEDIATE", category: "tool" },
            { profileId: profile.id, name: "AWS", level: "INTERMEDIATE", category: "tool" },
        ],
    });

    // Add sample jobs
    const jobs = await Promise.all([
        prisma.job.upsert({
            where: { fingerprint: "senior-fe-google-mountainview" },
            update: {},
            create: {
                title: "Senior Frontend Engineer",
                company: "Google",
                location: "Mountain View, CA",
                remoteType: "HYBRID",
                salaryMin: 180000,
                salaryMax: 280000,
                salaryCurrency: "USD",
                description:
                    "Join Google's Cloud team to build next-generation web applications. You'll work with React, TypeScript, and cutting-edge web technologies to create experiences used by millions of developers worldwide.",
                requirements: ["React", "TypeScript", "5+ years experience", "CS degree"],
                source: "seed",
                applyUrl: "https://careers.google.com/jobs/example",
                postedAt: new Date("2026-02-18"),
                fingerprint: "senior-fe-google-mountainview",
            },
        }),
        prisma.job.upsert({
            where: { fingerprint: "backend-eng-stripe-remote" },
            update: {},
            create: {
                title: "Backend Engineer",
                company: "Stripe",
                location: "Remote",
                remoteType: "REMOTE",
                salaryMin: 160000,
                salaryMax: 240000,
                salaryCurrency: "USD",
                description:
                    "Help build the financial infrastructure of the internet. You'll design and implement high-throughput, low-latency payment processing systems using Python and Go.",
                requirements: ["Python", "Go", "Distributed systems", "3+ years experience"],
                source: "seed",
                applyUrl: "https://stripe.com/jobs/example",
                postedAt: new Date("2026-02-19"),
                fingerprint: "backend-eng-stripe-remote",
            },
        }),
        prisma.job.upsert({
            where: { fingerprint: "fullstack-vercel-remote" },
            update: {},
            create: {
                title: "Full-Stack Developer",
                company: "Vercel",
                location: "Remote",
                remoteType: "REMOTE",
                salaryMin: 150000,
                salaryMax: 220000,
                salaryCurrency: "USD",
                description:
                    "Build the platform that powers the modern web. Work on Next.js, Turborepo, and our deployment infrastructure. Collaborate with an amazing open-source community.",
                requirements: ["Next.js", "React", "Node.js", "TypeScript", "2+ years experience"],
                source: "seed",
                applyUrl: "https://vercel.com/careers/example",
                postedAt: new Date("2026-02-20"),
                fingerprint: "fullstack-vercel-remote",
            },
        }),
    ]);

    console.log(`  ✅ Profile created with experiences, education, and skills`);
    console.log(`  ✅ ${jobs.length} sample jobs created`);
    console.log("\n✨ Seeding complete!");
}

seed()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
