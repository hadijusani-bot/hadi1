import type { Lead } from "./types";

const COLUMNS: { key: keyof Lead | "first_name" | "last_name"; header: string }[] = [
  { key: "first_name", header: "First Name" },
  { key: "last_name", header: "Last Name" },
  { key: "contact_name", header: "Full Name" },
  { key: "title", header: "Title" },
  { key: "company_name", header: "Company" },
  { key: "email", header: "Email" },
  { key: "phone", header: "Phone" },
  { key: "website", header: "Website" },
  { key: "linkedin_url", header: "LinkedIn" },
  { key: "location", header: "Location" },
  { key: "industry", header: "Industry" },
  { key: "status", header: "Status" },
  { key: "score", header: "Score" },
  { key: "tags", header: "Tags" },
  { key: "source", header: "Source" },
  { key: "source_url", header: "Source URL" },
];

const esc = (v: unknown) => {
  let s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function leadsToCsv(leads: Lead[]): string {
  const rows = leads.map((l) => {
    const [first = "", ...rest] = (l.contact_name ?? "").split(" ");
    const ext: Record<string, unknown> = { ...l, first_name: first, last_name: rest.join(" ") };
    return COLUMNS.map((c) => esc(ext[c.key])).join(",");
  });
  return [COLUMNS.map((c) => c.header).join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- Outreach-tool export formats ---------- */
type Col = [header: string, get: (l: Lead, first: string, last: string) => unknown];
const split = (name: string | null) => {
  const [first = "", ...rest] = (name ?? "").trim().split(/\s+/);
  return [first, rest.join(" ")] as const;
};

export const EXPORT_FORMATS: Record<string, { label: string; columns: Col[] }> = {
  generic: { label: "LeadForge (all fields)", columns: [] },
  instantly: {
    label: "Instantly",
    columns: [
      ["email", (l) => l.email], ["first_name", (_l, f) => f], ["last_name", (_l, _f, s) => s], ["company_name", (l) => l.company_name],
      ["phone", (l) => l.phone], ["website", (l) => l.website ?? l.domain], ["personalization", (l) => l.description],
    ],
  },
  lemlist: {
    label: "lemlist",
    columns: [
      ["email", (l) => l.email], ["firstName", (_l, f) => f], ["lastName", (_l, _f, s) => s], ["companyName", (l) => l.company_name],
      ["phone", (l) => l.phone], ["linkedinUrl", (l) => l.linkedin_url], ["companyDomain", (l) => l.domain], ["jobTitle", (l) => l.title],
    ],
  },
  hubspot: {
    label: "HubSpot",
    columns: [
      ["First Name", (_l, f) => f], ["Last Name", (_l, _f, s) => s], ["Email", (l) => l.email], ["Phone Number", (l) => l.phone],
      ["Company Name", (l) => l.company_name], ["Website URL", (l) => l.website ?? l.domain], ["Job Title", (l) => l.title],
      ["City", (l) => l.location], ["Industry", (l) => l.industry], ["Lead Status", (l) => l.status.toUpperCase()],
    ],
  },
  apollo: {
    label: "Apollo",
    columns: [
      ["First Name", (_l, f) => f], ["Last Name", (_l, _f, s) => s], ["Title", (l) => l.title], ["Company", (l) => l.company_name],
      ["Email", (l) => l.email], ["Corporate Phone", (l) => l.phone], ["Website", (l) => l.website ?? l.domain],
      ["Person Linkedin Url", (l) => l.linkedin_url], ["City", (l) => l.location],
    ],
  },
};

export function leadsToFormat(leads: Lead[], format: keyof typeof EXPORT_FORMATS): string {
  if (format === "generic") return leadsToCsv(leads);
  const cols = EXPORT_FORMATS[format].columns;
  const rows = leads.map((l) => {
    const [f, s] = split(l.contact_name);
    return cols.map(([, get]) => esc(get(l, f, s))).join(",");
  });
  return [cols.map(([h]) => h).join(","), ...rows].join("\n");
}
