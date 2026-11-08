// LeadForge — Admin API key management (admins only).
// GET-like: POST { action: "status" }                     → which keys are configured (never values)
//           POST { action: "set", name, value }           → store/rotate key in Supabase Vault
//           POST { action: "delete", name }               → remove Vault key
//           POST { action: "test", name }                 → validate key against the provider

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, HttpError, isAdmin, requireUser } from "../_shared/supabase.ts";
import { envSecretPresent, getSecret } from "../_shared/secrets.ts";

const NAMES = ["firecrawl_api_key", "apify_api_token"] as const;
type Name = typeof NAMES[number];

async function test(name: Name): Promise<{ ok: boolean; detail: string }> {
  const key = await getSecret(name);
  if (!key) return { ok: false, detail: "Not configured" };
  if (name === "apify_api_token") {
    const r = await fetch("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return { ok: false, detail: `Apify rejected the token (${r.status})` };
    const d = await r.json();
    return { ok: true, detail: `Connected as ${d.data?.username ?? "Apify user"}` };
  }
  const r = await fetch("https://api.firecrawl.dev/v1/team/credit-usage", { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 401 || r.status === 403) return { ok: false, detail: `Firecrawl rejected the key (${r.status})` };
  const d = await r.json().catch(() => ({}));
  const credits = d?.data?.remaining_credits;
  return { ok: true, detail: credits !== undefined ? `Connected · ${credits} credits remaining` : "Connected" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!(await isAdmin(user.id))) throw new HttpError(403, "Admins only");
    const body = await req.json();
    const name = body.name as Name;
    if (body.action !== "status" && !NAMES.includes(name)) throw new HttpError(400, "Unknown key name");

    switch (body.action) {
      case "status": {
        const { data, error } = await admin.rpc("integration_secret_status");
        if (error) throw error;
        return json({
          keys: NAMES.map((n) => {
            const row = (data ?? []).find((r: any) => r.name === n);
            const env = envSecretPresent(n);
            return { name: n, env, vault: !!row?.configured, updated_at: row?.updated_at ?? null, active_source: env ? "env" : row?.configured ? "vault" : null };
          }),
        });
      }
      case "set": {
        const value = String(body.value ?? "").trim();
        if (value.length < 10 || value.length > 500) throw new HttpError(400, "Key looks invalid");
        const { error } = await admin.rpc("set_integration_secret", { _name: name, _value: value });
        if (error) throw error;
        return json({ ok: true });
      }
      case "delete": {
        const { error } = await admin.rpc("set_integration_secret", { _name: name, _value: "" });
        if (error) throw error;
        return json({ ok: true });
      }
      case "test":
        return json(await test(name));
      default:
        throw new HttpError(400, "Unknown action");
    }
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500);
  }
});
