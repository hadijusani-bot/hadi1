import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Boxes, Flame, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePipeline } from "@/hooks/useData";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/misc";
import { Skeleton } from "@/components/ui/skeleton";
import { APIFY_PRESETS, FIRECRAWL_MODES } from "@/components/pipelines/presets";
import { cn } from "@/lib/utils";
import type { ApifyConfig, FirecrawlConfig, PipelineSource } from "@/lib/types";

const pretty = (v: unknown) => JSON.stringify(v ?? {}, null, 2);

export default function PipelineEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: existing, isLoading } = usePipeline(id);

  const [source, setSource] = useState<PipelineSource>((params.get("source") as PipelineSource) || "firecrawl");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  // Firecrawl
  const [mode, setMode] = useState<FirecrawlConfig["mode"]>("search");
  const [urls, setUrls] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState(10);
  const [prompt, setPrompt] = useState("");
  // Apify
  const [preset, setPreset] = useState("gmaps");
  const [actorId, setActorId] = useState(APIFY_PRESETS[0].config.actor_id);
  const [input, setInput] = useState(pretty(APIFY_PRESETS[0].config.input));
  const [maxItems, setMaxItems] = useState(100);
  const [fieldMap, setFieldMap] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) return;
    setSource(existing.source);
    setName(existing.name);
    setDescription(existing.description ?? "");
    setTags((existing.config.tags ?? []).join(", "));
    if (existing.source === "firecrawl") {
      const c = existing.config as FirecrawlConfig;
      setMode(c.mode); setUrls((c.urls ?? []).join("\n")); setQuery(c.query ?? ""); setLocation(c.location ?? "");
      setLimit(c.limit ?? 10); setPrompt(c.prompt ?? "");
    } else {
      const c = existing.config as ApifyConfig;
      setPreset(APIFY_PRESETS.find((p) => p.config.actor_id === c.actor_id)?.id ?? "custom");
      setActorId(c.actor_id); setInput(pretty(c.input)); setMaxItems(c.max_items ?? 100);
      setFieldMap(c.field_map && Object.keys(c.field_map).length ? pretty(c.field_map) : "");
    }
  }, [existing]);

  const choosePreset = (pid: string) => {
    const p = APIFY_PRESETS.find((x) => x.id === pid)!;
    setPreset(pid);
    setActorId(p.config.actor_id);
    setInput(pretty(p.config.input));
    setMaxItems(p.config.max_items ?? 100);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    let config: FirecrawlConfig | ApifyConfig;
    if (source === "firecrawl") {
      const urlList = urls.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
      if (mode === "search" && !query.trim()) return toast.error("Enter a search query");
      if (mode !== "search" && !urlList.length) return toast.error("Add at least one URL");
      config = { mode, urls: urlList, query: query.trim(), location: location.trim(), limit, prompt: prompt.trim(), tags: tagList };
    } else {
      if (!actorId.trim()) return toast.error("Enter an Apify Actor ID");
      let parsedInput: Record<string, unknown>, parsedMap: Record<string, string> | undefined;
      try { parsedInput = JSON.parse(input || "{}"); } catch { return toast.error("Actor input must be valid JSON"); }
      try { parsedMap = fieldMap.trim() ? JSON.parse(fieldMap) : undefined; } catch { return toast.error("Field mapping must be valid JSON"); }
      config = { actor_id: actorId.trim(), input: parsedInput, max_items: maxItems, field_map: parsedMap, tags: tagList };
    }

    setSaving(true);
    const row = { name: name.trim() || "Untitled pipeline", description: description.trim() || null, source, config };
    const res = id
      ? await supabase.from("pipelines").update(row).eq("id", id).select().single()
      : await supabase.from("pipelines").insert({ ...row, owner_id: user!.id }).select().single();
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    qc.invalidateQueries({ queryKey: ["pipelines"] });
    qc.invalidateQueries({ queryKey: ["pipeline", res.data.id] });
    toast.success(id ? "Pipeline updated" : "Pipeline created");
    navigate(`/app/pipelines/${res.data.id}`);
  };

  if (id && isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <form onSubmit={submit}>
      <PageHeader title={id ? "Edit pipeline" : "New pipeline"} description="Define where leads come from. You can run it as often as you like."
        actions={<><Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" loading={saving}>{id ? "Save changes" : "Create pipeline"}</Button></>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {!id && (
            <div className="grid gap-3 sm:grid-cols-2">
              {([["firecrawl", Flame, "Firecrawl", "Crawl & extract from websites or web search"], ["apify", Boxes, "Apify", "Run a scraping Actor and ingest its dataset"]] as const).map(([s, Icon, t, d]) => (
                <button type="button" key={s} onClick={() => setSource(s)}
                  className={cn("glass relative rounded-2xl p-5 text-left transition", source === s ? "border-primary/50 shadow-glow" : "hover:border-primary/25")}>
                  {source === s && <motion.span layoutId="src" className="absolute inset-0 rounded-2xl bg-primary/5" />}
                  <Icon className={cn("relative h-5 w-5", s === "firecrawl" ? "text-warning" : "text-accent")} />
                  <div className="relative mt-3 font-semibold">{t}</div>
                  <div className="relative mt-0.5 text-xs text-muted-foreground">{d}</div>
                </button>
              ))}
            </div>
          )}

          <Card>
            <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Pipeline name" className="sm:col-span-2"><Input required placeholder="Austin dentists — Q4" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Description"><Input placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
              <Field label="Tags" hint="Applied to every lead (comma separated)"><Input placeholder="dental, austin" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
            </CardBody>
          </Card>

          {source === "firecrawl" ? (
            <Card>
              <CardHeader><CardTitle>Firecrawl settings</CardTitle></CardHeader>
              <CardBody className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-3">
                  {FIRECRAWL_MODES.map((m) => (
                    <button type="button" key={m.value} onClick={() => setMode(m.value)}
                      className={cn("rounded-xl border p-3 text-left transition", mode === m.value ? "border-primary/50 bg-primary/10" : "border-border hover:bg-surface-2")}>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{m.desc}</div>
                    </button>
                  ))}
                </div>
                {mode === "search" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Search query" className="sm:col-span-2"><Input placeholder="independent dental clinics" value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
                    <Field label="Location (optional)"><Input placeholder="Austin, TX" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
                    <Field label="Max companies" hint="1–50 per run"><Input type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></Field>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="URLs (one per line)" className="sm:col-span-2"><Textarea rows={6} className="font-mono text-xs" placeholder={"https://acme.com\nhttps://globex.io"} value={urls} onChange={(e) => setUrls(e.target.value)} /></Field>
                    {mode === "crawl" && <Field label="Pages per site" hint="1–10 — contact/about/team pages first"><Input type="number" min={1} max={10} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></Field>}
                  </div>
                )}
                <Field label="Extraction instructions (optional)" hint="Guide the AI extractor — e.g. who counts as a decision maker.">
                  <Textarea rows={3} placeholder="Focus on owners, practice managers and marketing leads. Ignore job applicants' contact info." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                </Field>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader><CardTitle>Apify settings</CardTitle></CardHeader>
              <CardBody className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-3">
                  {APIFY_PRESETS.map((p) => (
                    <button type="button" key={p.id} onClick={() => choosePreset(p.id)}
                      className={cn("rounded-xl border p-3 text-left transition", preset === p.id ? "border-primary/50 bg-primary/10" : "border-border hover:bg-surface-2")}>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{p.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Actor ID" className="sm:col-span-2" hint="username/actor-name from the Apify Store"><Input className="font-mono text-xs" placeholder="compass/crawler-google-places" value={actorId} onChange={(e) => setActorId(e.target.value)} /></Field>
                  <Field label="Max items" hint="Caps results & cost"><Input type="number" min={1} max={5000} value={maxItems} onChange={(e) => setMaxItems(Number(e.target.value))} /></Field>
                </div>
                <Field label="Actor input (JSON)" hint="Exactly what you'd paste into the Actor's JSON input tab on Apify.">
                  <Textarea rows={10} spellCheck={false} className="font-mono text-xs" value={input} onChange={(e) => setInput(e.target.value)} />
                </Field>
                <Field label="Field mapping (optional JSON)" hint={<>Override auto-detection: <code className="font-mono">{`{"email":"contact.email","company_name":"org.name"}`}</code></>}>
                  <Textarea rows={3} spellCheck={false} className="font-mono text-xs" placeholder="{}" value={fieldMap} onChange={(e) => setFieldMap(e.target.value)} />
                </Field>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-success" />Keys stay server-side</div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Runs execute in Lovable Cloud edge functions. Your {source === "firecrawl" ? "Firecrawl API key" : "Apify token"} is read from encrypted server secrets and never sent to the browser.
            </p>
          </Card>
          <Card className="p-5">
            <div className="text-sm font-semibold">What counts as a lead?</div>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>• A company or person <span className="text-foreground">plus</span> at least one contact channel (email, phone, LinkedIn or domain).</li>
              <li>• Emails are verified to literally appear in the source — never guessed.</li>
              <li>• Deduped by email → domain. Re-runs enrich instead of duplicating.</li>
              <li>• Scored 0–100 by reachability (email, phone, named contact, title…).</li>
            </ul>
          </Card>
        </div>
      </div>
    </form>
  );
}
