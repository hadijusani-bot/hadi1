import { admin } from "./supabase.ts";

/**
 * Resolve an integration key. Order:
 *  1. Lovable Cloud secret / connector env var (FIRECRAWL_API_KEY, APIFY_API_TOKEN) — recommended
 *  2. Supabase Vault entry written from the Admin Console (encrypted at rest)
 * Keys never leave the server.
 */
const ENV_NAMES: Record<string, string> = {
  firecrawl_api_key: "FIRECRAWL_API_KEY",
  apify_api_token: "APIFY_API_TOKEN",
};

export async function getSecret(name: "firecrawl_api_key" | "apify_api_token"): Promise<string | null> {
  const fromEnv = Deno.env.get(ENV_NAMES[name]);
  if (fromEnv) return fromEnv;
  const { data, error } = await admin.rpc("get_integration_secret", { _name: name });
  if (error) {
    console.error("vault read failed", error.message);
    return null;
  }
  return (data as string | null) || null;
}

export function envSecretPresent(name: string): boolean {
  return !!Deno.env.get(ENV_NAMES[name]);
}
