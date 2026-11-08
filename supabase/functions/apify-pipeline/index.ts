// LeadForge — Apify pipeline
// POST { action: "start", pipeline_id }  → starts the Actor run (async), returns { run_id }
// POST { action: "sync",  run_id }       → polls Apify; ingests the dataset when the run finished
//
// Apify also calls apify-webhook when the run finishes, so results land even if nobody polls.
// The Apify token is read server-side only (APIFY_API_TOKEN secret or the Admin Console Vault entry).

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, HttpError, isAdmin, requireUser, SUPABASE_URL } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";
import { appendLog } from "../_shared/leads.ts";
import { apify, failRun, ingestApifyRun, type ApifyConfig } from "../_shared/apify.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const TERMINAL_FAIL = ["FAILED", "ABORTED", "TIMED-OUT"];

function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function start(userId: string, pipelineId: string, token: string) {
  const { data: pipeline } = await admin.from("pipelines").select("*").eq("id", pipelineId).single();
  if (!pipeline) throw new HttpError(404, "Pipeline not found");
  if (pipeline.owner_id !== userId) throw new HttpError(403, "Not your pipeline");
  if (pipeline.source !== "apify") throw new HttpError(400, "Not an Apify pipeline");
  const cfg = pipeline.config as ApifyConfig;
  if (!cfg.actor_id) throw new HttpError(400, "Pipeline has no actor_id configured");

  const { data: active } = await admin.from("pipeline_runs").select("id").eq("pipeline_id", pipelineId).in("status", ["queued", "running"]).limit(1);
  if (active?.length) throw new HttpError(409, "This pipeline already has a run in progress");

  const { data: run, error } = await admin.from("pipeline_runs").insert({
    pipeline_id: pipelineId, owner_id: userId, source: "apify", status: "queued",
    log: [{ t: new Date().toISOString(), level: "info", message: `Starting Actor ${cfg.actor_id}` }],
  }).select().single();
  if (error) throw error;

  const secret = randomToken();
  await admin.from("pipeline_run_secrets").insert({ run_id: run.id, webhook_secret: secret });

  const webhooks = btoa(JSON.stringify([{
    eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
    requestUrl: `${SUPABASE_URL}/functions/v1/apify-webhook?run=${run.id}&token=${secret}`,
  }]));
  const params = new URLSearchParams({ webhooks });
  if (cfg.max_items) params.set("maxItems", String(cfg.max_items));
  if (cfg.timeout_secs) params.set("timeout", String(cfg.timeout_secs));
  if (cfg.memory_mb) params.set("memory", String(cfg.memory_mb));

  try {
    const actor = encodeURIComponent(cfg.actor_id.replace("/", "~"));
    const res = await apify<{ data: { id: string; defaultDatasetId: string; status: string } }>(
      token, `/acts/${actor}/runs?${params}`, { method: "POST", body: JSON.stringify(cfg.input ?? {}) },
    );
    await admin.from("pipeline_runs").update({
      status: "running", external_run_id: res.data.id, external_dataset: res.data.defaultDatasetId,
    }).eq("id", run.id);
    await appendLog(run.id, `Actor run ${res.data.id} started (${res.data.status})`);
  } catch (e) {
    await failRun(run.id, pipelineId, (e as Error).message);
  }
  return run.id as string;
}

async function sync(userId: string, runId: string, token: string) {
  const { data: run } = await admin.from("pipeline_runs").select("*").eq("id", runId).single();
  if (!run) throw new HttpError(404, "Run not found");
  if (run.owner_id !== userId && !(await isAdmin(userId))) throw new HttpError(403, "Forbidden");
  if (!["queued", "running"].includes(run.status) || !run.external_run_id) return { status: run.status };

  const res = await apify<{ data: { status: string; statusMessage?: string } }>(token, `/actor-runs/${run.external_run_id}`);
  const s = res.data.status;
  if (s === "SUCCEEDED") {
    const job = ingestApifyRun(runId, token);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job); else await job;
    return { status: "ingesting" };
  }
  if (TERMINAL_FAIL.includes(s)) {
    await failRun(runId, run.pipeline_id, `Actor run ${s}${res.data.statusMessage ? `: ${res.data.statusMessage}` : ""}`);
    return { status: "failed" };
  }
  return { status: "running", apify_status: s, message: res.data.statusMessage };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const token = await getSecret("apify_api_token");
    if (!token) throw new HttpError(412, "Apify is not configured. Add APIFY_API_TOKEN in Lovable Cloud secrets or Admin → API Keys.");

    if (body.action === "start") return json({ run_id: await start(user.id, body.pipeline_id, token) });
    if (body.action === "sync") return json(await sync(user.id, body.run_id, token));
    throw new HttpError(400, "Unknown action");
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500);
  }
});
