-- =====================================================================
-- LeadForge — initial schema
-- Tables: profiles, user_roles, pipelines, pipeline_runs, leads,
--         lead_notes, lead_tasks, campaigns, campaign_leads
-- Secrets: integration keys live in Supabase Vault (never in public tables)
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists supabase_vault with schema vault;

-- ---------- Enums ----------
create type public.app_role        as enum ('admin', 'member');
create type public.pipeline_source as enum ('firecrawl', 'apify');
create type public.run_status      as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.lead_status     as enum ('new', 'contacted', 'qualified', 'closed', 'not_a_fit');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed');

-- ---------- Helpers ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  company     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- Roles (separate table — never store roles on profiles) ----------
create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- SECURITY DEFINER so RLS policies can call it without recursion
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_role(auth.uid(), 'admin') $$;

-- New user → profile + role. First user ever becomes admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

  insert into public.user_roles (user_id, role) values (new.id, 'member');

  if (select count(*) from public.user_roles where role = 'admin') = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Pipelines ----------
create table public.pipelines (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name         text not null,
  description  text,
  source       public.pipeline_source not null,
  -- firecrawl: { mode: 'scrape'|'crawl'|'search', urls: [], query, limit, prompt }
  -- apify:     { actor_id, input: {}, max_items, field_map: {} }
  config       jsonb not null default '{}'::jsonb,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index pipelines_owner_idx on public.pipelines(owner_id);
create trigger pipelines_touch before update on public.pipelines
  for each row execute function public.touch_updated_at();

-- ---------- Pipeline runs ----------
create table public.pipeline_runs (
  id               uuid primary key default gen_random_uuid(),
  pipeline_id      uuid not null references public.pipelines(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  source           public.pipeline_source not null,
  status           public.run_status not null default 'queued',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  items_scanned    int not null default 0,
  leads_found      int not null default 0,
  leads_created    int not null default 0,
  leads_updated    int not null default 0,
  error            text,
  external_run_id  text,          -- Apify run id / Firecrawl job id
  external_dataset text,          -- Apify default dataset id
  ingest_claimed_at timestamptz,  -- set atomically so webhook + poll never ingest twice
  log              jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index pipeline_runs_pipeline_idx on public.pipeline_runs(pipeline_id, created_at desc);
create index pipeline_runs_owner_idx    on public.pipeline_runs(owner_id, created_at desc);
create index pipeline_runs_status_idx   on public.pipeline_runs(status);

-- ---------- Leads ----------
create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  pipeline_id   uuid references public.pipelines(id) on delete set null,
  run_id        uuid references public.pipeline_runs(id) on delete set null,
  source        public.pipeline_source,
  status        public.lead_status not null default 'new',
  company_name  text,
  contact_name  text,
  title         text,
  email         text,
  phone         text,
  website       text,
  domain        text,
  linkedin_url  text,
  location      text,
  industry      text,
  description   text,
  score         int not null default 0 check (score between 0 and 100),
  tags          text[] not null default '{}',
  source_url    text,
  raw           jsonb not null default '{}'::jsonb,
  -- Dedupe key: lowercase email, else domain, else company+phone
  dedupe_key    text generated always as (
                  lower(coalesce(nullif(email, ''), nullif(domain, ''), coalesce(company_name, '') || '|' || coalesce(phone, '')))
                ) stored,
  last_contacted_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);
create index leads_owner_status_idx on public.leads(owner_id, status);
create index leads_owner_created_idx on public.leads(owner_id, created_at desc);
create index leads_pipeline_idx on public.leads(pipeline_id);
create index leads_search_idx on public.leads using gin (
  to_tsvector('simple', coalesce(company_name,'') || ' ' || coalesce(contact_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(domain,''))
);
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- ---------- Notes & tasks ----------
create table public.lead_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body       text not null check (length(body) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index lead_notes_lead_idx on public.lead_notes(lead_id, created_at desc);

create table public.lead_tasks (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title        text not null check (length(title) between 1 and 500),
  due_at       timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index lead_tasks_lead_idx  on public.lead_tasks(lead_id);
create index lead_tasks_owner_idx on public.lead_tasks(owner_id, completed_at, due_at);

-- ---------- Campaigns ----------
create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  description text,
  channel     text not null default 'email',   -- email | linkedin | phone | multi
  status      public.campaign_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index campaigns_owner_idx on public.campaigns(owner_id);
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

create table public.campaign_leads (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (campaign_id, lead_id)
);
create index campaign_leads_lead_idx on public.campaign_leads(lead_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.user_roles     enable row level security;
alter table public.pipelines      enable row level security;
alter table public.pipeline_runs  enable row level security;
alter table public.leads          enable row level security;
alter table public.lead_notes     enable row level security;
alter table public.lead_tasks     enable row level security;
alter table public.campaigns      enable row level security;
alter table public.campaign_leads enable row level security;

-- profiles
create policy "profiles: read own or admin" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles (only admins can change roles)
create policy "roles: read own or admin" on public.user_roles for select
  using (user_id = auth.uid() or public.is_admin());
create policy "roles: admin insert" on public.user_roles for insert
  with check (public.is_admin());
create policy "roles: admin delete" on public.user_roles for delete
  using (public.is_admin() and user_id <> auth.uid()); -- admins can't demote themselves

-- pipelines
create policy "pipelines: owner or admin read" on public.pipelines for select
  using (owner_id = auth.uid() or public.is_admin());
create policy "pipelines: owner write" on public.pipelines for insert
  with check (owner_id = auth.uid());
create policy "pipelines: owner update" on public.pipelines for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "pipelines: owner delete" on public.pipelines for delete
  using (owner_id = auth.uid() or public.is_admin());

-- pipeline_runs: written only by edge functions (service role). Clients read.
create policy "runs: owner or admin read" on public.pipeline_runs for select
  using (owner_id = auth.uid() or public.is_admin());

-- Per-run webhook tokens (Apify callback). RLS on, NO policies → only the
-- service role (edge functions) can read/write. Never reachable from the client.
create table public.pipeline_run_secrets (
  run_id         uuid primary key references public.pipeline_runs(id) on delete cascade,
  webhook_secret text not null,
  created_at     timestamptz not null default now()
);
alter table public.pipeline_run_secrets enable row level security;

-- leads
create policy "leads: owner or admin read" on public.leads for select
  using (owner_id = auth.uid() or public.is_admin());
create policy "leads: owner insert" on public.leads for insert
  with check (owner_id = auth.uid());
create policy "leads: owner update" on public.leads for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "leads: owner delete" on public.leads for delete
  using (owner_id = auth.uid());

-- notes / tasks follow lead ownership
create policy "notes: via lead" on public.lead_notes for select
  using (exists (select 1 from public.leads l where l.id = lead_id and (l.owner_id = auth.uid() or public.is_admin())));
create policy "notes: insert via lead" on public.lead_notes for insert
  with check (author_id = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id and l.owner_id = auth.uid()));
create policy "notes: delete own" on public.lead_notes for delete
  using (author_id = auth.uid());

create policy "tasks: via lead" on public.lead_tasks for select
  using (owner_id = auth.uid() or public.is_admin());
create policy "tasks: insert via lead" on public.lead_tasks for insert
  with check (owner_id = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id and l.owner_id = auth.uid()));
create policy "tasks: update own" on public.lead_tasks for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "tasks: delete own" on public.lead_tasks for delete
  using (owner_id = auth.uid());

-- campaigns
create policy "campaigns: owner or admin read" on public.campaigns for select
  using (owner_id = auth.uid() or public.is_admin());
create policy "campaigns: owner insert" on public.campaigns for insert
  with check (owner_id = auth.uid());
create policy "campaigns: owner update" on public.campaigns for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "campaigns: owner delete" on public.campaigns for delete
  using (owner_id = auth.uid());

create policy "campaign_leads: read via campaign" on public.campaign_leads for select
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));
create policy "campaign_leads: insert own" on public.campaign_leads for insert
  with check (
    exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id and l.owner_id = auth.uid())
  );
create policy "campaign_leads: delete own" on public.campaign_leads for delete
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));

-- =====================================================================
-- Integration secrets (Firecrawl / Apify) — stored in Supabase Vault.
-- Only the service role (edge functions) can call these functions.
-- =====================================================================
create or replace function public.set_integration_secret(_name text, _value text)
returns void language plpgsql security definer set search_path = public, vault
as $$
declare
  _id uuid;
  _key text := 'leadforge_' || _name;
begin
  if _name not in ('firecrawl_api_key', 'apify_api_token') then
    raise exception 'unknown secret %', _name;
  end if;
  select id into _id from vault.secrets where name = _key;
  if _value is null or _value = '' then
    if _id is not null then delete from vault.secrets where id = _id; end if;
    return;
  end if;
  if _id is null then
    perform vault.create_secret(_value, _key, 'LeadForge integration key');
  else
    perform vault.update_secret(_id, _value);
  end if;
end $$;

create or replace function public.get_integration_secret(_name text)
returns text language sql security definer set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'leadforge_' || _name limit 1
$$;

-- Returns only metadata (never the value): configured + last updated
create or replace function public.integration_secret_status()
returns table(name text, configured boolean, updated_at timestamptz)
language sql security definer set search_path = public, vault
as $$
  select n, s.id is not null, s.updated_at
  from unnest(array['firecrawl_api_key', 'apify_api_token']) as n
  left join vault.secrets s on s.name = 'leadforge_' || n
$$;

revoke all on function public.set_integration_secret(text, text)  from public, anon, authenticated;
revoke all on function public.get_integration_secret(text)        from public, anon, authenticated;
revoke all on function public.integration_secret_status()         from public, anon, authenticated;
grant execute on function public.set_integration_secret(text, text) to service_role;
grant execute on function public.get_integration_secret(text)       to service_role;
grant execute on function public.integration_secret_status()        to service_role;

-- =====================================================================
-- Analytics helper for the dashboard
-- =====================================================================
create or replace function public.lead_daily_counts(_days int default 14)
returns table(day date, count bigint)
language sql stable security invoker set search_path = public
as $$
  select d::date as day, count(l.id)
  from generate_series(current_date - (_days - 1), current_date, interval '1 day') d
  left join public.leads l
    on l.created_at::date = d::date and l.owner_id = auth.uid()
  group by d order by d
$$;

-- Realtime for live run status + lead inserts
alter publication supabase_realtime add table public.pipeline_runs;
alter publication supabase_realtime add table public.leads;
