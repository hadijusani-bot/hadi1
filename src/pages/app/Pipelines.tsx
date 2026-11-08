import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, Boxes, Plus, Workflow, Clock } from "lucide-react";
import { usePipelines, useRuns } from "@/hooks/useData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, RunStatusBadge, SourceBadge } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";
import type { ApifyConfig, FirecrawlConfig } from "@/lib/types";

export default function Pipelines() {
  const { data: pipelines, isLoading } = usePipelines();
  const { data: runs } = useRuns({ limit: 100 });
  const lastRun = (id: string) => runs?.find((r) => r.pipeline_id === id);

  return (
    <>
      <PageHeader title="Pipelines" description="Reusable lead-generation jobs powered by Firecrawl and Apify."
        actions={<>
          <Link to="/app/pipelines/new?source=firecrawl"><Button variant="secondary"><Flame className="h-4 w-4 text-warning" />Firecrawl</Button></Link>
          <Link to="/app/pipelines/new?source=apify"><Button><Boxes className="h-4 w-4" />Apify</Button></Link>
        </>} />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : !pipelines?.length ? (
        <Card><EmptyState icon={<Workflow className="h-5 w-5" />} title="No pipelines yet"
          description="Pipelines collect leads from websites (Firecrawl) or structured sources like Google Maps (Apify)."
          action={<Link to="/app/pipelines/new"><Button><Plus className="h-4 w-4" />Create your first pipeline</Button></Link>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pipelines.map((p, i) => {
            const r = lastRun(p.id);
            const summary = p.source === "firecrawl"
              ? (() => { const c = p.config as FirecrawlConfig; return c.mode === "search" ? `Search: “${c.query ?? ""}”` : `${c.mode} · ${c.urls?.length ?? 0} URLs`; })()
              : (p.config as ApifyConfig).actor_id;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link to={`/app/pipelines/${p.id}`}>
                  <Card className="group h-full p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-glow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-2">
                        {p.source === "firecrawl" ? <Flame className="h-5 w-5 text-warning" /> : <Boxes className="h-5 w-5 text-accent" />}
                      </div>
                      {r && <RunStatusBadge status={r.status} />}
                    </div>
                    <h3 className="mt-4 truncate font-semibold">{p.name}</h3>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{summary}</p>
                    <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                      <SourceBadge source={p.source} />
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.last_run_at ? `Ran ${timeAgo(p.last_run_at)}` : "Never run"}</span>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
