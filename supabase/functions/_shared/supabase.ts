import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Service-role client. Bypasses RLS — only use after authorizing the caller. */
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Resolve the calling user from the Authorization header. */
export async function requireUser(req: Request): Promise<User> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "Missing Authorization header");
  const client = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Invalid session");
  return data.user;
}

export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}
