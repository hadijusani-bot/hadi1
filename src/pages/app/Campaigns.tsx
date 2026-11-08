import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone, Plus, Mail, Linkedin, Phone, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCampaigns } from "@/hooks/useData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal } from "@/components/ui/overlay";
import { CampaignStatusBadge, EmptyState, PageHeader } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";

export const CHANNEL_ICON: Record<string, typeof Mail> = { email: Mail, linkedin: Linkedin, phone: Phone, multi: Layers };

export default function Campaigns() {
  const { data, isLoading } = useCampaigns();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Campaigns" description="Group leads for outreach and export lists for your sending tool."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New campaign</Button>} />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : !data?.length ? (
        <Card><EmptyState icon={<Megaphone className="h-5 w-5" />} title="No campaigns yet" description="Create a campaign, then add leads from the Leads page with bulk select."
          action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Create campaign</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c, i) => {
            const Icon = CHANNEL_ICON[c.channel] ?? Mail;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Link to={`/app/campaigns/${c.id}`}>
                  <Card className="h-full p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-glow">
                    <div className="flex items-start justify-between">
                      <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <h3 className="mt-4 truncate font-semibold">{c.name}</h3>
                    <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{c.description || "No description"}</p>
                    <div className="mt-4 flex justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{c.campaign_leads?.[0]?.count ?? 0} leads</span><span>Created {timeAgo(c.created_at)}</span>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
      <NewCampaignModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NewCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", description: "", channel: "email" });
  const [saving, setSaving] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim()) return toast.error("Name your campaign");
    setSaving(true);
    const { data, error } = await supabase.from("campaigns").insert({ ...f, name: f.name.trim(), owner_id: user!.id }).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    onClose();
    navigate(`/app/campaigns/${data.id}`);
  };
  return (
    <Modal open={open} onClose={onClose} title="New campaign"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={() => submit()}>Create</Button></>}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><Input autoFocus placeholder="Austin dentists — cold email #1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Channel"><Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
          <option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="phone">Phone</option><option value="multi">Multi-channel</option>
        </Select></Field>
        <Field label="Description"><Textarea rows={3} placeholder="Offer, angle, ICP…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
