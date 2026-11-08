import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/fields";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { profile, user, refreshProfile } = useAuth();
  const { theme, toggle } = useTheme();
  const [f, setF] = useState({ full_name: "", company: "" });
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (profile) setF({ full_name: profile.full_name ?? "", company: profile.company ?? "" }); }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: f.full_name.trim() || null, company: f.company.trim() || null }).eq("id", user!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    toast.success("Profile saved");
  };

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    setPw("");
    toast.success("Password updated");
  };

  return (
    <>
      <PageHeader title="Settings" description="Your profile and preferences." />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
              <Field label="Company"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
              <Field label="Email" className="sm:col-span-2"><Input value={user?.email ?? ""} disabled /></Field>
              <div className="sm:col-span-2"><Button type="submit" loading={saving}>Save profile</Button></div>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {(["dark", "light"] as const).map((t) => (
              <button key={t} onClick={() => theme !== t && toggle()}
                className={cn("flex items-center gap-3 rounded-xl border p-4 text-left transition", theme === t ? "border-primary/50 bg-primary/10" : "border-border hover:bg-surface-2")}>
                {t === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <div><div className="text-sm font-medium capitalize">{t}</div><div className="text-xs text-muted-foreground">{t === "dark" ? "Default — easy on the eyes" : "High-contrast for bright rooms"}</div></div>
              </button>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Password</CardTitle></CardHeader>
          <CardBody>
            <form onSubmit={changePw} className="flex flex-col gap-2 sm:flex-row">
              <Input type="password" placeholder="New password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <Button type="submit" variant="secondary">Update</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
