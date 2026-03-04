import { prisma } from "../../db/index.js";

export async function getResumesForApplication(applicationId: string, userId: string) {
    // Verify the user owns this application
    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
    });

    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    return prisma.resume.findMany({
        where: { applicationId },
        orderBy: { generatedAt: "desc" },
    });
}

export async function createResume(applicationId: string, userId: string, template: string, contentSnapshot?: any) {
    // Verify ownership
    const application = await prisma.application.findFirst({
        where: { id: applicationId, userId },
    });

    if (!application) throw new Error("APPLICATION_NOT_FOUND");

    // In a real app, you would call a PDF generation microservice here
    // For this implementation, we just mock the PDF URL
    const pdfUrl = `https://storage.example.com/resumes/${applicationId}-${Date.now()}.pdf`;

    return prisma.resume.create({
        data: {
            applicationId,
            pdfUrl,
            template,
            contentSnapshot: contentSnapshot || {},
        },
    });
}
