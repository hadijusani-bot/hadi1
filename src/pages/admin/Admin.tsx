import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Users2, KeyRound, Activity, Shield, ShieldOff, Flame, Boxes, CheckCircle2, XCircle, Eye, EyeOff, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRuns } from "@/hooks/useData";
import { invoke } from "@/lib/api";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/fields";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { RunRow } from "@/pages/app/PipelineDetail";
import { cn, initials, timeAgo } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const TABS = [
  { id: "users", label: "Users & roles", icon: Users2 },
  { id: "keys", label: "API keys", icon: KeyRound },
  { id: "runs", label: "Pipeline runs", icon: Activity },
] as const;

export default function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("users");
  return (
    <>
      <PageHeader title="Admin console" description="Manage your workspace's users, integrations and pipeline health." />
      <div className="mb-5 inline-flex rounded-xl border border-border bg-surface/50 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {tab === t.id && <motion.span layoutId="admin-tab" className="absolute inset-0 rounded-lg bg-surface-2 shadow-card" />}
            <t.icon className="relative h-4 w-4" /><span className="relative hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "keys" && <KeysTab />}
      {tab === "runs" && <RunsTab />}
    </>
  );
}

function UsersTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw new Error(error.message);
      return (profiles as Profile[]).map((p) => ({ ...p, admin: !!roles?.some((r) => r.user_id === p.id && r.role === "admin") }));
    },
  });

  const setAdmin = async (userId: string, makeAdmin: boolean) => {
    const { error } = makeAdmin
      ? await supabase.from("user_roles").insert({ user_id: userId, role: "admin" })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    if (error) return toast.error(error.message);
    toast.success(makeAdmin ? "Promoted to admin" : "Admin role removed");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const rows = (data ?? []).filter((u) => !q || `${u.full_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>{data ? `${data.length} user${data.length === 1 ? "" : "s"}` : "…"}</CardTitle><Input className="h-8 max-w-xs text-xs" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} /></CardHeader>
      {isLoading ? <TableSkeleton rows={4} cols={4} /> : (
        <div className="divide-y divide-border/50">
          {rows.map((u) => (
            <div key={u.id} className="flex items-center gap-4 px-5 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-xs font-semibold">{initials(u.full_name || u.email)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{u.full_name || "—"} {u.id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}</div>
                <div className="truncate text-xs text-muted-foreground">{u.email} · joined {timeAgo(u.created_at)}</div>
              </div>
              <Badge tone={u.admin ? "primary" : "neutral"}>{u.admin ? "Admin" : "Member"}</Badge>
              {u.id !== user?.id && (
                u.admin
                  ? <Button size="sm" variant="ghost" onClick={() => setAdmin(u.id, false)}><ShieldOff className="h-3.5 w-3.5" />Demote</Button>
                  : <Button size="sm" variant="secondary" onClick={() => setAdmin(u.id, true)}><Shield className="h-3.5 w-3.5" />Make admin</Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

interface KeyStatus { name: "firecrawl_api_key" | "apify_api_token"; env: boolean; vault: boolean; updated_at: string | null; active_source: "env" | "vault" | null }
const KEY_META = {
  firecrawl_api_key: { label: "Firecrawl", icon: Flame, env: "FIRECRAWL_API_KEY", help: "Recommended: connect Firecrawl via Lovable → Connectors. That sets FIRECRAWL_API_KEY for edge functions automatically.", link: "https://www.firecrawl.dev/app/api-keys" },
  apify_api_token: { label: "Apify", icon: Boxes, env: "APIFY_API_TOKEN", help: "Recommended: add APIFY_API_TOKEN in Lovable Cloud → Secrets. Find it in Apify Console → Settings → API & Integrations.", link: "https://console.apify.com/settings/integrations" },
};

function KeysTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-keys"],
    queryFn: () => invoke<{ keys: KeyStatus[] }>("admin-api-keys", { action: "status" }),
  });
  return (
    <div className="space-y-4">
      <Card className="flex gap-3 border-success/25 p-4 text-sm">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div className="text-muted-foreground">
          Keys are <span className="text-foreground">write-only</span> from this page. They're stored encrypted (Lovable Cloud secrets or Supabase Vault),
          read only inside edge functions, and never returned to the browser. Environment secrets take priority over Vault keys.
        </div>
      </Card>
      {isLoading ? <Skeleton className="h-48 w-full rounded-2xl" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data?.keys.map((k) => <KeyCard key={k.name} k={k} onChange={refetch} />)}
        </div>
      )}
    </div>
  );
}

function KeyCard({ k, onChange }: { k: KeyStatus; onChange: () => void }) {
  const meta = KEY_META[k.name];
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const act = async (action: "set" | "delete" | "test") => {
    setBusy(action);
    try {
      if (action === "test") setTest(await invoke("admin-api-keys", { action, name: k.name }));
      else {
        await invoke("admin-api-keys", { action, name: k.name, value });
        setValue(""); setTest(null);
        toast.success(action === "set" ? `${meta.label} key saved to Vault` : `${meta.label} Vault key removed`);
        onChange();
      }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><meta.icon className="h-4 w-4" />{meta.label}</CardTitle>
        {k.active_source ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" />Active · {k.active_source === "env" ? "Cloud secret" : "Vault"}</Badge> : <Badge tone="warning">Not configured</Badge>}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{meta.help}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-border/60 p-2.5"><div className="text-muted-foreground">Cloud secret <code className="font-mono">{meta.env}</code></div><div className="mt-0.5 font-medium">{k.env ? "Set" : "Not set"}</div></div>
          <div className="rounded-lg border border-border/60 p-2.5"><div className="text-muted-foreground">Vault key</div><div className="mt-0.5 font-medium">{k.vault ? `Set · ${timeAgo(k.updated_at)}` : "Not set"}</div></div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input type={show ? "text" : "password"} autoComplete="off" spellCheck={false} className="pr-9 font-mono text-xs" placeholder={k.vault ? "Paste a new key to rotate" : "Paste key to store in Vault"} value={value} onChange={(e) => setValue(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Toggle visibility">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <Button onClick={() => act("set")} disabled={value.length < 10} loading={busy === "set"}>Save</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => act("test")} loading={busy === "test"} disabled={!k.active_source}>Test connection</Button>
          {k.vault && <Button size="sm" variant="ghost" onClick={() => act("delete")} loading={busy === "delete"}>Remove Vault key</Button>}
          <a href={meta.link} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary hover:underline">Get a key ↗</a>
        </div>
        {test && <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs", test.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>{test.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{test.detail}</div>}
      </CardBody>
    </Card>
  );
}

function RunsTab() {
  const [filter, setFilter] = useState<"all" | "failed" | "running">("all");
  const { data, isLoading } = useRuns({ limit: 100, all: true });
  const runs = (data ?? []).filter((r) => filter === "all" || (filter === "failed" ? r.status === "failed" : r.status === "running" || r.status === "queued"));
  const failed = data?.filter((r) => r.status === "failed").length ?? 0;
  const ok = data?.filter((r) => r.status === "succeeded").length ?? 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {([["Runs (last 100)", data?.length ?? 0, "text-foreground"], ["Succeeded", ok, "text-success"], ["Failed", failed, "text-danger"]] as const).map(([l, v, c]) => (
          <Card key={l} className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={cn("mt-1 text-2xl font-semibold tabular-nums", c)}>{v}</div></Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>All workspace runs</CardTitle>
          <Select className="h-8 w-36 text-xs" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter runs">
            <option value="all">All runs</option><option value="failed">Errors only</option><option value="running">In progress</option>
          </Select>
        </CardHeader>
        {isLoading ? <TableSkeleton rows={5} cols={4} /> : !runs.length ? <EmptyState icon={<Activity className="h-5 w-5" />} title="Nothing here" description="No runs match this filter." /> : runs.map((r) => <RunRow key={r.id} run={r} showPipeline />)}
      </Card>
    </div>
  );
}
