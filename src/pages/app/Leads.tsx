import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Search, Download, Megaphone, Trash2, Users2, Plus, Mail, ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBulkUpdateLeads, useDeleteLeads, useLeads, usePipelines, type LeadFilters } from "@/hooks/useData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/fields";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, LeadStatusBadge, PageHeader, ScorePill, SourceBadge } from "@/components/ui/misc";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { AddToCampaignModal } from "@/components/leads/AddToCampaignModal";
import { downloadCsv, leadsToCsv } from "@/lib/csv";
import { cn, fmt, LEAD_STATUSES, timeAgo } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/lib/types";

const PAGE_SIZE = 50;

export default function Leads() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: pipelines } = usePipelines();
  const bulk = useBulkUpdateLeads();
  const del = useDeleteLeads();

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);

  const filters: LeadFilters = useMemo(() => ({
    search: debounced,
    status: (params.get("status") as LeadStatus) || "",
    source: (params.get("source") as "firecrawl" | "apify") || "",
    pipelineId: params.get("pipeline") || undefined,
    hasEmail: params.get("email") === "1",
    minScore: Number(params.get("score") || 0),
    sort: (params.get("sort") as LeadFilters["sort"]) || "created_at",
    page: Number(params.get("page") || 0),
    pageSize: PAGE_SIZE,
  }), [debounced, params]);

  const { data, isLoading, isFetching } = useLeads(filters);
  const leads = data?.leads ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const openLead = params.get("lead");

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== "page" && k !== "lead") next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => { setSelected(new Set()); }, [filters.page, filters.status, filters.source, filters.pipelineId, debounced]);

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportSelected = async () => {
    let rows: Lead[] = leads.filter((l) => selected.has(l.id));
    if (!selected.size) {
      // Export the full filtered set (not just the visible page)
      const all: Lead[] = [];
      for (let p = 0; p < pages; p++) {
        const { data: chunk } = await fetchPage({ ...filters, page: p });
        all.push(...chunk);
      }
      rows = all;
    }
    downloadCsv(`leadforge-leads-${new Date().toISOString().slice(0, 10)}.csv`, leadsToCsv(rows));
    toast.success(`Exported ${rows.length} leads`);
  };

  const { user } = useAuth();
  const fetchPage = async (f: LeadFilters) => {
    let q = supabase.from("leads").select("*").eq("owner_id", user!.id);
    if (f.status) q = q.eq("status", f.status);
    if (f.source) q = q.eq("source", f.source);
    if (f.pipelineId) q = q.eq("pipeline_id", f.pipelineId);
    if (f.hasEmail) q = q.not("email", "is", null);
    if (f.minScore) q = q.gte("score", f.minScore);
    if (f.search) { const s = f.search.replace(/[%,()]/g, " ").trim(); q = q.or(`company_name.ilike.%${s}%,contact_name.ilike.%${s}%,email.ilike.%${s}%,domain.ilike.%${s}%`); }
    const { data } = await q.order("created_at", { ascending: false }).range(f.page! * PAGE_SIZE, f.page! * PAGE_SIZE + PAGE_SIZE - 1);
    return { data: (data ?? []) as Lead[] };
  };

  const activeFilters = ["status", "source", "pipeline", "email", "score"].filter((k) => params.get(k));

  return (
    <>
      <PageHeader title="Leads" description={`${fmt(total)} lead${total === 1 ? "" : "s"} in your CRM`}
        actions={<>
          <Button variant="secondary" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" />Add lead</Button>
          <Button variant="secondary" onClick={exportSelected} disabled={!total}><Download className="h-4 w-4" />Export {selected.size ? `(${selected.size})` : "all"}</Button>
        </>} />

      {/* Filters */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search company, contact, email, domain…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:flex">
            <Select className="lg:w-36" value={filters.status} onChange={(e) => setParam("status", e.target.value)} aria-label="Status">
              <option value="">All statuses</option>{LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Select className="lg:w-32" value={filters.source} onChange={(e) => setParam("source", e.target.value)} aria-label="Source">
              <option value="">All sources</option><option value="firecrawl">Firecrawl</option><option value="apify">Apify</option>
            </Select>
            <Select className="lg:w-44" value={filters.pipelineId ?? ""} onChange={(e) => setParam("pipeline", e.target.value)} aria-label="Pipeline">
              <option value="">All pipelines</option>{pipelines?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select className="lg:w-32" value={String(filters.minScore || "")} onChange={(e) => setParam("score", e.target.value)} aria-label="Minimum score">
              <option value="">Any score</option><option value="40">Score 40+</option><option value="70">Score 70+</option>
            </Select>
            <Select className="lg:w-36" value={filters.sort} onChange={(e) => setParam("sort", e.target.value === "created_at" ? null : e.target.value)} aria-label="Sort">
              <option value="created_at">Newest</option><option value="score">Highest score</option><option value="company_name">Company A–Z</option>
            </Select>
          </div>
          <button onClick={() => setParam("email", filters.hasEmail ? null : "1")}
            className={cn("flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm transition", filters.hasEmail ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            <Mail className="h-4 w-4" />Has email
          </button>
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-2 flex items-center gap-2 px-1 text-xs">
            <span className="text-muted-foreground">{activeFilters.length} filter{activeFilters.length > 1 && "s"} active</span>
            <button className="flex items-center gap-1 text-primary hover:underline" onClick={() => setParams(new URLSearchParams(), { replace: true })}><X className="h-3 w-3" />Clear</button>
          </div>
        )}
      </Card>

      {/* Bulk bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="glass fixed inset-x-4 bottom-6 z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl p-2.5 shadow-glow sm:flex-nowrap">
            <span className="px-2 text-sm font-medium">{selected.size} selected</span>
            <Select className="h-8 w-auto text-xs" value="" aria-label="Set status"
              onChange={(e) => { if (e.target.value) bulk.mutate({ ids: [...selected], patch: { status: e.target.value as LeadStatus } }, { onSuccess: () => toast.success("Status updated") }); }}>
              <option value="">Set status…</option>{LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Button size="sm" variant="secondary" onClick={() => setCampaignOpen(true)}><Megaphone className="h-3.5 w-3.5" />Campaign</Button>
            <Button size="sm" variant="secondary" onClick={exportSelected}><Download className="h-3.5 w-3.5" />CSV</Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" /></Button>
            <button className="ml-auto p-1.5 text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())} aria-label="Clear selection"><X className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton rows={8} cols={6} /> : !leads.length ? (
          <EmptyState icon={<Users2 className="h-5 w-5" />} title={activeFilters.length || debounced ? "No leads match these filters" : "No leads yet"}
            description={activeFilters.length || debounced ? "Try widening your search or clearing filters." : "Run a pipeline to start collecting leads, or add one manually."} />
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", isFetching && "opacity-70")}>
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="w-10 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[hsl(var(--primary))]" aria-label="Select all" /></th>
                  <th className="px-3 py-3 font-medium">Company / Contact</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Phone</th>
                  <th className="px-3 py-3 font-medium">Location</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Score</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l, i) => (
                  <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.015 }}
                    onClick={() => setParam("lead", l.id)}
                    className={cn("cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-surface-2/60", selected.has(l.id) && "bg-primary/5")}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} className="accent-[hsl(var(--primary))]" aria-label="Select lead" />
                    </td>
                    <td className="max-w-[240px] px-3 py-3">
                      <div className="truncate font-medium">{l.company_name || l.domain || "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">{[l.contact_name, l.title].filter(Boolean).join(" · ") || l.industry || ""}</div>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-3 font-mono text-xs">{l.email || <span className="text-muted-foreground/60">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{l.phone || <span className="text-muted-foreground/60">—</span>}</td>
                    <td className="max-w-[160px] truncate px-3 py-3 text-xs text-muted-foreground">{l.location || "—"}</td>
                    <td className="px-3 py-3"><LeadStatusBadge status={l.status} /></td>
                    <td className="px-3 py-3"><ScorePill score={l.score} /></td>
                    <td className="px-3 py-3"><SourceBadge source={l.source} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{timeAgo(l.created_at)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span>{fmt(filters.page! * PAGE_SIZE + 1)}–{fmt(Math.min(total, (filters.page! + 1) * PAGE_SIZE))} of {fmt(total)}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={filters.page === 0} onClick={() => setParam("page", String(filters.page! - 1))} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" disabled={filters.page! >= pages - 1} onClick={() => setParam("page", String(filters.page! + 1))} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      <LeadDrawer leadId={openLead} onClose={() => setParam("lead", null)} />
      <AddToCampaignModal open={campaignOpen} onClose={() => setCampaignOpen(false)} leadIds={[...selected]} onDone={() => setSelected(new Set())} />
      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${selected.size} leads?`}
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={async () => { await del.mutateAsync([...selected]); setSelected(new Set()); setConfirmDelete(false); toast.success("Leads deleted"); }}>Delete</Button></>}>
        <p className="text-sm text-muted-foreground">Notes, tasks and campaign memberships for these leads are deleted too. This can't be undone.</p>
      </Modal>
    </>
  );
}

function AddLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ company_name: "", contact_name: "", title: "", email: "", phone: "", website: "" });
  const [saving, setSaving] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!f.company_name && !f.contact_name) return toast.error("Add a company or contact name");
    setSaving(true);
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]));
    let domain: string | null = null;
    try { if (clean.website) domain = new URL(String(clean.website).startsWith("http") ? String(clean.website) : `https://${clean.website}`).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    const score = (clean.email ? 35 : 0) + (clean.phone ? 15 : 0) + (clean.contact_name ? 15 : 0) + (clean.title ? 10 : 0) + (domain ? 10 : 0);
    const { error } = await supabase.from("leads").insert({ ...clean, email: (clean.email as string | null)?.toLowerCase() ?? null, domain, score, owner_id: user!.id, tags: ["manual"] });
    setSaving(false);
    if (error) return toast.error(error.code === "23505" ? "A lead with this email/domain already exists" : error.message);
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success("Lead added");
    setF({ company_name: "", contact_name: "", title: "", email: "", phone: "", website: "" });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add lead manually"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => submit()} loading={saving}>Add lead</Button></>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {([["company_name", "Company"], ["contact_name", "Contact name"], ["title", "Title"], ["email", "Email"], ["phone", "Phone"], ["website", "Website"]] as const).map(([k, label]) => (
          <Field key={k} label={label}><Input value={f[k]} type={k === "email" ? "email" : "text"} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
        ))}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
