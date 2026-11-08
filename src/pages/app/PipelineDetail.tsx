import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, Pencil, Trash2, ChevronDown, Users2, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePipeline, useRuns } from "@/hooks/useData";
import { runPipeline, syncApifyRun } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, PageHeader, RunStatusBadge, SourceBadge } from "@/components/ui/misc";
import { cn, duration, timeAgo } from "@/lib/utils";
import type { ApifyConfig, FirecrawlConfig, PipelineRun } from "@/lib/types";

export function RunRow({ run, showPipeline }: { run: PipelineRun; showPipeline?: boolean }) {
  const [open, setOpen] = useState(false);
  const active = run.status === "running" || run.status === "queued";
  return (
    <div className="border-b border-border/60 last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-surface-2/50">
        <RunStatusBadge status={run.status} />
        <div className="min-w-0 flex-1">
          {showPipeline && <div className="truncate text-sm font-medium">{run.pipelines?.name ?? "Pipeline"}</div>}
          <div className="text-xs text-muted-foreground">
            {new Date(run.created_at).toLocaleString()} · {duration(run.started_at, run.finished_at)}{active && " (live)"}
          </div>
        </div>
        <div className="hidden gap-6 text-right font-mono text-xs tabular-nums sm:flex">
          <div><div className="text-muted-foreground">scanned</div>{run.items_scanned}</div>
          <div><div className="text-muted-foreground">new</div><span className="text-success">{run.leads_created}</span></div>
          <div><div className="text-muted-foreground">enriched</div>{run.leads_updated}</div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mx-5 mb-4 rounded-xl border border-border/60 bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
              {run.error && <div className="mb-2 rounded-md bg-danger/10 px-2 py-1.5 text-danger">{run.error}</div>}
              {(run.log ?? []).length === 0 ? <div className="text-muted-foreground">No log entries.</div> :
                run.log.map((l, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="shrink-0 text-muted-foreground/70">{new Date(l.t).toLocaleTimeString()}</span>
                    <span className={cn(l.level === "error" && "text-danger", l.level === "warn" && "text-warning")}>{l.message}</span>
                  </div>
                ))}
              {run.external_run_id && run.source === "apify" && (
                <a href={`https://console.apify.com/view/runs/${run.external_run_id}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline">
                  Open in Apify console <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PipelineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: p, isLoading } = usePipeline(id);
  const { data: runs, isLoading: runsLoading, refetch } = useRuns({ pipelineId: id, limit: 30 });
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const activeRun = runs?.find((r) => r.status === "running" || r.status === "queued");

  // Apify runs finish asynchronously; the webhook ingests results, and we also poll as a fallback.
  useEffect(() => {
    if (!activeRun || activeRun.source !== "apify" || !activeRun.external_run_id) return;
    const t = setInterval(() => { syncApifyRun(activeRun.id).then(() => refetch()).catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, [activeRun?.id, activeRun?.external_run_id, activeRun?.source, refetch]);

  const run = async () => {
    if (!p) return;
    setStarting(true);
    try {
      await runPipeline(p.id, p.source);
      toast.success("Run started — leads will appear as they're processed");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const remove = async () => {
    const { error } = await supabase.from("pipelines").delete().eq("id", id!);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["pipelines"] });
    toast.success("Pipeline deleted (its leads were kept)");
    navigate("/app/pipelines");
  };

  if (isLoading || !p) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;

  const fc = p.config as FirecrawlConfig;
  const ap = p.config as ApifyConfig;
  const totals = (runs ?? []).reduce((a, r) => ({ created: a.created + r.leads_created, runs: a.runs + 1 }), { created: 0, runs: 0 });

  return (
    <>
      <PageHeader title={p.name} description={p.description ?? (p.source === "firecrawl" ? "Firecrawl website pipeline" : "Apify Actor pipeline")}
        actions={<>
          <Button variant="ghost" size="icon" aria-label="Delete pipeline" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /></Button>
          <Link to={`/app/pipelines/${p.id}/edit`}><Button variant="secondary"><Pencil className="h-4 w-4" />Edit</Button></Link>
          <Button onClick={run} loading={starting} disabled={!!activeRun} className={cn(activeRun && "animate-pulse-ring")}>
            {!starting && <Play className="h-4 w-4" />}{activeRun ? "Running…" : "Run pipeline"}
          </Button>
        </>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Run history</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
          </CardHeader>
          {runsLoading ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            : !runs?.length ? <EmptyState icon={<Play className="h-5 w-5" />} title="Not run yet" description="Hit “Run pipeline” to collect your first batch of leads." />
            : runs.map((r) => <RunRow key={r.id} run={r} />)}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Configuration</CardTitle><SourceBadge source={p.source} /></CardHeader>
            <CardBody className="space-y-3 text-sm">
              {p.source === "firecrawl" ? (<>
                <Row k="Mode" v={fc.mode} />
                {fc.mode === "search" ? <><Row k="Query" v={fc.query} /><Row k="Location" v={fc.location || "—"} /><Row k="Max companies" v={fc.limit} /></>
                  : <><Row k="URLs" v={`${fc.urls?.length ?? 0}`} />{fc.mode === "crawl" && <Row k="Pages / site" v={fc.limit} />}</>}
                {fc.prompt && <div><div className="text-xs text-muted-foreground">Instructions</div><p className="mt-1 text-xs">{fc.prompt}</p></div>}
              </>) : (<>
                <Row k="Actor" v={<a className="font-mono text-xs text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://apify.com/${ap.actor_id}`}>{ap.actor_id}</a>} />
                <Row k="Max items" v={ap.max_items ?? "—"} />
                <pre className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-[11px]">{JSON.stringify(ap.input, null, 2)}</pre>
              </>)}
              {!!p.config.tags?.length && <Row k="Tags" v={p.config.tags.join(", ")} />}
            </CardBody>
          </Card>
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <div><div className="text-xs text-muted-foreground">Runs</div><div className="text-2xl font-semibold tabular-nums">{totals.runs}</div></div>
              <div><div className="text-xs text-muted-foreground">Leads created</div><div className="text-2xl font-semibold tabular-nums">{totals.created}</div></div>
            </div>
            <Link to={`/app/leads?pipeline=${p.id}`}><Button variant="secondary" className="mt-4 w-full"><Users2 className="h-4 w-4" />View leads from this pipeline</Button></Link>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Last run {timeAgo(p.last_run_at)}</p>
          </Card>
        </div>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete pipeline?"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}>
        <p className="text-sm text-muted-foreground">This deletes the pipeline and its run history. Leads it already collected stay in your CRM.</p>
      </Modal>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{k}</span><span className="truncate text-right">{v}</span></div>;
}
