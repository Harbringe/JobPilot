import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * AES-256-GCM symmetric encryption for at-rest secrets (user API keys).
 * Master key derived via SHA-256 of process.env.AI_KEY_ENCRYPTION_SECRET.
 *
 * Encoded format: base64( iv(12) | authTag(16) | ciphertext )
 */

function deriveKey(): Buffer {
    const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
    if (!secret || secret.length < 16) {
        throw new Error("AI_KEY_ENCRYPTION_SECRET_MISSING");
    }
    return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
    const key = deriveKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(encoded: string): string {
    const key = deriveKey();
    const buf = Buffer.from(encoded, "base64");
    if (buf.length < 28) throw new Error("AI_KEY_DECRYPT_FAILED");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function maskSecret(value: string): string {
    if (!value) return "";
    if (value.length <= 8) return "•".repeat(value.length);
    return value.slice(0, 4) + "•".repeat(Math.max(0, value.length - 8)) + value.slice(-4);
}
