import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { Badge, type Tone } from "./badge";
import type { LeadStatus, RunStatus, CampaignStatus } from "@/lib/types";
import { statusLabel } from "@/lib/utils";

export function Logo({ className, to = "/" }: { className?: string; to?: string }) {
  return (
    <Link to={to} className={cn("group inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-glow transition-transform group-hover:rotate-6">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary-foreground" fill="currentColor" aria-hidden>
          <path d="M5 3h4v13h10v4H5z" /><circle cx="17" cy="8" r="3" />
        </svg>
      </span>
      <span>Lead<span className="text-primary">Forge</span></span>
    </Link>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="Toggle theme"
      className={cn("relative grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2/60 text-muted-foreground transition hover:text-foreground", className)}>
      <motion.span key={theme} initial={{ y: 14, opacity: 0, rotate: -40 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ duration: 0.25 }}>
        {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </motion.span>
    </button>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const leadTone: Record<LeadStatus, Tone> = { new: "info", contacted: "primary", qualified: "success", closed: "accent", not_a_fit: "neutral" };
export const LeadStatusBadge = ({ status }: { status: LeadStatus }) => <Badge tone={leadTone[status]}>{statusLabel(status)}</Badge>;

const runTone: Record<RunStatus, Tone> = { queued: "neutral", running: "info", succeeded: "success", failed: "danger", cancelled: "neutral" };
export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge tone={runTone[status]}>
      {(status === "running" || status === "queued") && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {status}
    </Badge>
  );
}

const campTone: Record<CampaignStatus, Tone> = { draft: "neutral", active: "success", paused: "warning", completed: "accent" };
export const CampaignStatusBadge = ({ status }: { status: CampaignStatus }) => <Badge tone={campTone[status]}>{status}</Badge>;

export function SourceBadge({ source }: { source: "firecrawl" | "apify" | null }) {
  if (!source) return null;
  return <Badge tone={source === "firecrawl" ? "warning" : "accent"} className="font-mono">{source}</Badge>;
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-muted-foreground/50";
  return (
    <div className="flex items-center gap-2" title={`Score ${score}/100`}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{score}</span>
    </div>
  );
}
