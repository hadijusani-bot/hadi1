export type AppRole = "admin" | "member";
export type PipelineSource = "firecrawl" | "apify";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type LeadStatus = "new" | "contacted" | "qualified" | "closed" | "not_a_fit";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  company: string | null;
  created_at: string;
}

export interface FirecrawlConfig {
  mode: "scrape" | "crawl" | "search";
  urls?: string[];
  query?: string;
  location?: string;
  limit?: number;
  prompt?: string;
  tags?: string[];
}

export interface ApifyConfig {
  actor_id: string;
  input?: Record<string, unknown>;
  max_items?: number;
  timeout_secs?: number;
  memory_mb?: number;
  field_map?: Record<string, string>;
  tags?: string[];
}

export interface Pipeline {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  source: PipelineSource;
  config: FirecrawlConfig | ApifyConfig;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunLogEntry { t: string; level: "info" | "warn" | "error"; message: string }

export interface PipelineRun {
  id: string;
  pipeline_id: string;
  owner_id: string;
  source: PipelineSource;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  items_scanned: number;
  leads_found: number;
  leads_created: number;
  leads_updated: number;
  error: string | null;
  external_run_id: string | null;
  log: RunLogEntry[];
  created_at: string;
  pipelines?: { name: string } | null;
}

export interface Lead {
  id: string;
  owner_id: string;
  pipeline_id: string | null;
  run_id: string | null;
  source: PipelineSource | null;
  status: LeadStatus;
  company_name: string | null;
  contact_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  domain: string | null;
  linkedin_url: string | null;
  location: string | null;
  industry: string | null;
  description: string | null;
  score: number;
  tags: string[];
  source_url: string | null;
  raw: Record<string, unknown>;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadNote { id: string; lead_id: string; author_id: string; body: string; created_at: string }
export interface LeadTask { id: string; lead_id: string; owner_id: string; title: string; due_at: string | null; completed_at: string | null; created_at: string }

export interface Campaign {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  channel: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
  campaign_leads?: { count: number }[];
}
