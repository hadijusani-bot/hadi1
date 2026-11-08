import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Circle, Mail, Users2, Workflow, TrendingUp, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDashboard, useRuns, useTasks } from "@/hooks/useData";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, RunStatusBadge, EmptyState, SourceBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { LeadsBarChart } from "@/components/charts/LeadsBarChart";
import { fmt, statusLabel, timeAgo, cn } from "@/lib/utils";

function Stat({ label, value, sub, icon: Icon, i }: { label: string; value?: string; sub?: string; icon: typeof Users2; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
      <Card className="group p-5 transition hover:shadow-glow">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label}
          <Icon className="h-4 w-4 transition group-hover:text-primary" />
        </div>
        {value === undefined ? <Skeleton className="mt-3 h-8 w-24" /> : <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>}
        <div className="mt-1 h-4 text-xs text-muted-foreground">{sub}</div>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { data, isLoading } = useDashboard();
  const { data: runs, isLoading: runsLoading } = useRuns({ limit: 6 });
  const { data: tasks } = useTasks();
  const qc = useQueryClient();

  const toggleTask = async (id: string) => {
    await supabase.from("lead_tasks").update({ completed_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const reach = data && data.total ? Math.round((data.withEmail / data.total) * 100) : 0;
  const maxStatus = Math.max(1, ...(data?.byStatus.map((s) => s.count) ?? [1]));

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description="Here's what your pipelines have forged."
        actions={<Link to="/app/pipelines/new"><Button><Plus className="h-4 w-4" />New pipeline</Button></Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat i={0} label="Total leads" icon={Users2} value={data && fmt(data.total)} sub={data ? `+${fmt(data.week)} this week` : ""} />
        <Stat i={1} label="Reachable by email" icon={Mail} value={data && `${reach}%`} sub={data ? `${fmt(data.withEmail)} with email` : ""} />
        <Stat i={2} label="Qualified" icon={TrendingUp} value={data && fmt(data.byStatus.find((s) => s.status === "qualified")?.count ?? 0)} sub="ready for outreach" />
        <Stat i={3} label="Pipelines" icon={Workflow} value={data && fmt(data.pipelines)} sub={runs ? `${runs.filter((r) => r.status === "running").length} running now` : ""} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Leads created · last 14 days</CardTitle></CardHeader>
          <CardBody>{isLoading || !data ? <Skeleton className="h-48 w-full" /> : <LeadsBarChart data={data.daily} />}</CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lead pipeline</CardTitle><Link to="/app/leads" className="text-xs text-muted-foreground hover:text-foreground">View all</Link></CardHeader>
          <CardBody className="space-y-3.5">
            {(data?.byStatus ?? Array.from({ length: 5 }, () => null)).map((s, i) =>
              !s ? <Skeleton key={i} className="h-6 w-full" /> : (
                <Link key={s.status} to={`/app/leads?status=${s.status}`} className="group block">
                  <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground group-hover:text-foreground">{statusLabel(s.status)}</span><span className="font-mono tabular-nums">{fmt(s.count)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(s.count / maxStatus) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />
                  </div>
                </Link>
              ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent runs</CardTitle><Link to="/app/pipelines" className="text-xs text-muted-foreground hover:text-foreground">All pipelines</Link></CardHeader>
          {runsLoading ? (
            <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !runs?.length ? (
            <EmptyState icon={<Workflow className="h-5 w-5" />} title="No runs yet" description="Create a Firecrawl or Apify pipeline and hit Run to start forging leads."
              action={<Link to="/app/pipelines/new"><Button size="sm">Create pipeline</Button></Link>} />
          ) : (
            <div className="divide-y divide-border/60">
              {runs.map((r) => (
                <Link key={r.id} to={`/app/pipelines/${r.pipeline_id}`} className="group flex items-center gap-4 px-5 py-3.5 transition hover:bg-surface-2/50">
                  <SourceBadge source={r.source} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.pipelines?.name ?? "Pipeline"}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(r.created_at)} · {r.leads_created} new · {r.leads_updated} enriched</div>
                  </div>
                  <RunStatusBadge status={r.status} />
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Open tasks</CardTitle></CardHeader>
          <div className="divide-y divide-border/60">
            {!tasks ? <div className="p-5"><Skeleton className="h-10 w-full" /></div> : !tasks.length ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No open tasks. Add follow-ups from a lead's drawer.</p>
            ) : tasks.map((t) => (
              <div key={t.id} className="group flex items-start gap-3 px-5 py-3">
                <button onClick={() => toggleTask(t.id)} className="mt-0.5 text-muted-foreground hover:text-success" aria-label="Complete task">
                  <Circle className="h-4 w-4 group-hover:hidden" /><CheckCircle2 className="hidden h-4 w-4 group-hover:block" />
                </button>
                <Link to={`/app/leads?lead=${t.lead_id}`} className="min-w-0 flex-1">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className={cn("text-xs text-muted-foreground", t.due_at && new Date(t.due_at) < new Date() && "text-danger")}>
                    {t.leads?.company_name ?? t.leads?.contact_name ?? "Lead"}{t.due_at && ` · due ${new Date(t.due_at).toLocaleDateString()}`}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
