import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LeadStatus } from "./types";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "closed", label: "Closed" },
  { value: "not_a_fit", label: "Not a fit" },
];
export const statusLabel = (s: LeadStatus) => LEAD_STATUSES.find((x) => x.value === s)?.label ?? s;

export function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function duration(start?: string | null, end?: string | null): string {
  if (!start) return "—";
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export const initials = (name?: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export const fmt = (n: number) => new Intl.NumberFormat().format(n);
