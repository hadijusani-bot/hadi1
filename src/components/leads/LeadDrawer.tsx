import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  X, Mail, Phone, Globe, Linkedin, MapPin, Building2, Copy, Check, Trash2, CalendarClock, Megaphone, Pencil, ExternalLink, CircleCheck, Circle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLead, useNotes, useTasks, useUpdateLead } from "@/hooks/useData";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { ScorePill, SourceBadge } from "@/components/ui/misc";
import { AddToCampaignModal } from "./AddToCampaignModal";
import { cn, initials, LEAD_STATUSES, timeAgo } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/lib/types";

function CopyRow({ icon: Icon, value, href }: { icon: typeof Mail; value: string | null; href?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-surface-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {href ? <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:text-primary">{value}</a> : <span className="min-w-0 flex-1 truncate text-sm">{value}</span>}
      <button className="opacity-0 transition group-hover:opacity-100" aria-label="Copy"
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
    </div>
  );
}

const EDITABLE: { key: keyof Lead; label: string }[] = [
  { key: "company_name", label: "Company" }, { key: "contact_name", label: "Contact" }, { key: "title", label: "Title" },
  { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "website", label: "Website" },
  { key: "linkedin_url", label: "LinkedIn" }, { key: "location", label: "Location" }, { key: "industry", label: "Industry" },
];

export function LeadDrawer({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: lead, isLoading } = useLead(leadId);
  const { data: notes } = useNotes(leadId);
  const { data: tasks } = useTasks(leadId);
  const update = useUpdateLead();
  const [tab, setTab] = useState<"overview" | "notes" | "tasks">("overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [note, setNote] = useState("");
  const [task, setTask] = useState({ title: "", due: "" });
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { setEditing(false); setTab("overview"); }, [leadId]);
  useEffect(() => {
    if (!leadId) return;
    supabase.from("campaign_leads").select("campaigns(id, name)").eq("lead_id", leadId)
      .then(({ data }) => setCampaigns(((data ?? []) as unknown as { campaigns: { id: string; name: string } | null }[]).map((r) => r.campaigns!).filter(Boolean)));
  }, [leadId, campaignOpen]);

  const setStatus = (status: LeadStatus) => {
    if (!lead) return;
    const patch: Partial<Lead> = { status };
    if (status === "contacted" && !lead.last_contacted_at) patch.last_contacted_at = new Date().toISOString();
    update.mutate({ id: lead.id, patch });
  };

  const saveEdit = async () => {
    if (!lead) return;
    const patch = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]));
    await update.mutateAsync({ id: lead.id, patch });
    setEditing(false);
    toast.success("Lead updated");
  };

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim() || !lead) return;
    const { error } = await supabase.from("lead_notes").insert({ lead_id: lead.id, body: note.trim(), author_id: user!.id });
    if (error) return toast.error(error.message);
    setNote("");
    qc.invalidateQueries({ queryKey: ["notes", lead.id] });
  };

  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!task.title.trim() || !lead) return;
    const { error } = await supabase.from("lead_tasks").insert({
      lead_id: lead.id, owner_id: user!.id, title: task.title.trim(), due_at: task.due ? new Date(task.due).toISOString() : null,
    });
    if (error) return toast.error(error.message);
    setTask({ title: "", due: "" });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const toggleTask = async (id: string, done: boolean) => {
    await supabase.from("lead_tasks").update({ completed_at: done ? null : new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  const deleteRow = async (table: "lead_notes" | "lead_tasks", id: string) => {
    await supabase.from(table).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: [table === "lead_notes" ? "notes" : "tasks"] });
  };

  const openTasks = tasks?.filter((t) => !t.completed_at).length ?? 0;

  return (
    <Drawer open={!!leadId} onClose={onClose}>
      {isLoading || !lead ? (
        <div className="space-y-4 p-6"><Skeleton className="h-12 w-12 rounded-xl" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          <div className="border-b border-border/60 p-5">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/80 to-accent/70 font-semibold text-primary-foreground">
                {initials(lead.contact_name || lead.company_name)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold">{lead.contact_name || lead.company_name || lead.domain}</h2>
                <p className="truncate text-sm text-muted-foreground">{[lead.title, lead.contact_name ? lead.company_name : lead.industry].filter(Boolean).join(" · ") || "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><SourceBadge source={lead.source} /><ScorePill score={lead.score} /></div>
              </div>
              <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            {/* Status pipeline */}
            <div className="mt-5 grid grid-cols-5 gap-1 rounded-xl border border-border/60 bg-background/40 p-1">
              {LEAD_STATUSES.map((s) => (
                <button key={s.value} onClick={() => setStatus(s.value)}
                  className={cn("relative rounded-lg px-1 py-1.5 text-[11px] font-medium transition", lead.status === s.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {lead.status === s.value && <motion.span layoutId="status-pill" className="absolute inset-0 rounded-lg bg-primary" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  <span className="relative">{s.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-1 text-sm">
              {(["overview", "notes", "tasks"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 capitalize transition", tab === t ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {t}{t === "notes" && notes?.length ? ` · ${notes.length}` : ""}{t === "tasks" && openTasks ? ` · ${openTasks}` : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === "overview" && (
              <div className="space-y-6">
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contact</h3>
                    {editing ? (
                      <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" onClick={saveEdit} loading={update.isPending}>Save</Button></div>
                    ) : <Button size="sm" variant="ghost" onClick={() => { setDraft(Object.fromEntries(EDITABLE.map((f) => [f.key, lead[f.key] ?? ""]))); setEditing(true); }}><Pencil className="h-3.5 w-3.5" />Edit</Button>}
                  </div>
                  {editing ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {EDITABLE.map((f) => (
                        <label key={f.key} className="block"><span className="label">{f.label}</span>
                          <Input value={(draft[f.key] as string) ?? ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} /></label>
                      ))}
                    </div>
                  ) : (
                    <div className="-mx-2">
                      <CopyRow icon={Mail} value={lead.email} href={lead.email ? `mailto:${lead.email}` : undefined} />
                      <CopyRow icon={Phone} value={lead.phone} href={lead.phone ? `tel:${lead.phone.replace(/\s/g, "")}` : undefined} />
                      <CopyRow icon={Globe} value={lead.website || lead.domain} href={lead.website ?? (lead.domain ? `https://${lead.domain}` : undefined)} />
                      <CopyRow icon={Linkedin} value={lead.linkedin_url} href={lead.linkedin_url ?? undefined} />
                      <CopyRow icon={Building2} value={lead.company_name} />
                      <CopyRow icon={MapPin} value={lead.location} />
                      {!lead.email && !lead.phone && <p className="px-2 text-sm text-muted-foreground">No direct contact channel yet.</p>}
                    </div>
                  )}
                </section>

                {lead.description && <section><h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">About</h3><p className="text-sm leading-relaxed">{lead.description}</p></section>}

                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tags</h3>
                  <TagEditor tags={lead.tags} onChange={(tags) => update.mutate({ id: lead.id, patch: { tags } })} />
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Campaigns</h3>
                    <Button size="sm" variant="ghost" onClick={() => setCampaignOpen(true)}><Megaphone className="h-3.5 w-3.5" />Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{campaigns.length ? campaigns.map((c) => <Badge key={c.id} tone="primary">{c.name}</Badge>) : <span className="text-sm text-muted-foreground">Not in any campaign</span>}</div>
                </section>

                <section className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Added</span><span>{timeAgo(lead.created_at)}</span></div>
                  <div className="mt-1 flex justify-between"><span>Last contacted</span><span>{timeAgo(lead.last_contacted_at)}</span></div>
                  {lead.source_url && <a href={lead.source_url} target="_blank" rel="noreferrer" className="mt-1 flex items-center justify-between hover:text-foreground"><span>Source</span><span className="flex max-w-[60%] items-center gap-1 truncate">{lead.source_url}<ExternalLink className="h-3 w-3 shrink-0" /></span></a>}
                </section>
              </div>
            )}

            {tab === "notes" && (
              <div>
                <form onSubmit={addNote} className="space-y-2">
                  <Textarea placeholder="Log a call, objection, or context…" value={note} onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(e); }} />
                  <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground"><span className="kbd">⌘</span> + <span className="kbd">Enter</span> to save</span><Button size="sm" type="submit">Add note</Button></div>
                </form>
                <div className="mt-5 space-y-3">
                  {notes?.map((n) => (
                    <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group rounded-xl border border-border/60 bg-surface-2/40 p-3">
                      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{timeAgo(n.created_at)}</span>
                        {n.author_id === user?.id && <button onClick={() => deleteRow("lead_notes", n.id)} className="opacity-0 transition hover:text-danger group-hover:opacity-100" aria-label="Delete note"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </motion.div>
                  ))}
                  {notes && !notes.length && <p className="py-8 text-center text-sm text-muted-foreground">No notes yet.</p>}
                </div>
              </div>
            )}

            {tab === "tasks" && (
              <div>
                <form onSubmit={addTask} className="flex flex-col gap-2 sm:flex-row">
                  <Input placeholder="Follow up with a case study…" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
                  <Input type="date" className="sm:w-40" value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} />
                  <Button type="submit">Add</Button>
                </form>
                <div className="mt-4 space-y-1">
                  {tasks?.map((t) => (
                    <div key={t.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2/60">
                      <button onClick={() => toggleTask(t.id, !!t.completed_at)} aria-label="Toggle task">
                        {t.completed_at ? <CircleCheck className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <span className={cn("flex-1 text-sm", t.completed_at && "text-muted-foreground line-through")}>{t.title}</span>
                      {t.due_at && <span className={cn("flex items-center gap-1 text-[11px] text-muted-foreground", !t.completed_at && new Date(t.due_at) < new Date() && "text-danger")}><CalendarClock className="h-3 w-3" />{new Date(t.due_at).toLocaleDateString()}</span>}
                      <button onClick={() => deleteRow("lead_tasks", t.id)} className="opacity-0 transition hover:text-danger group-hover:opacity-100" aria-label="Delete task"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {tasks && !tasks.length && <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet.</p>}
                </div>
              </div>
            )}
          </div>
          <AddToCampaignModal open={campaignOpen} onClose={() => setCampaignOpen(false)} leadIds={[lead.id]} />
        </>
      )}
    </Drawer>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <Badge key={t} tone="neutral" className="group">
          {t}<button onClick={() => onChange(tags.filter((x) => x !== t))} className="opacity-50 hover:opacity-100" aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
        </Badge>
      ))}
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="+ tag"
        onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { e.preventDefault(); onChange([...new Set([...tags, v.trim()])]); setV(""); } }}
        className="w-20 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60 focus:w-32" />
    </div>
  );
}
