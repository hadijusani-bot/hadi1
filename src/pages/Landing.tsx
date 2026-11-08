import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Flame, Boxes, Filter, Megaphone, ShieldCheck, Download, Sparkles, Check, Globe, Zap, Database,
} from "lucide-react";
import { Logo, ThemeToggle } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

const fade = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

const FEATURES = [
  { icon: Flame, title: "Firecrawl pipelines", body: "Point at websites or a search query. LeadForge maps each site, finds contact & team pages, and extracts companies, people, emails and phones with AI." },
  { icon: Boxes, title: "Apify pipelines", body: "Run any Apify Actor — Google Maps, LinkedIn, directories — straight from the dashboard. Results stream back and are normalized automatically." },
  { icon: Filter, title: "Clean, deduped CRM", body: "Every lead is normalized, scored for reachability and deduped by email/domain. Re-runs enrich existing records instead of duplicating them." },
  { icon: Megaphone, title: "Campaign-ready exports", body: "Group leads into campaigns and export outreach lists formatted for Instantly, Apollo, HubSpot, Lemlist or plain CSV." },
  { icon: ShieldCheck, title: "Keys stay server-side", body: "Firecrawl and Apify credentials live in encrypted server secrets and are only used inside edge functions. Never in the browser." },
  { icon: Zap, title: "Live run telemetry", body: "Watch pipeline runs in real time: pages scanned, leads found, enrichment counts and structured error logs." },
];

const STEPS = [
  { n: "01", title: "Define a pipeline", body: "Pick Firecrawl (websites, search) or Apify (any Actor) and describe the leads you want." },
  { n: "02", title: "Run & ingest", body: "Edge functions call the provider, extract structured data and write deduped leads." },
  { n: "03", title: "Qualify", body: "Move leads through New → Contacted → Qualified → Closed with notes and tasks." },
  { n: "04", title: "Export & reach out", body: "Attach leads to a campaign and export a clean outreach list in one click." },
];

function HeroPreview() {
  const rows = [
    { c: "Northwind Dental", n: "Dr. Lena Ortiz", e: "lena@northwinddental.com", s: "Qualified", t: "success", sc: 90 },
    { c: "Brightline Roofing", n: "Marcus Hale", e: "marcus@brightline.co", s: "Contacted", t: "primary", sc: 75 },
    { c: "Atlas Logistics", n: "Priya Raman", e: "p.raman@atlaslog.io", s: "New", t: "info", sc: 60 },
    { c: "Fernwood Studio", n: "—", e: "hello@fernwood.studio", s: "New", t: "info", sc: 45 },
  ] as const;
  return (
    <motion.div variants={fade} custom={4} initial="hidden" animate="show" className="relative mx-auto mt-16 max-w-5xl text-left">
      <div className="absolute -inset-x-10 -top-10 bottom-0 rounded-[2rem] bg-gradient-to-b from-primary/20 via-accent/5 to-transparent blur-2xl" />
      <div className="glass relative overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/60" /><span className="h-2.5 w-2.5 rounded-full bg-warning/60" /><span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <span className="ml-3 font-mono text-[11px] text-muted-foreground">leadforge.app/app/leads</span>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          {[["Leads this week", "1,284", "+18%"], ["Reachable (email)", "73%", "+6%"], ["Pipelines running", "3", "live"]].map(([l, v, d]) => (
            <div key={l} className="rounded-xl border border-border/60 bg-surface-2/50 p-4">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{v}</span><span className="text-xs text-success">{d}</span></div>
            </div>
          ))}
        </div>
        <div className="mx-4 mb-4 overflow-hidden rounded-xl border border-border/60">
          {rows.map((r, i) => (
            <motion.div key={r.c} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.1 }}
              className="grid grid-cols-[1.2fr_1fr_auto] items-center gap-3 border-b border-border/50 px-4 py-3 text-sm last:border-0 sm:grid-cols-[1.2fr_1fr_1.4fr_auto_auto]">
              <span className="truncate font-medium">{r.c}</span>
              <span className="truncate text-muted-foreground">{r.n}</span>
              <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block">{r.e}</span>
              <Badge tone={r.t}>{r.s}</Badge>
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">{r.sc}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div className="glow-orb -top-48 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2" />

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition hover:text-foreground">Features</a>
            <a href="#how" className="transition hover:text-foreground">How it works</a>
            <a href="#pricing" className="transition hover:text-foreground">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link to="/app"><Button size="sm">Open dashboard <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block"><Button size="sm" variant="ghost">Log in</Button></Link>
                <Link to="/signup"><Button size="sm">Start free</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container relative pb-24 pt-20 text-center sm:pt-28">
        <motion.div variants={fade} initial="hidden" animate="show">
          <Badge tone="primary" className="px-3 py-1 text-xs"><Sparkles className="h-3 w-3" /> AI lead intelligence, powered by Firecrawl + Apify</Badge>
        </motion.div>
        <motion.h1 variants={fade} custom={1} initial="hidden" animate="show"
          className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          <span className="text-gradient">Forge real leads</span><br />from the open web.
        </motion.h1>
        <motion.p variants={fade} custom={2} initial="hidden" animate="show" className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Run lead-generation pipelines that crawl websites and scrape structured sources, then qualify,
          organize and export outreach-ready lists — all from one sleek dashboard.
        </motion.p>
        <motion.div variants={fade} custom={3} initial="hidden" animate="show" className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={user ? "/app" : "/signup"}><Button size="lg" className="w-full sm:w-auto">Start forging leads <ArrowRight className="h-4 w-4" /></Button></Link>
          <a href="#how"><Button size="lg" variant="secondary" className="w-full sm:w-auto">See how it works</Button></a>
        </motion.div>
        <HeroPreview />
      </section>

      {/* Logos / sources */}
      <section className="border-y border-border/50 bg-surface/30 py-8">
        <div className="container flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-muted-foreground">
          <span className="text-xs uppercase tracking-widest">Sources</span>
          {[["Firecrawl", Flame], ["Apify", Boxes], ["Google Maps", Globe], ["Company websites", Globe], ["Directories", Database]].map(([n, I]) => {
            const Icon = I as typeof Flame;
            return <span key={n as string} className="flex items-center gap-2"><Icon className="h-4 w-4" />{n as string}</span>;
          })}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything between "who should we call?" and "sent."</h2>
          <p className="mt-4 text-muted-foreground">Pipelines, a lightweight CRM and campaign exports — built for founders, agencies and SDR teams.</p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} variants={fade} custom={i} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}
              className="glass group rounded-2xl p-6 transition hover:-translate-y-1 hover:shadow-glow">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition group-hover:scale-110">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="container py-24">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div className="lg:sticky lg:top-28">
            <Badge tone="accent">Workflow</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">From URL to outreach list in four steps.</h2>
            <p className="mt-4 text-muted-foreground">Every run is logged, every lead is traceable back to the page or dataset it came from.</p>
          </div>
          <div className="space-y-4">
            {STEPS.map((s, i) => (
              <motion.div key={s.n} variants={fade} custom={i} initial="hidden" whileInView="show" viewport={{ once: true }}
                className="glass flex gap-5 rounded-2xl p-6">
                <span className="font-mono text-sm text-primary">{s.n}</span>
                <div><h3 className="font-semibold">{s.title}</h3><p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p></div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bring your own keys. Pay for what you scrape.</h2>
          <p className="mt-4 text-muted-foreground">LeadForge uses your Firecrawl and Apify accounts, so you only pay providers for actual usage.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-2">
          {[
            { name: "Starter", price: "$0", desc: "For solo founders validating a market.", items: ["3 pipelines", "1,000 leads", "CSV export", "Community support"] },
            { name: "Growth", price: "$49", desc: "For agencies and SDR teams.", items: ["Unlimited pipelines", "Unlimited leads", "Campaigns & exports", "Team roles & admin console"], hot: true },
          ].map((p) => (
            <div key={p.name} className={`glass relative rounded-2xl p-7 ${p.hot ? "shadow-glow" : ""}`}>
              {p.hot && <Badge tone="primary" className="absolute right-5 top-5">Popular</Badge>}
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-5 flex items-baseline gap-1"><span className="text-4xl font-semibold">{p.price}</span><span className="text-sm text-muted-foreground">/mo</span></div>
              <ul className="mt-6 space-y-2.5 text-sm">
                {p.items.map((it) => <li key={it} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{it}</li>)}
              </ul>
              <Link to="/signup"><Button className="mt-7 w-full" variant={p.hot ? "primary" : "secondary"}>Get started</Button></Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="glass relative overflow-hidden rounded-3xl px-6 py-16 text-center">
          <div className="glow-orb left-1/2 top-0 h-80 w-80 -translate-x-1/2 -translate-y-1/2" />
          <h2 className="relative text-3xl font-semibold tracking-tight">Your next 1,000 leads are already online.</h2>
          <p className="relative mt-3 text-muted-foreground">Connect Firecrawl or Apify and run your first pipeline in under five minutes.</p>
          <Link to="/signup" className="relative"><Button size="lg" className="mt-8">Create free account <Download className="h-4 w-4 rotate-[-90deg]" /></Button></Link>
        </div>
      </section>

      <footer className="border-t border-border/50 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <span>© {new Date().getFullYear()} LeadForge. Use scraped data responsibly and in line with applicable laws (GDPR, CAN-SPAM).</span>
        </div>
      </footer>
    </div>
  );
}
