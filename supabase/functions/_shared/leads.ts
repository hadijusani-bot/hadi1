import { admin } from "./supabase.ts";

export interface LeadInput {
  company_name?: string | null;
  website?: string | null;
  domain?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  contact_name?: string | null;
  role_title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  company_summary?: string | null;
  services?: string[];
  tech_stack?: string[];
  source_url?: string | null;
  tags?: string[];
  raw?: Record<string, unknown>;
}
type Normalized = LeadInput & { confidence_score: number };

/* ---------------- Extraction helpers ---------------- */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
const JUNK_EMAIL = /(example\.|sentry|wixpress|\.png|\.jpe?g|\.gif|\.webp|\.svg|noreply|no-reply|donotreply|@2x|domain\.com|email\.com|yourname|test@)/i;

export function extractEmails(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/^mailto:/, "").replace(/[.,;:]+$/, "");
    if (!JUNK_EMAIL.test(e)) out.add(e);
  }
  return [...out];
}

export function extractPhones(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) out.add(m[0].trim());
  }
  return [...out].slice(0, 3);
}

export function extractLinkedIn(text: string, kind: "company" | "in" | "any" = "any"): string | null {
  const path = kind === "any" ? "(?:company|in)" : kind;
  const m = text.match(new RegExp(`https?:\\/\\/(?:[a-z]{2,3}\\.)?linkedin\\.com\\/${path}\\/[A-Za-z0-9_\\-%.]+`, "i"));
  return m ? m[0].replace(/[).,]+$/, "") : null;
}

export function toDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Lightweight tech-stack signals from raw HTML. */
const TECH_SIGNALS: [string, RegExp][] = [
  ["WordPress", /wp-content|wp-includes/i], ["Shopify", /cdn\.shopify\.com|myshopify/i], ["Wix", /wixstatic|wix\.com/i],
  ["Squarespace", /squarespace/i], ["Webflow", /webflow/i], ["Next.js", /__NEXT_DATA__|\/_next\//], ["React", /data-reactroot|react-dom/i],
  ["HubSpot", /js\.hs-scripts|hs-analytics|hubspot/i], ["Google Analytics", /googletagmanager|gtag\(|google-analytics/i],
  ["Meta Pixel", /connect\.facebook\.net|fbq\(/i], ["Intercom", /intercom/i], ["Hotjar", /hotjar/i], ["Stripe", /js\.stripe\.com/i],
  ["Calendly", /calendly/i], ["Klaviyo", /klaviyo/i], ["Salesforce", /pardot|salesforce/i], ["Zendesk", /zendesk|zdassets/i],
  ["Drift", /drift\.com|driftt/i], ["Cloudflare", /cloudflare/i], ["Mailchimp", /mailchimp|list-manage/i],
];
export function detectTech(html: string): string[] {
  return TECH_SIGNALS.filter(([, re]) => re.test(html)).map(([n]) => n);
}

/* ---------------- Normalize & score ---------------- */
const clean = (v: unknown, max = 2000): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length ? s.slice(0, max) : null;
};
const cleanList = (v: unknown, max = 15): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [])
    .map((x) => clean(x, 80)).filter((x): x is string => !!x).slice(0, max);

/** 0–100: how confident we are this is a real, reachable lead. */
export function confidence(l: LeadInput): number {
  let s = 0;
  if (l.email) s += l.domain && l.email.endsWith(`@${l.domain}`) ? 35 : 22;
  if (l.phone) s += 12;
  if (l.contact_name) s += 15;
  if (l.role_title) s += 8;
  if (l.linkedin_url) s += 10;
  if (l.website || l.domain) s += 10;
  if (l.company_summary) s += 5;
  if (l.city || l.country) s += 5;
  return Math.min(100, s);
}

export function normalize(l: LeadInput): Normalized {
  const website = clean(l.website, 500);
  const n: LeadInput = {
    company_name: clean(l.company_name, 200),
    website: website && !website.startsWith("http") ? `https://${website}` : website,
    domain: clean(l.domain)?.toLowerCase().replace(/^www\./, "") ?? toDomain(website),
    industry: clean(l.industry, 120),
    country: clean(l.country, 80),
    city: clean(l.city, 120),
    contact_name: clean(l.contact_name, 160),
    role_title: clean(l.role_title, 160),
    email: clean(l.email, 254)?.toLowerCase() ?? null,
    phone: clean(l.phone, 40),
    linkedin_url: clean(l.linkedin_url, 500),
    company_summary: clean(l.company_summary, 1200),
    services: cleanList(l.services),
    tech_stack: cleanList(l.tech_stack, 20),
    source_url: clean(l.source_url, 1000),
    tags: cleanList(l.tags, 20),
    raw: l.raw ?? {},
  };
  if (n.email && (JUNK_EMAIL.test(n.email) || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(n.email))) n.email = null;
  // Never treat social/directory hosts as the company's own domain
  if (n.domain && /(linkedin|facebook|instagram|twitter|x\.com|google\.|yelp|youtube)/.test(n.domain)) {
    n.domain = null;
    if (n.website && !n.linkedin_url?.includes(n.website)) n.website = null;
  }
  return { ...n, confidence_score: confidence(n) };
}

export const isUsable = (l: LeadInput) =>
  !!(l.email || l.phone || l.domain || l.linkedin_url) && !!(l.company_name || l.contact_name || l.domain);

/* ---------------- Dedupe + ingest ---------------- */
const MERGE_SKIP = new Set(["raw", "tags", "services", "tech_stack", "confidence_score"]);

function mergeFill(a: Normalized, b: Normalized): Normalized {
  const out = { ...a } as Record<string, unknown>;
  for (const [k, v] of Object.entries(b)) {
    if (MERGE_SKIP.has(k)) continue;
    if (v && !out[k]) out[k] = v;
  }
  out.tags = [...new Set([...(a.tags ?? []), ...(b.tags ?? [])])];
  out.services = [...new Set([...(a.services ?? []), ...(b.services ?? [])])].slice(0, 15);
  out.tech_stack = [...new Set([...(a.tech_stack ?? []), ...(b.tech_stack ?? [])])].slice(0, 20);
  out.confidence_score = confidence(out as LeadInput);
  return out as Normalized;
}

/**
 * Deduplicate by email + domain and write to `leads`.
 *  • Same email (case-insensitive) → same lead.
 *  • No email → one lead per domain; a later candidate with an email on that domain upgrades it.
 * Existing leads are only *enriched* (empty fields filled) — never overwritten.
 */
export async function ingestLeads(opts: {
  userId: string;
  sourceId: string;
  sourceType: "firecrawl" | "apify";
  leads: LeadInput[];
}): Promise<{ found: number; inserted: number; updated: number }> {
  // 1) Normalize + in-batch dedupe
  const byKey = new Map<string, Normalized>();
  for (const raw of opts.leads) {
    const n = normalize(raw);
    if (!isUsable(n)) continue;
    const key = n.email ? `e:${n.email}` : n.domain ? `d:${n.domain}` : `n:${(n.company_name ?? "").toLowerCase()}|${n.phone ?? n.linkedin_url ?? ""}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergeFill(prev, n) : n);
  }
  // A domain-only candidate is redundant if the batch also has an email lead on that domain
  for (const [key, l] of byKey) {
    if (key.startsWith("d:") && [...byKey.values()].some((o) => o.email && o.domain === l.domain)) {
      const target = [...byKey.entries()].find(([k, o]) => k.startsWith("e:") && o.domain === l.domain)!;
      byKey.set(target[0], mergeFill(target[1], l));
      byKey.delete(key);
    }
  }
  const candidates = [...byKey.values()];
  if (!candidates.length) return { found: 0, inserted: 0, updated: 0 };

  // 2) Look up existing leads by email and by domain
  const emails = [...new Set(candidates.map((c) => c.email).filter(Boolean))] as string[];
  const domains = [...new Set(candidates.map((c) => c.domain).filter(Boolean))] as string[];
  const existing: Record<string, any>[] = [];
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await admin.from("leads").select("*").in("email", emails.slice(i, i + 200));
    if (error) throw error;
    existing.push(...(data ?? []));
  }
  for (let i = 0; i < domains.length; i += 200) {
    const { data, error } = await admin.from("leads").select("*").is("email", null).in("domain", domains.slice(i, i + 200));
    if (error) throw error;
    existing.push(...(data ?? []));
  }
  const byEmail = new Map(existing.filter((e) => e.email).map((e) => [String(e.email).toLowerCase(), e]));
  const byDomain = new Map(existing.filter((e) => !e.email && e.domain).map((e) => [String(e.domain).toLowerCase(), e]));

  // 3) Enrich matches, collect inserts
  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  let updated = 0;
  for (const c of candidates) {
    const match = (c.email && byEmail.get(c.email)) || (c.domain && byDomain.get(c.domain));
    if (!match) {
      inserts.push({ ...c, source_id: opts.sourceId, source_type: opts.sourceType, created_by: opts.userId, last_enriched_at: now });
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(c)) {
      if (MERGE_SKIP.has(k)) continue;
      if (v && !match[k]) patch[k] = v;
    }
    for (const k of ["tags", "services", "tech_stack"] as const) {
      const merged = [...new Set([...(match[k] ?? []), ...(c[k] ?? [])])];
      if (merged.length !== (match[k] ?? []).length) patch[k] = merged;
    }
    patch.confidence_score = Math.max(match.confidence_score ?? 0, confidence({ ...match, ...patch }));
    patch.last_enriched_at = now;
    const { error } = await admin.from("leads").update(patch).eq("id", match.id);
    if (!error) {
      updated++;
      if (c.email) byEmail.set(c.email, { ...match, ...patch });
    }
  }

  // 4) Insert new leads (fall back to row-by-row if a concurrent run created one first)
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { data, error } = await admin.from("leads").insert(chunk).select("id");
    if (!error) { inserted += data?.length ?? 0; continue; }
    if (error.code !== "23505") throw error;
    for (const row of chunk) {
      const r = await admin.from("leads").insert(row).select("id");
      if (!r.error) inserted++;
    }
  }
  return { found: candidates.length, inserted, updated };
}

/* ---------------- Run bookkeeping ---------------- */
export async function logRun(runId: string, message: string, level: "info" | "warn" | "error" = "info") {
  const { data } = await admin.from("pipeline_runs").select("log").eq("id", runId).single();
  const log = Array.isArray(data?.log) ? data!.log : [];
  log.push({ t: new Date().toISOString(), level, message: message.slice(0, 1000) });
  await admin.from("pipeline_runs").update({ log: log.slice(-200) }).eq("id", runId);
}

export const setRun = (runId: string, patch: Record<string, unknown>) =>
  admin.from("pipeline_runs").update(patch).eq("id", runId);

export async function finishRun(runId: string, r: { ok: boolean; error?: string; found?: number; inserted?: number; updated?: number }) {
  await setRun(runId, {
    status: r.ok ? "success" : "failed",
    finished_at: new Date().toISOString(),
    progress: 100,
    error_message: r.ok ? null : friendlyError(r.error ?? "Unknown error"),
    ...(r.found !== undefined ? { items_found: r.found, items_inserted: r.inserted ?? 0, items_updated: r.updated ?? 0 } : {}),
  });
}

/** Turn provider errors into something a user can act on. */
export function friendlyError(msg: string): string {
  if (/401|403|unauthori[sz]ed|invalid api key|invalid token/i.test(msg)) return "The provider rejected the API key. Ask an admin to check it in Admin → API Keys.";
  if (/402|payment|credits|usage limit|insufficient/i.test(msg)) return "The provider account is out of credits or over its usage limit.";
  if (/429|rate limit/i.test(msg)) return "The provider is rate limiting requests. Try again in a few minutes.";
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return "The request timed out. Try fewer sites or a narrower query.";
  if (/not found|404/i.test(msg) && /act/i.test(msg)) return "The Apify Actor wasn't found. Check the Actor configuration.";
  return msg.slice(0, 500);
}
