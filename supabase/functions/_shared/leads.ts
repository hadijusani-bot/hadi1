import { admin } from "./supabase.ts";

export interface LeadInput {
  company_name?: string | null;
  contact_name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  domain?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  industry?: string | null;
  description?: string | null;
  source_url?: string | null;
  tags?: string[];
  raw?: Record<string, unknown>;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
const JUNK_EMAIL = /(example\.|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|\.svg|noreply|no-reply|@2x|domain\.com|email\.com)/i;

export function extractEmails(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/^mailto:/, "").replace(/[.,;:]+$/, "");
    if (!JUNK_EMAIL.test(e)) found.add(e);
  }
  return [...found];
}

export function extractPhones(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) found.add(m[0].trim());
  }
  return [...found].slice(0, 3);
}

export function extractLinkedIn(text: string): string | null {
  const m = text.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_\-%]+/i);
  return m ? m[0] : null;
}

export function toDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const clean = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s.slice(0, 2000) : null;
};

/** Simple 0–100 lead score based on how reachable/complete the lead is. */
export function scoreLead(l: LeadInput): number {
  let s = 0;
  if (l.email) s += 35;
  if (l.phone) s += 15;
  if (l.contact_name) s += 15;
  if (l.title) s += 10;
  if (l.website || l.domain) s += 10;
  if (l.linkedin_url) s += 10;
  if (l.location) s += 5;
  return Math.min(100, s);
}

export function normalize(l: LeadInput): LeadInput & { score: number } {
  const website = clean(l.website);
  const out: LeadInput = {
    company_name: clean(l.company_name),
    contact_name: clean(l.contact_name),
    title: clean(l.title),
    email: clean(l.email)?.toLowerCase() ?? null,
    phone: clean(l.phone),
    website,
    domain: clean(l.domain)?.toLowerCase() ?? toDomain(website),
    linkedin_url: clean(l.linkedin_url),
    location: clean(l.location),
    industry: clean(l.industry),
    description: clean(l.description),
    source_url: clean(l.source_url),
    tags: (l.tags ?? []).filter(Boolean).slice(0, 20),
    raw: l.raw ?? {},
  };
  if (out.email && JUNK_EMAIL.test(out.email)) out.email = null;
  return { ...out, score: scoreLead(out) };
}

/** Must match the generated `dedupe_key` column in the leads table. */
export function dedupeKey(l: LeadInput): string {
  const v = (l.email || "") || (l.domain || "") || `${l.company_name ?? ""}|${l.phone ?? ""}`;
  return v.toLowerCase();
}

export function isUsable(l: LeadInput): boolean {
  return !!(l.email || l.phone || l.domain || l.linkedin_url) && !!(l.company_name || l.contact_name || l.domain);
}

/**
 * Insert new leads and enrich existing ones (fills empty fields only — never
 * overwrites a user's status, notes, or edits).
 */
export async function ingestLeads(opts: {
  ownerId: string;
  pipelineId: string;
  runId: string;
  source: "firecrawl" | "apify";
  leads: LeadInput[];
}): Promise<{ found: number; created: number; updated: number }> {
  const byKey = new Map<string, LeadInput & { score: number }>();
  for (const raw of opts.leads) {
    const n = normalize(raw);
    if (!isUsable(n)) continue;
    const key = dedupeKey(n);
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergeFill(prev, n) : n);
  }
  const keys = [...byKey.keys()];
  if (!keys.length) return { found: 0, created: 0, updated: 0 };

  const existing = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await admin
      .from("leads")
      .select("*")
      .eq("owner_id", opts.ownerId)
      .in("dedupe_key", keys.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) existing.set(row.dedupe_key as string, row);
  }

  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  for (const [key, lead] of byKey) {
    const row = existing.get(key);
    if (!row) {
      inserts.push({
        ...lead,
        owner_id: opts.ownerId,
        pipeline_id: opts.pipelineId,
        run_id: opts.runId,
        source: opts.source,
      });
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(lead)) {
      if (k === "raw" || k === "tags" || k === "score") continue;
      if (v && !row[k]) patch[k] = v;
    }
    const mergedTags = [...new Set([...(row.tags as string[] ?? []), ...(lead.tags ?? [])])];
    if (mergedTags.length !== (row.tags as string[] ?? []).length) patch.tags = mergedTags;
    if (Object.keys(patch).length) {
      patch.score = Math.max(row.score as number, scoreLead({ ...(row as LeadInput), ...(patch as LeadInput) }));
      const { error } = await admin.from("leads").update(patch).eq("id", row.id);
      if (!error) updated++;
    }
  }

  let created = 0;
  for (let i = 0; i < inserts.length; i += 200) {
    const { data, error } = await admin.from("leads").insert(inserts.slice(i, i + 200)).select("id");
    if (error) throw error;
    created += data?.length ?? 0;
  }
  return { found: byKey.size, created, updated };
}

function mergeFill<T extends LeadInput & { score: number }>(a: T, b: T): T {
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) if (v && !out[k]) out[k] = v;
  out.score = scoreLead(out as LeadInput);
  return out as T;
}

export async function appendLog(runId: string, message: string, level: "info" | "warn" | "error" = "info") {
  const { data } = await admin.from("pipeline_runs").select("log").eq("id", runId).single();
  const log = Array.isArray(data?.log) ? data!.log : [];
  log.push({ t: new Date().toISOString(), level, message: message.slice(0, 1000) });
  await admin.from("pipeline_runs").update({ log: log.slice(-200) }).eq("id", runId);
}

export async function finishRun(
  runId: string,
  pipelineId: string,
  result: { status: "succeeded" | "failed"; error?: string; items_scanned?: number; found?: number; created?: number; updated?: number },
) {
  await admin.from("pipeline_runs").update({
    status: result.status,
    finished_at: new Date().toISOString(),
    error: result.error ?? null,
    items_scanned: result.items_scanned ?? 0,
    leads_found: result.found ?? 0,
    leads_created: result.created ?? 0,
    leads_updated: result.updated ?? 0,
  }).eq("id", runId);
  await admin.from("pipelines").update({ last_run_at: new Date().toISOString() }).eq("id", pipelineId);
}
