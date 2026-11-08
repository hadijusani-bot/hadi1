-- =====================================================================
-- LeadForge schema (Lovable Cloud / Supabase)
--
-- Tables: profiles, user_roles, lead_sources, leads, pipeline_runs,
--         campaigns, campaign_leads, lead_notes, lead_tasks
-- Access model:
--   • Leads are the shared workspace pool: any signed-in user can read/work them.
--   • Members only see THEIR OWN lead sources, pipeline runs, campaigns, notes, tasks.
--   • Admins see everything.
--   • Integration keys (Firecrawl / Apify) live in Supabase Vault — never in tables.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists supabase_vault with schema vault;

-- ---------- Enums ----------
create type public.app_role       as enum ('admin', 'member');
create type public.source_type    as enum ('firecrawl', 'apify', 'manual');
create type public.run_type       as enum ('firecrawl', 'apify');
create type public.run_status     as enum ('queued', 'running', 'success', 'failed');
create type public.lead_status    as enum ('new', 'contacted', 'qualified', 'closed', 'not_a_fit');
create type public.campaign_stage as enum ('new', 'contacted', 'qualified', 'closed');
create type public.task_status    as enum ('open', 'in_progress', 'done');

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =====================================================================
-- Users & roles
-- =====================================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- SECURITY DEFINER so policies can check roles without RLS recursion.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_role(auth.uid(), 'admin') $$;

-- New user → profile + member role. The very first user becomes admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'member');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 1) lead_sources — a saved source configuration (one per pipeline run or manual entry)
-- =====================================================================
create table public.lead_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 200),
  type        public.source_type not null,
  config_json jsonb not null default '{}'::jsonb,
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index lead_sources_created_by_idx on public.lead_sources(created_by, created_at desc);

-- =====================================================================
-- 2) leads — shared workspace lead pool
-- =====================================================================
create table public.leads (
  id               uuid primary key default gen_random_uuid(),
  company_name     text,
  website          text,
  domain           text,                     -- normalized host of website (dedupe key)
  industry         text,
  country          text,
  city             text,
  contact_name     text,
  role_title       text,
  email            text,
  phone            text,
  linkedin_url     text,
  source_id        uuid references public.lead_sources(id) on delete set null,
  source_type      public.source_type not null default 'manual',  -- denormalized for filtering
  confidence_score int not null default 0 check (confidence_score between 0 and 100),
  tags             text[] not null default '{}',
  status           public.lead_status not null default 'new',
  company_summary  text,
  services         text[] not null default '{}',
  tech_stack       text[] not null default '{}',
  source_url       text,
  raw              jsonb not null default '{}'::jsonb,
  created_by       uuid default auth.uid() references auth.users(id) on delete set null,
  last_enriched_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Dedupe: one lead per email, and one email-less lead per domain.
create unique index leads_email_uniq  on public.leads (lower(email)) where email is not null;
create unique index leads_domain_uniq on public.leads (lower(domain)) where email is null and domain is not null;
create index leads_status_idx   on public.leads(status);
create index leads_source_idx   on public.leads(source_type, source_id);
create index leads_created_idx  on public.leads(created_at desc);
create index leads_industry_idx on public.leads(industry);
create index leads_country_idx  on public.leads(country);
create index leads_tags_idx     on public.leads using gin (tags);
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- =====================================================================
-- 3) pipeline_runs — written by edge functions only
-- =====================================================================
create table public.pipeline_runs (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid references public.lead_sources(id) on delete set null,
  run_type          public.run_type not null,
  query_text        text,
  target_urls       text[] not null default '{}',
  status            public.run_status not null default 'queued',
  items_found       int not null default 0,      -- normalized lead candidates found
  items_inserted    int not null default 0,      -- new leads created
  items_updated     int not null default 0,      -- existing leads enriched
  progress          int not null default 0 check (progress between 0 and 100),
  error_message     text,
  created_by        uuid not null references auth.users(id) on delete cascade,
  external_run_id   text,          -- Apify run id
  external_dataset  text,          -- Apify dataset id
  ingest_claimed_at timestamptz,   -- atomic claim so webhook + poll never ingest twice
  log               jsonb not null default '[]'::jsonb,
  started_at        timestamptz,
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);
create index pipeline_runs_user_idx   on public.pipeline_runs(created_by, created_at desc);
create index pipeline_runs_status_idx on public.pipeline_runs(status);

-- Per-run webhook tokens. RLS on with NO policies → service role only.
create table public.pipeline_run_secrets (
  run_id         uuid primary key references public.pipeline_runs(id) on delete cascade,
  webhook_secret text not null,
  created_at     timestamptz not null default now()
);

-- =====================================================================
-- 4) campaigns  5) campaign_leads
-- =====================================================================
create table public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(name) between 1 and 200),
  niche      text,
  offer_text text,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index campaigns_owner_idx on public.campaigns(owner_id);

create table public.campaign_leads (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  stage       public.campaign_stage not null default 'new',
  position    double precision not null default 0,   -- order within a board column
  created_at  timestamptz not null default now(),
  unique (campaign_id, lead_id)
);
create index campaign_leads_lead_idx on public.campaign_leads(lead_id);

-- =====================================================================
-- 6) lead_notes  7) lead_tasks
-- =====================================================================
create table public.lead_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_text  text not null check (length(note_text) between 1 and 10000),
  created_at timestamptz not null default now()
);
create index lead_notes_lead_idx on public.lead_notes(lead_id, created_at desc);

create table public.lead_tasks (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_text   text not null check (length(task_text) between 1 and 500),
  due_date    date,
  status      public.task_status not null default 'open',
  created_at  timestamptz not null default now()
);
create index lead_tasks_assignee_idx on public.lead_tasks(assigned_to, status, due_date);
create index lead_tasks_lead_idx     on public.lead_tasks(lead_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.user_roles           enable row level security;
alter table public.lead_sources         enable row level security;
alter table public.leads                enable row level security;
alter table public.pipeline_runs        enable row level security;
alter table public.pipeline_run_secrets enable row level security;
alter table public.campaigns            enable row level security;
alter table public.campaign_leads       enable row level security;
alter table public.lead_notes           enable row level security;
alter table public.lead_tasks           enable row level security;

-- profiles
create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: only admins manage roles; admins can't remove their own admin role
create policy "roles_select_own_or_admin" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "roles_admin_insert" on public.user_roles for insert to authenticated
  with check (public.is_admin());
create policy "roles_admin_delete" on public.user_roles for delete to authenticated
  using (public.is_admin() and user_id <> auth.uid());

-- lead_sources: own or admin
create policy "sources_select" on public.lead_sources for select to authenticated
  using (created_by = auth.uid() or public.is_admin());
create policy "sources_insert" on public.lead_sources for insert to authenticated
  with check (created_by = auth.uid());
create policy "sources_update" on public.lead_sources for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "sources_delete" on public.lead_sources for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- leads: shared pool for signed-in users; deletes by creator or admin
create policy "leads_select" on public.leads for select to authenticated using (true);
create policy "leads_insert" on public.leads for insert to authenticated
  with check (created_by = auth.uid());
create policy "leads_update" on public.leads for update to authenticated using (true) with check (true);
create policy "leads_delete" on public.leads for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- pipeline_runs: read own or admin; writes only via edge functions (service role)
create policy "runs_select" on public.pipeline_runs for select to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- campaigns: own or admin
create policy "campaigns_select" on public.campaigns for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
create policy "campaigns_insert" on public.campaigns for insert to authenticated
  with check (owner_id = auth.uid());
create policy "campaigns_update" on public.campaigns for update to authenticated
  using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy "campaigns_delete" on public.campaigns for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- campaign_leads: follows campaign ownership
create policy "campaign_leads_select" on public.campaign_leads for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));
create policy "campaign_leads_insert" on public.campaign_leads for insert to authenticated
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));
create policy "campaign_leads_update" on public.campaign_leads for update to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));
create policy "campaign_leads_delete" on public.campaign_leads for delete to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));

-- lead_notes: own or admin
create policy "notes_select" on public.lead_notes for select to authenticated
  using (author_id = auth.uid() or public.is_admin());
create policy "notes_insert" on public.lead_notes for insert to authenticated
  with check (author_id = auth.uid());
create policy "notes_update" on public.lead_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "notes_delete" on public.lead_notes for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- lead_tasks: assignee/creator or admin. Members can only assign to themselves.
create policy "tasks_select" on public.lead_tasks for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.is_admin());
create policy "tasks_insert" on public.lead_tasks for insert to authenticated
  with check (created_by = auth.uid() and (assigned_to = auth.uid() or public.is_admin()));
create policy "tasks_update" on public.lead_tasks for update to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.is_admin())
  with check (assigned_to = auth.uid() or created_by = auth.uid() or public.is_admin());
create policy "tasks_delete" on public.lead_tasks for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- =====================================================================
-- Integration secrets (Firecrawl / Apify) in Supabase Vault — service role only
-- =====================================================================
create or replace function public.set_integration_secret(_name text, _value text)
returns void language plpgsql security definer set search_path = public, vault
as $$
declare _id uuid; _key text := 'leadforge_' || _name;
begin
  if _name not in ('firecrawl_api_key', 'apify_api_token') then raise exception 'unknown secret %', _name; end if;
  select id into _id from vault.secrets where name = _key;
  if coalesce(_value, '') = '' then
    if _id is not null then delete from vault.secrets where id = _id; end if;
    return;
  end if;
  if _id is null then perform vault.create_secret(_value, _key, 'LeadForge integration key');
  else perform vault.update_secret(_id, _value); end if;
end $$;

create or replace function public.get_integration_secret(_name text)
returns text language sql security definer set search_path = public, vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'leadforge_' || _name limit 1 $$;

create or replace function public.integration_secret_status()
returns table(name text, configured boolean, updated_at timestamptz)
language sql security definer set search_path = public, vault
as $$
  select n, s.id is not null, s.updated_at
  from unnest(array['firecrawl_api_key', 'apify_api_token']) as n
  left join vault.secrets s on s.name = 'leadforge_' || n
$$;

revoke all on function public.set_integration_secret(text, text) from public, anon, authenticated;
revoke all on function public.get_integration_secret(text)       from public, anon, authenticated;
revoke all on function public.integration_secret_status()        from public, anon, authenticated;
grant execute on function public.set_integration_secret(text, text) to service_role;
grant execute on function public.get_integration_secret(text)       to service_role;
grant execute on function public.integration_secret_status()        to service_role;

-- =====================================================================
-- Overview analytics (respects RLS: security invoker)
-- =====================================================================
create or replace function public.lead_overview()
returns json language sql stable security invoker set search_path = public
as $$
  select json_build_object(
    'total',       (select count(*) from public.leads),
    'this_week',   (select count(*) from public.leads where created_at >= now() - interval '7 days'),
    'with_email',  (select count(*) from public.leads where email is not null),
    'runs_success',(select count(*) from public.pipeline_runs where status = 'success'),
    'runs_failed', (select count(*) from public.pipeline_runs where status = 'failed'),
    'runs_active', (select count(*) from public.pipeline_runs where status in ('queued', 'running')),
    'by_status',   (select coalesce(json_object_agg(status, c), '{}'::json) from (select status, count(*) c from public.leads group by status) s),
    'top_industries', (select coalesce(json_agg(t), '[]'::json) from (
        select industry as label, count(*) as count from public.leads where industry is not null and industry <> ''
        group by industry order by count(*) desc limit 6) t),
    'top_tags', (select coalesce(json_agg(t), '[]'::json) from (
        select tag as label, count(*) as count from public.leads, unnest(tags) tag
        group by tag order by count(*) desc limit 8) t),
    'daily', (select coalesce(json_agg(d order by d.day), '[]'::json) from (
        select g::date as day, (select count(*) from public.leads l where l.created_at::date = g::date) as count
        from generate_series(current_date - 13, current_date, interval '1 day') g) d)
  )
$$;

-- Distinct filter values for the Leads page
create or replace function public.lead_facets()
returns json language sql stable security invoker set search_path = public
as $$
  select json_build_object(
    'industries', (select coalesce(json_agg(distinct industry order by industry), '[]'::json) from public.leads where industry is not null and industry <> ''),
    'countries',  (select coalesce(json_agg(distinct country order by country), '[]'::json) from public.leads where country is not null and country <> '')
  )
$$;

-- Realtime: live run status + new leads
alter publication supabase_realtime add table public.pipeline_runs;
alter publication supabase_realtime add table public.leads;
