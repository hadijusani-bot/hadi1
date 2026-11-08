import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Campaign, Lead, LeadNote, LeadStatus, LeadTask, Pipeline, PipelineRun } from "@/lib/types";
import { useAuth } from "./useAuth";

const throwIf = <T,>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

/* ---------------- Pipelines ---------------- */
// Admins can *read* everything via RLS, but the workspace views are scoped to the
// signed-in user's own data. Cross-user oversight lives in the Admin Console.
export function usePipelines() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["pipelines", user?.id],
    enabled: !!user,
    queryFn: async () => throwIf(await supabase.from("pipelines").select("*").eq("owner_id", user!.id).order("created_at", { ascending: false })) as Pipeline[],
  });
}

export const usePipeline = (id?: string) =>
  useQuery({
    queryKey: ["pipeline", id],
    enabled: !!id,
    queryFn: async () => throwIf(await supabase.from("pipelines").select("*").eq("id", id!).single()) as Pipeline,
  });

/* ---------------- Runs (with realtime) ---------------- */
export function useRuns(opts: { pipelineId?: string; limit?: number; all?: boolean } = {}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["runs", opts.pipelineId ?? "all", opts.limit ?? 25, !!opts.all];
  useEffect(() => {
    const ch = supabase
      .channel(`runs-${opts.pipelineId ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "pipeline_runs",
        ...(opts.pipelineId ? { filter: `pipeline_id=eq.${opts.pipelineId}` } : {}),
      }, (payload) => {
        qc.invalidateQueries({ queryKey: ["runs"] });
        const n = payload.new as PipelineRun | undefined;
        if (n && (n.status === "succeeded" || n.status === "failed")) {
          qc.invalidateQueries({ queryKey: ["leads"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["pipelines"] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [opts.pipelineId, qc]);

  return useQuery({
    queryKey: key,
    refetchInterval: (q) => ((q.state.data as PipelineRun[] | undefined)?.some((r) => r.status === "running" || r.status === "queued") ? 5000 : false),
    queryFn: async () => {
      let q = supabase.from("pipeline_runs").select("*, pipelines(name)").order("created_at", { ascending: false }).limit(opts.limit ?? 25);
      if (opts.pipelineId) q = q.eq("pipeline_id", opts.pipelineId);
      if (!opts.all && user) q = q.eq("owner_id", user.id);
      return throwIf(await q) as PipelineRun[];
    },
  });
}

/* ---------------- Leads ---------------- */
export interface LeadFilters {
  search?: string;
  status?: LeadStatus | "";
  source?: "firecrawl" | "apify" | "";
  pipelineId?: string;
  hasEmail?: boolean;
  minScore?: number;
  page?: number;
  pageSize?: number;
  sort?: "created_at" | "score" | "company_name";
}

export function useLeads(f: LeadFilters) {
  const pageSize = f.pageSize ?? 50;
  const { user } = useAuth();
  return useQuery({
    queryKey: ["leads", user?.id, f],
    enabled: !!user,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from("leads").select("*", { count: "exact" }).eq("owner_id", user!.id);
      if (f.search) {
        const s = f.search.replace(/[%,()]/g, " ").trim();
        q = q.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%,email.ilike.%${s}%,domain.ilike.%${s}%,location.ilike.%${s}%,industry.ilike.%${s}%`);
      }
      if (f.status) q = q.eq("status", f.status);
      if (f.source) q = q.eq("source", f.source);
      if (f.pipelineId) q = q.eq("pipeline_id", f.pipelineId);
      if (f.hasEmail) q = q.not("email", "is", null);
      if (f.minScore) q = q.gte("score", f.minScore);
      const page = f.page ?? 0;
      const sort = f.sort ?? "created_at";
      q = q.order(sort, { ascending: sort === "company_name" }).range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return { leads: data as Lead[], count: count ?? 0 };
    },
  });
}

export const useLead = (id?: string | null) =>
  useQuery({
    queryKey: ["lead", id],
    enabled: !!id,
    queryFn: async () => throwIf(await supabase.from("leads").select("*").eq("id", id!).single()) as Lead,
  });

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Lead> }) =>
      throwIf(await supabase.from("leads").update(patch).eq("id", id).select().single()) as Lead,
    onSuccess: (lead) => {
      qc.setQueryData(["lead", lead.id], lead);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkUpdateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Partial<Lead> }) =>
      throwIf(await supabase.from("leads").update(patch).in("id", ids)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => throwIf(await supabase.from("leads").delete().in("id", ids)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ---------------- Notes & tasks ---------------- */
export const useNotes = (leadId?: string | null) =>
  useQuery({
    queryKey: ["notes", leadId],
    enabled: !!leadId,
    queryFn: async () => throwIf(await supabase.from("lead_notes").select("*").eq("lead_id", leadId!).order("created_at", { ascending: false })) as LeadNote[],
  });

export function useTasks(leadId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tasks", leadId ?? "mine"],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("lead_tasks").select("*, leads(company_name, contact_name)").order("completed_at", { ascending: true, nullsFirst: true }).order("due_at", { ascending: true, nullsFirst: false });
      if (leadId) q = q.eq("lead_id", leadId);
      else q = q.eq("owner_id", user!.id).is("completed_at", null).limit(8);
      return throwIf(await q) as (LeadTask & { leads?: { company_name: string | null; contact_name: string | null } })[];
    },
  });
}

/* ---------------- Campaigns ---------------- */
export function useCampaigns() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["campaigns", user?.id],
    enabled: !!user,
    queryFn: async () => throwIf(await supabase.from("campaigns").select("*, campaign_leads(count)").eq("owner_id", user!.id).order("created_at", { ascending: false })) as Campaign[],
  });
}

export const useCampaign = (id?: string) =>
  useQuery({
    queryKey: ["campaign", id],
    enabled: !!id,
    queryFn: async () => throwIf(await supabase.from("campaigns").select("*").eq("id", id!).single()) as Campaign,
  });

export const useCampaignLeads = (id?: string) =>
  useQuery({
    queryKey: ["campaign-leads", id],
    enabled: !!id,
    queryFn: async () => {
      const rows = throwIf(await supabase.from("campaign_leads").select("added_at, leads(*)").eq("campaign_id", id!).order("added_at", { ascending: false })) as unknown as { added_at: string; leads: Lead }[];
      return rows.map((r) => r.leads).filter(Boolean);
    },
  });

export function useAddLeadsToCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, leadIds }: { campaignId: string; leadIds: string[] }) =>
      throwIf(await supabase.from("campaign_leads").upsert(leadIds.map((lead_id) => ({ campaign_id: campaignId, lead_id })), { onConflict: "campaign_id,lead_id", ignoreDuplicates: true })),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-leads", v.campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/* ---------------- Dashboard ---------------- */
export function useDashboard() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      const own = <T extends { eq: (c: string, v: string) => T }>(q: T) => q.eq("owner_id", user!.id);
      const count = async (build: (q: any) => any) => {
        const { count, error } = await build(own(supabase.from("leads").select("id", { count: "exact", head: true }) as any));
        if (error) throw new Error(error.message);
        return count ?? 0;
      };
      const statuses: LeadStatus[] = ["new", "contacted", "qualified", "closed", "not_a_fit"];
      const [total, week, withEmail, byStatus, daily, pipelines] = await Promise.all([
        count((q) => q),
        count((q) => q.gte("created_at", weekAgo)),
        count((q) => q.not("email", "is", null)),
        Promise.all(statuses.map(async (s) => ({ status: s, count: await count((q) => q.eq("status", s)) }))),
        supabase.rpc("lead_daily_counts", { _days: 14 }),
        supabase.from("pipelines").select("id", { count: "exact", head: true }).eq("owner_id", user!.id),
      ]);
      return {
        total, week, withEmail, byStatus,
        daily: ((daily.data ?? []) as { day: string; count: number }[]).map((d) => ({ day: d.day, count: Number(d.count) })),
        pipelines: pipelines.count ?? 0,
      };
    },
  });
}
