import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Trash2, UserMinus, Users2, Mail, Phone, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCampaign, useCampaignLeads } from "@/hooks/useData";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/fields";
import { TableSkeleton, Skeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, LeadStatusBadge, PageHeader, ScorePill } from "@/components/ui/misc";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { downloadCsv, EXPORT_FORMATS, leadsToFormat } from "@/lib/csv";
import { cn, fmt } from "@/lib/utils";
import type { CampaignStatus } from "@/lib/types";

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: c, isLoading } = useCampaign(id);
  const { data: leads, isLoading: leadsLoading } = useCampaignLeads(id);
  const [format, setFormat] = useState<keyof typeof EXPORT_FORMATS>("instantly");
  const [requireEmail, setRequireEmail] = useState(true);
  const [excludeNotFit, setExcludeNotFit] = useState(true);
  const [markContacted, setMarkContacted] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportable = useMemo(() => (leads ?? []).filter((l) => (!requireEmail || l.email) && (!excludeNotFit || l.status !== "not_a_fit")), [leads, requireEmail, excludeNotFit]);
  const stats = useMemo(() => ({
    total: leads?.length ?? 0,
    email: leads?.filter((l) => l.email).length ?? 0,
    phone: leads?.filter((l) => l.phone).length ?? 0,
    contacted: leads?.filter((l) => l.status !== "new").length ?? 0,
  }), [leads]);

  const setStatus = async (status: CampaignStatus) => {
    const { error } = await supabase.from("campaigns").update({ status }).eq("id", id!);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["campaign", id] });
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const remove = async (leadId: string) => {
    await supabase.from("campaign_leads").delete().eq("campaign_id", id!).eq("lead_id", leadId);
    qc.invalidateQueries({ queryKey: ["campaign-leads", id] });
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const doExport = async () => {
    if (!exportable.length) return toast.error("No leads match the export rules");
    downloadCsv(`${c!.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${format}.csv`, leadsToFormat(exportable, format));
    if (markContacted) {
      const ids = exportable.filter((l) => l.status === "new").map((l) => l.id);
      if (ids.length) {
        await supabase.from("leads").update({ status: "contacted", last_contacted_at: new Date().toISOString() }).in("id", ids);
        qc.invalidateQueries({ queryKey: ["campaign-leads", id] });
        qc.invalidateQueries({ queryKey: ["leads"] });
      }
    }
    toast.success(`Exported ${exportable.length} leads for ${EXPORT_FORMATS[format].label}`);
  };

  const deleteCampaign = async () => {
    const { error } = await supabase.from("campaigns").delete().eq("id", id!);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    navigate("/app/campaigns");
  };

  if (isLoading || !c) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64 w-full rounded-2xl" /></div>;

  return (
    <>
      <PageHeader title={c.name} description={c.description ?? `${c.channel} campaign`}
        actions={<>
          <Select className="w-36" value={c.status} onChange={(e) => setStatus(e.target.value as CampaignStatus)} aria-label="Campaign status">
            <option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete campaign"><Trash2 className="h-4 w-4" /></Button>
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {([["Leads", stats.total, Users2], ["With email", stats.email, Mail], ["With phone", stats.phone, Phone], ["Worked", stats.contacted, CheckCircle2]] as const).map(([l, v, I]) => (
          <Card key={l} className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground">{l}<I className="h-4 w-4" /></div><div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(v)}</div></Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader><CardTitle>Leads in campaign</CardTitle><Link to="/app/leads" className="text-xs text-primary hover:underline">+ Add from Leads</Link></CardHeader>
          {leadsLoading ? <TableSkeleton rows={5} cols={4} /> : !leads?.length ? (
            <EmptyState icon={<Users2 className="h-5 w-5" />} title="No leads attached" description="Go to Leads, select rows and choose “Campaign” to attach them here."
              action={<Link to="/app/leads"><Button size="sm">Browse leads</Button></Link>} />
          ) : (
            <div className="divide-y divide-border/50">
              {leads.map((l) => (
                <div key={l.id} className="group flex cursor-pointer items-center gap-4 px-5 py-3 transition hover:bg-surface-2/50" onClick={() => setOpenLead(l.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.contact_name || l.company_name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{l.email || l.phone || l.domain}</div>
                  </div>
                  <div className="hidden sm:block"><ScorePill score={l.score} /></div>
                  <LeadStatusBadge status={l.status} />
                  <button onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="text-muted-foreground opacity-0 transition hover:text-danger group-hover:opacity-100" aria-label="Remove from campaign" title="Remove from campaign"><UserMinus className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader><CardTitle>Export outreach list</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Field label="Format"><Select value={format} onChange={(e) => setFormat(e.target.value as keyof typeof EXPORT_FORMATS)}>
              {Object.entries(EXPORT_FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select></Field>
            {([["Only leads with an email", requireEmail, setRequireEmail], ["Exclude “Not a fit”", excludeNotFit, setExcludeNotFit], ["Mark exported “New” leads as Contacted", markContacted, setMarkContacted]] as const).map(([label, val, set]) => (
              <label key={label} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <button type="button" role="switch" aria-checked={val} onClick={() => set(!val)}
                  className={cn("relative h-5 w-9 shrink-0 rounded-full transition", val ? "bg-primary" : "bg-muted")}>
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", val ? "left-[18px]" : "left-0.5")} />
                </button>
              </label>
            ))}
            <Button className="w-full" onClick={doExport}><Download className="h-4 w-4" />Export {exportable.length} leads</Button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">Make sure your outreach complies with GDPR / CAN-SPAM: include an opt-out and only contact businesses with a legitimate interest.</p>
          </CardBody>
        </Card>
      </div>

      <LeadDrawer leadId={openLead} onClose={() => { setOpenLead(null); qc.invalidateQueries({ queryKey: ["campaign-leads", id] }); }} />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete campaign?"
        footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={deleteCampaign}>Delete</Button></>}>
        <p className="text-sm text-muted-foreground">The campaign is removed; the leads stay in your CRM.</p>
      </Modal>
    </>
  );
}
