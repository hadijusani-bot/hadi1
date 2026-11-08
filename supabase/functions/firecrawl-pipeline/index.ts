// LeadForge — Firecrawl pipeline
// POST { pipeline_id }  → starts a run, returns { run_id } immediately, processes in background.
//
// Modes (pipeline.config.mode):
//   scrape — extract leads from each URL in config.urls
//   crawl  — map each site, pick contact/about/team pages, extract from each
//   search — web search config.query, then extract leads from each result's site
//
// The Firecrawl key is read server-side only (Lovable Firecrawl connector → FIRECRAWL_API_KEY,
// or the Vault entry set from the Admin Console).

import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, HttpError, requireUser } from "../_shared/supabase.ts";
import { getSecret } from "../_shared/secrets.ts";
import {
  appendLog, extractEmails, extractLinkedIn, extractPhones, finishRun, ingestLeads, toDomain, type LeadInput,
} from "../_shared/leads.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const FC = "https://api.firecrawl.dev/v1";

interface FirecrawlConfig {
  mode?: "scrape" | "crawl" | "search";
  urls?: string[];
  query?: string;
  limit?: number;          // max sites (search) / pages per site (crawl)
  prompt?: string;         // extra instructions for the extractor
  tags?: string[];
  location?: string;       // search: appended to the query / used as country hint
}

const LEAD_SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: "string" },
    description: { type: "string", description: "One-sentence summary of what the company does" },
    industry: { type: "string" },
    location: { type: "string", description: "City, region / country of HQ" },
    emails: { type: "array", items: { type: "string" } },
    phones: { type: "array", items: { type: "string" } },
    linkedin_url: { type: "string" },
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          email: { type: "string" },
          linkedin_url: { type: "string" },
        },
      },
    },
  },
};

const BASE_PROMPT =
  "Extract B2B lead information from this page: the company's name, what it does, industry, HQ location, " +
  "every business contact email and phone number shown on the page, the company LinkedIn URL, and named " +
  "people (founders, executives, sales/marketing leads) with their job titles and emails if shown. " +
  "Only return data that literally appears on the page. Never invent emails.";

async function fc<T>(key: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${FC}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok || data?.success === false) {
    throw new Error(`Firecrawl ${path} ${res.status}: ${data?.error ?? text.slice(0, 300)}`);
  }
  return data as T;
}

async function scrapePage(key: string, url: string, prompt: string) {
  const r = await fc<{ data: { markdown?: string; json?: any; metadata?: any } }>(key, "/scrape", {
    url,
    formats: ["markdown", "json"],
    onlyMainContent: false,
    jsonOptions: { schema: LEAD_SCHEMA, prompt },
    timeout: 45000,
  });
  return r.data;
}

async function mapSite(key: string, url: string, limit: number): Promise<string[]> {
  try {
    const r = await fc<{ links?: Array<string | { url: string }> }>(key, "/map", {
      url, search: "contact about team leadership people", limit: 50,
    });
    const links = (r.links ?? []).map((l) => (typeof l === "string" ? l : l.url));
    const pri = /(contact|about|team|people|leadership|company|staff|impressum)/i;
    const ranked = links.filter((l) => pri.test(l));
    return [url, ...ranked.filter((l) => l !== url)].slice(0, Math.max(1, limit));
  } catch {
    return [url];
  }
}

function leadsFromPage(page: { markdown?: string; json?: any; metadata?: any }, url: string, tags: string[]): LeadInput[] {
  const j = page.json ?? {};
  const md = page.markdown ?? "";
  const website = (() => { try { return new URL(url).origin; } catch { return url; } })();
  const domain = toDomain(url);

  // Regex is the safety net — only keep emails actually present on the page.
  const pageEmails = new Set(extractEmails(md));
  const llmEmails: string[] = (Array.isArray(j.emails) ? j.emails : []).map((e: string) => String(e).toLowerCase());
  const emails = [...new Set([...llmEmails.filter((e) => pageEmails.has(e) || md.toLowerCase().includes(e)), ...pageEmails])];
  // Prefer emails on the company's own domain
  emails.sort((a, b) => Number(b.endsWith(domain ?? "~")) - Number(a.endsWith(domain ?? "~")));

  const phones: string[] = [...(Array.isArray(j.phones) ? j.phones : []), ...extractPhones(md)];
  const linkedin = j.linkedin_url || extractLinkedIn(md);
  const company = j.company_name || page.metadata?.ogSiteName || page.metadata?.title?.split(/[|\-–]/)[0]?.trim() || domain;

  const base: LeadInput = {
    company_name: company,
    website,
    domain,
    industry: j.industry,
    location: j.location,
    description: j.description || page.metadata?.description,
    linkedin_url: linkedin?.includes("/company/") ? linkedin : null,
    phone: phones[0] ?? null,
    source_url: url,
    tags,
    raw: { page_title: page.metadata?.title, extracted: j },
  };

  const out: LeadInput[] = [];
  const people = Array.isArray(j.people) ? j.people : [];
  const usedEmails = new Set<string>();
  for (const p of people) {
    if (!p?.name) continue;
    const email = p.email && md.toLowerCase().includes(String(p.email).toLowerCase()) ? String(p.email).toLowerCase() : null;
    if (!email && !p.linkedin_url) continue; // a name alone isn't an actionable lead
    if (email) usedEmails.add(email);
    out.push({ ...base, contact_name: p.name, title: p.title, email, linkedin_url: p.linkedin_url || base.linkedin_url });
  }
  const generic = emails.find((e) => !usedEmails.has(e)) ?? null;
  if (generic || !out.length) out.push({ ...base, email: generic });
  return out;
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

async function execute(run: { id: string; pipeline_id: string; owner_id: string }, cfg: FirecrawlConfig, key: string) {
  const tags = cfg.tags ?? [];
  const prompt = cfg.prompt ? `${BASE_PROMPT}\nAdditional instructions: ${cfg.prompt}` : BASE_PROMPT;
  const limit = Math.min(Math.max(cfg.limit ?? 10, 1), 50);
  let scanned = 0;
  const collected: LeadInput[] = [];

  try {
    await admin.from("pipeline_runs").update({ status: "running" }).eq("id", run.id);
    let targets: string[] = [];

    if (cfg.mode === "search") {
      if (!cfg.query) throw new Error("Search mode requires a query");
      const q = cfg.location ? `${cfg.query} ${cfg.location}` : cfg.query;
      await appendLog(run.id, `Searching the web: "${q}"`);
      const r = await fc<{ data: Array<{ url: string }> }>(key, "/search", { query: q, limit: Math.min(limit * 2, 50) });
      const seen = new Set<string>();
      for (const item of r.data ?? []) {
        const d = toDomain(item.url);
        const skip = /(linkedin|facebook|instagram|twitter|x\.com|youtube|yelp|wikipedia|reddit|indeed|glassdoor|tripadvisor)/;
        if (!d || seen.has(d) || skip.test(d)) continue;
        seen.add(d);
        targets.push(new URL(item.url).origin);
        if (targets.length >= limit) break;
      }
      await appendLog(run.id, `Found ${targets.length} candidate company sites`);
    } else {
      targets = (cfg.urls ?? []).map((u) => (u.startsWith("http") ? u : `https://${u}`)).slice(0, 100);
      if (!targets.length) throw new Error("No URLs configured");
    }

    // Crawl/search: expand each site into its most lead-dense pages.
    let pages: string[] = targets;
    if (cfg.mode === "crawl" || cfg.mode === "search") {
      const perSite = cfg.mode === "crawl" ? Math.min(limit, 10) : 3;
      const expanded = await pool(targets, 4, (u) => mapSite(key, u, perSite));
      pages = expanded.flat();
      await appendLog(run.id, `Scraping ${pages.length} pages across ${targets.length} sites`);
    }

    await pool(pages, 4, async (url) => {
      try {
        const page = await scrapePage(key, url, prompt);
        scanned++;
        collected.push(...leadsFromPage(page, url, tags));
      } catch (e) {
        await appendLog(run.id, `Skipped ${url}: ${(e as Error).message}`, "warn");
      }
    });

    await appendLog(run.id, `Scraped ${scanned}/${pages.length} pages, ingesting ${collected.length} raw records`);
    const res = await ingestLeads({ ownerId: run.owner_id, pipelineId: run.pipeline_id, runId: run.id, source: "firecrawl", leads: collected });
    await appendLog(run.id, `Done: ${res.created} new, ${res.updated} enriched`);
    await finishRun(run.id, run.pipeline_id, { status: "succeeded", items_scanned: scanned, ...res });
  } catch (e) {
    const msg = (e as Error).message;
    await appendLog(run.id, msg, "error");
    await finishRun(run.id, run.pipeline_id, { status: "failed", error: msg, items_scanned: scanned });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const { pipeline_id } = await req.json();
    if (!pipeline_id) throw new HttpError(400, "pipeline_id is required");

    const { data: pipeline, error } = await admin.from("pipelines").select("*").eq("id", pipeline_id).single();
    if (error || !pipeline) throw new HttpError(404, "Pipeline not found");
    if (pipeline.owner_id !== user.id) throw new HttpError(403, "Not your pipeline");
    if (pipeline.source !== "firecrawl") throw new HttpError(400, "Not a Firecrawl pipeline");

    const key = await getSecret("firecrawl_api_key");
    if (!key) throw new HttpError(412, "Firecrawl is not connected. Connect it in Lovable (Connectors → Firecrawl) or add a key in Admin → API Keys.");

    const { data: active } = await admin.from("pipeline_runs").select("id").eq("pipeline_id", pipeline_id).in("status", ["queued", "running"]).limit(1);
    if (active?.length) throw new HttpError(409, "This pipeline already has a run in progress");

    const { data: run, error: runErr } = await admin.from("pipeline_runs").insert({
      pipeline_id, owner_id: user.id, source: "firecrawl", status: "queued",
      log: [{ t: new Date().toISOString(), level: "info", message: `Run queued (${pipeline.config?.mode ?? "scrape"} mode)` }],
    }).select().single();
    if (runErr) throw runErr;

    const job = execute(run, pipeline.config as FirecrawlConfig, key);
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
    else await job;

    return json({ run_id: run.id });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
