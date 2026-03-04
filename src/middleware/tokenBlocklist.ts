/**
 * In-memory token blocklist.
 *
 * When a user logs out or deletes their account, their current access token
 * is added here so it can't be reused for the remaining lifetime (max 15 min).
 *
 * Tokens auto-expire from the blocklist after their JWT expiry to prevent
 * memory leaks.
 *
 * ⚠️  In production with multiple server instances, replace this with Redis
 *     (e.g. `SET token EX 900 NX`) so the blocklist is shared across nodes.
 */

const blocklist = new Set<string>();

/**
 * Add a token to the blocklist. It will be automatically removed after `ttlMs`.
 * @param token  The raw JWT access token string
 * @param ttlMs  How long to keep it blocklisted (default: 15 min)
 */
export function blockToken(token: string, ttlMs = 15 * 60 * 1000): void {
    blocklist.add(token);
    setTimeout(() => blocklist.delete(token), ttlMs);
}

/**
 * Check if a token has been blocklisted (i.e. user logged out).
 */
export function isTokenBlocked(token: string): boolean {
    return blocklist.has(token);
}
