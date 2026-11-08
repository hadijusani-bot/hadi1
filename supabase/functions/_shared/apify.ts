import { admin } from "./supabase.ts";
import { appendLog, extractEmails, finishRun, ingestLeads, toDomain, type LeadInput } from "./leads.ts";

export const APIFY = "https://api.apify.com/v2";

export interface ApifyConfig {
  actor_id: string;                       // e.g. "compass/crawler-google-places"
  input?: Record<string, unknown>;        // actor input JSON
  max_items?: number;                     // cap on dataset items ingested (and charged for pay-per-result actors)
  timeout_secs?: number;
  memory_mb?: number;
  field_map?: Partial<Record<keyof LeadInput, string>>; // lead field → dotted path in dataset item
  tags?: string[];
}

export async function apify<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${APIFY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`Apify ${path.split("?")[0]} ${res.status}: ${data?.error?.message ?? String(text).slice(0, 300)}`);
  return data as T;
}

const get = (obj: any, path: string): any =>
  path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const first = (...vals: any[]) => {
  for (const v of vals) {
    if (Array.isArray(v)) { if (v.length) return typeof v[0] === "object" ? v[0]?.value ?? v[0]?.url ?? null : v[0]; }
    else if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
};

/**
 * Map an arbitrary Apify dataset item into a LeadInput. Handles the shapes of the most
 * common lead actors (Google Maps, Contact Details Scraper, LinkedIn/People scrapers,
 * Yellow Pages, etc.). An explicit field_map always wins.
 */
export function mapApifyItem(item: any, cfg: ApifyConfig): LeadInput {
  const fullName = first(item.fullName, item.full_name, item.name && item.firstName ? item.name : null,
    [item.firstName ?? item.first_name, item.lastName ?? item.last_name].filter(Boolean).join(" ") || null);
  const website = first(item.website, item.websiteUrl, item.companyWebsite, item.url && item.domain ? item.url : null, item.domain);
  const emails = [
    ...[].concat(item.emails ?? [], item.email ?? [], item.emailAddress ?? [], item.contactEmail ?? []),
  ].map((e: any) => (typeof e === "string" ? e : e?.value ?? e?.email)).filter(Boolean);
  const textEmails = emails.length ? emails : extractEmails(JSON.stringify(item).slice(0, 20000));

  const lead: LeadInput = {
    company_name: first(item.companyName, item.company_name, item.organization_name, item.company?.name,
      item.title && (item.categoryName || item.placeId) ? item.title : null, item.businessName, item.name && !fullName ? item.name : null),
    contact_name: fullName,
    title: first(item.jobTitle, item.position, item.headline, item.title && fullName ? item.title : null),
    email: textEmails[0] ?? null,
    phone: first(item.phone, item.phoneUnformatted, item.phones, item.phoneNumbers, item.telephone),
    website,
    domain: first(item.domain) ?? toDomain(website),
    linkedin_url: first(item.linkedinUrl, item.linkedInUrl, item.linkedin, item.profileUrl, item.linkedIns),
    location: first(item.address, item.location, [item.city, item.state, item.countryCode].filter(Boolean).join(", ") || null),
    industry: first(item.categoryName, item.industry, item.category, item.categories),
    description: first(item.description, item.summary, item.about),
    source_url: first(item.url, item.profileUrl, item.googleMapsUrl),
    tags: cfg.tags ?? [],
    raw: item,
  };
  for (const [field, path] of Object.entries(cfg.field_map ?? {})) {
    if (path) (lead as any)[field] = first(get(item, path));
  }
  return lead;
}

/** Fetch the run's dataset and ingest it exactly once (atomic claim on ingest_claimed_at). */
export async function ingestApifyRun(runId: string, token: string): Promise<void> {
  const { data: claimed } = await admin.from("pipeline_runs")
    .update({ ingest_claimed_at: new Date().toISOString() })
    .eq("id", runId).is("ingest_claimed_at", null)
    .select("*, pipelines(config)").maybeSingle();
  if (!claimed) return; // someone else is ingesting / already ingested

  const cfg = (claimed.pipelines?.config ?? {}) as ApifyConfig;
  const max = Math.min(cfg.max_items ?? 500, 5000);
  try {
    const items: any[] = [];
    for (let offset = 0; offset < max; offset += 250) {
      const page = await apify<any[]>(token, `/datasets/${claimed.external_dataset}/items?clean=true&format=json&offset=${offset}&limit=${Math.min(250, max - offset)}`);
      items.push(...page);
      if (page.length < 250) break;
    }
    await appendLog(runId, `Fetched ${items.length} dataset items`);
    const res = await ingestLeads({
      ownerId: claimed.owner_id, pipelineId: claimed.pipeline_id, runId, source: "apify",
      leads: items.map((i) => mapApifyItem(i, cfg)),
    });
    await appendLog(runId, `Done: ${res.created} new, ${res.updated} enriched, ${items.length - res.found} skipped (no contact data)`);
    await finishRun(runId, claimed.pipeline_id, { status: "succeeded", items_scanned: items.length, ...res });
  } catch (e) {
    const msg = (e as Error).message;
    await appendLog(runId, msg, "error");
    await finishRun(runId, claimed.pipeline_id, { status: "failed", error: msg });
  }
}

export async function failRun(runId: string, pipelineId: string, msg: string) {
  await appendLog(runId, msg, "error");
  await finishRun(runId, pipelineId, { status: "failed", error: msg });
}
