// LeadForge — Apify webhook receiver (verify_jwt = false).
// Apify POSTs here when an Actor run finishes. Authenticated with a per-run random token
// stored in pipeline_run_secrets (service-role-only table), compared in constant time.

import { json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";
import { failRun, ingestApifyRun } from "../_shared/apify.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const runId = url.searchParams.get("run") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !token) return json({ error: "Bad request" }, 400);

  const { data: secret } = await admin.from("pipeline_run_secrets").select("webhook_secret").eq("run_id", runId).maybeSingle();
  if (!secret || !safeEqual(secret.webhook_secret, token)) return json({ error: "Unauthorized" }, 401);

  const payload = await req.json().catch(() => ({}));
  const event: string = payload?.eventType ?? "";
  const { data: run } = await admin.from("pipeline_runs").select("id, pipeline_id, status").eq("id", runId).single();
  if (!run || !["queued", "running"].includes(run.status)) return json({ ok: true, ignored: true });

  if (event === "ACTOR.RUN.SUCCEEDED") {
    const apifyToken = await getSecret("apify_api_token");
    if (!apifyToken) return json({ error: "Apify not configured" }, 500);
    const job = ingestApifyRun(runId, apifyToken);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job); else await job;
  } else {
    await failRun(runId, run.pipeline_id, `Actor run ended: ${event || "unknown event"}`);
  }
  return json({ ok: true });
});
