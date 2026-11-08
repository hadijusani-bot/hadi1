import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAddLeadsToCampaign, useCampaigns } from "@/hooks/useData";
import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignStatusBadge } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function AddToCampaignModal({ open, onClose, leadIds, onDone }: { open: boolean; onClose: () => void; leadIds: string[]; onDone?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: campaigns, isLoading } = useCampaigns();
  const add = useAddLeadsToCampaign();
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const submit = async () => {
    let campaignId = selected;
    if (!campaignId && newName.trim()) {
      const { data, error } = await supabase.from("campaigns").insert({ name: newName.trim(), owner_id: user!.id }).select().single();
      if (error) return toast.error(error.message);
      campaignId = data.id;
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    }
    if (!campaignId) return toast.error("Pick a campaign or name a new one");
    await add.mutateAsync({ campaignId, leadIds });
    toast.success(`Added ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} to campaign`);
    setSelected(null); setNewName("");
    onDone?.();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} to campaign`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={add.isPending}>Add to campaign</Button></>}>
      <div className="space-y-2">
        {isLoading ? <Skeleton className="h-12 w-full" /> : campaigns?.map((c) => (
          <button key={c.id} onClick={() => { setSelected(c.id); setNewName(""); }}
            className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition", selected === c.id ? "border-primary/50 bg-primary/10" : "border-border hover:bg-surface-2")}>
            <Megaphone className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.campaign_leads?.[0]?.count ?? 0} leads · {c.channel}</div></div>
            <CampaignStatusBadge status={c.status} />
          </button>
        ))}
        <div className="flex items-center gap-2 pt-2">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="…or create a new campaign" value={newName} onChange={(e) => { setNewName(e.target.value); setSelected(null); }} />
        </div>
      </div>
    </Modal>
  );
}
