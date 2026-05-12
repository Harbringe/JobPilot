import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_NOT_CONFIGURED");
    }
    if (!cached) {
        cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return cached;
}

export function isSupabaseConfigured(): boolean {
    return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

export type StorageBucket = "resumes" | "autoapply";

export async function uploadObject(
    bucket: StorageBucket,
    key: string,
    body: Buffer,
    contentType: string
): Promise<void> {
    const sb = getSupabaseAdmin();
    const { error } = await sb.storage.from(bucket).upload(key, body, {
        contentType,
        upsert: true,
    });
    if (error) {
        throw new Error(`SUPABASE_UPLOAD_FAIL: ${error.message}`);
    }
}

export async function downloadObject(
    bucket: StorageBucket,
    key: string
): Promise<Buffer> {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.storage.from(bucket).download(key);
    if (error || !data) {
        throw new Error(`SUPABASE_DOWNLOAD_FAIL: ${error?.message ?? "no data"}`);
    }
    const arr = await data.arrayBuffer();
    return Buffer.from(arr);
}

export async function objectExists(bucket: StorageBucket, key: string): Promise<boolean> {
    const sb = getSupabaseAdmin();
    const slash = key.lastIndexOf("/");
    const folder = slash === -1 ? "" : key.slice(0, slash);
    const name = slash === -1 ? key : key.slice(slash + 1);
    const { data, error } = await sb.storage.from(bucket).list(folder, {
        search: name,
        limit: 1,
    });
    if (error) return false;
    return Boolean(data?.some((f) => f.name === name));
}
