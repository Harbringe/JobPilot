import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../../db/index.js";
import type { RegisterRequest, LoginRequest, AuthResponse, UserPublic } from "../../types/index.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error("❌ FATAL: JWT_SECRET must be set and at least 32 characters long.");
    process.exit(1);
}
const JWT_SECRET_VALUE: string = JWT_SECRET; // narrowed after guard
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_DAYS = 7;

async function hasProfile(userId: string): Promise<boolean> {
    const p = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
    return !!p;
}

// ─── Register ──────────────────────────
export async function register(data: RegisterRequest): Promise<AuthResponse> {
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("EMAIL_EXISTS");

    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            name: data.name.trim(),
            provider: "email",
        },
    });

    return generateTokens(user.id, user.email, user.plan, {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        profileCompleted: false,
    });
}

// ─── Login ─────────────────────────────
export async function login(data: LoginRequest): Promise<AuthResponse> {
    const email = data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) throw new Error("INVALID_CREDENTIALS");

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw new Error("INVALID_CREDENTIALS");

    // Update last login
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
    });

    const profileCompleted = await hasProfile(user.id);
    return generateTokens(user.id, user.email, user.plan, {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        profileCompleted,
    });
}

// ─── Refresh Token ─────────────────────
export async function refreshToken(token: string): Promise<AuthResponse> {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const stored = await prisma.refreshToken.findUnique({
        where: { token: hashedToken },
        include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
        if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
        throw new Error("INVALID_REFRESH_TOKEN");
    }

    // Rotate: delete old, create new
    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = stored.user;
    const profileCompleted = await hasProfile(user.id);
    return generateTokens(user.id, user.email, user.plan, {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        profileCompleted,
    });
}

// ─── Get Me ────────────────────────────
export async function getMe(userId: string): Promise<UserPublic | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const profileCompleted = await hasProfile(user.id);
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        plan: user.plan,
        profileCompleted,
    };
}

// ─── Logout ────────────────────────────
export async function logout(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { userId } });
}

// ─── Change Password ───────────────────
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new Error("USER_NOT_FOUND");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error("INVALID_PASSWORD");

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
    });

    // Revoke all refresh tokens (force re-login)
    await prisma.refreshToken.deleteMany({ where: { userId } });
}

// ─── Delete Account ────────────────────
export async function deleteAccount(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new Error("USER_NOT_FOUND");

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error("INVALID_PASSWORD");

    // Cascade delete: Prisma onDelete: Cascade handles all related records
    await prisma.user.delete({ where: { id: userId } });
}

// ─── Helpers ───────────────────────────
async function generateTokens(
    userId: string,
    email: string,
    plan: string,
    user: UserPublic
): Promise<AuthResponse> {
    const accessToken = jwt.sign({ userId, email, plan }, JWT_SECRET_VALUE, {
        expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });

    const refreshTokenValue = crypto.randomBytes(48).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(refreshTokenValue).digest("hex");

    await prisma.refreshToken.create({
        data: {
            token: hashedToken,
            userId,
            expiresAt: new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000),
        },
    });

    return {
        accessToken,
        refreshToken: refreshTokenValue,
        user,
    };
}
