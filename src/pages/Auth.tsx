import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Lock, User, AlertTriangle } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Logo, ThemeToggle } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r border-border/50 bg-surface/30 lg:block">
        <div className="bg-grid absolute inset-0" />
        <div className="glow-orb left-10 top-20 h-96 w-96" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo />
          <div className="max-w-md">
            <p className="text-3xl font-semibold leading-tight tracking-tight">
              Turn websites and structured sources into a <span className="text-gradient">clean, outreach-ready</span> lead list.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
              <li>• Firecrawl pipelines crawl sites and extract contacts with AI</li>
              <li>• Apify pipelines run any Actor and ingest its dataset</li>
              <li>• Deduped, scored leads with notes, tasks and campaigns</li>
            </ul>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["Sources", "Firecrawl · Apify"], ["Exports", "CSV · Instantly · HubSpot"], ["Keys", "Server-side only"]].map(([l, v]) => (
              <div key={l} className="glass rounded-xl p-4"><div className="text-sm font-semibold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end"><Logo className="lg:hidden" /><ThemeToggle /></div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          {!isSupabaseConfigured && (
            <div className="mt-6 flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Lovable Cloud isn't connected yet — enable Cloud in your Lovable project so auth works.
            </div>
          )}
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>
  );
}

function IconInput({ icon, ...props }: { icon: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
      <Input className="pl-9" {...props} />
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate((location.state as { from?: string } | null)?.from ?? "/app", { replace: true });
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your LeadForge workspace."
      footer={<>No account? <Link to="/signup" className="font-medium text-primary hover:underline">Create one</Link></>}>
      <form onSubmit={submit} className="space-y-3">
        <IconInput icon={<Mail className="h-4 w-4" />} type="email" placeholder="you@company.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <IconInput icon={<Lock className="h-4 w-4" />} type="password" placeholder="Password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex justify-end"><Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">Forgot password?</Link></div>
        <Button type="submit" className="w-full" loading={loading}>Log in</Button>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error("Password must be at least 8 characters");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name }, emailRedirectTo: `${window.location.origin}/app` },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) navigate("/app", { replace: true });
    else toast.success("Check your inbox to confirm your email.");
  };

  return (
    <AuthShell title="Create your account" subtitle="Start running lead pipelines in minutes."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></>}>
      <form onSubmit={submit} className="space-y-3">
        <IconInput icon={<User className="h-4 w-4" />} placeholder="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <IconInput icon={<Mail className="h-4 w-4" />} type="email" placeholder="you@company.com" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <IconInput icon={<Lock className="h-4 w-4" />} type="password" placeholder="Password (8+ characters)" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" className="w-full" loading={loading}>Create account</Button>
        <p className="text-center text-[11px] text-muted-foreground">The first account created becomes the workspace admin.</p>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("If that email exists, a reset link is on its way.");
  };
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure link."
      footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to login</Link>}>
      <form onSubmit={submit} className="space-y-3">
        <IconInput icon={<Mail className="h-4 w-4" />} type="email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" className="w-full" loading={loading}>Send reset link</Button>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate("/app", { replace: true });
  };
  return (
    <AuthShell title="Choose a new password" subtitle="Make it at least 8 characters."
      footer={<Link to="/login" className="font-medium text-primary hover:underline">Back to login</Link>}>
      <form onSubmit={submit} className="space-y-3">
        <IconInput icon={<Lock className="h-4 w-4" />} type="password" placeholder="New password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" loading={loading}>Update password</Button>
      </form>
    </AuthShell>
  );
}
