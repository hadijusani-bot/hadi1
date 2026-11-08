import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard, Workflow, Users2, Megaphone, ShieldCheck, Settings, LogOut, Menu, X, Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Logo, ThemeToggle } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn, initials } from "@/lib/utils";
import { PageTransition } from "./PageTransition";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/pipelines", label: "Pipelines", icon: Workflow },
  { to: "/app/leads", label: "Leads", icon: Users2 },
  { to: "/app/campaigns", label: "Campaigns", icon: Megaphone },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useAuth();
  const items = [...NAV, ...(isAdmin ? [{ to: "/app/admin", label: "Admin", icon: ShieldCheck }] : []), { to: "/app/settings", label: "Settings", icon: Settings }];
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate}
          className={({ isActive }) => cn(
            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            isActive ? "text-foreground" : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground",
          )}>
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg border border-primary/25 bg-primary/10"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              <Icon className={cn("relative h-4 w-4", isActive && "text-primary")} />
              <span className="relative">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function UserCard() {
  const { profile, user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const name = profile?.full_name || user?.email;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface-2/50 p-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/80 to-accent/80 text-xs font-semibold text-primary-foreground">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{isAdmin ? "Admin" : "Member"}</div>
      </div>
      <button aria-label="Sign out" title="Sign out" onClick={async () => { await signOut(); navigate("/"); }}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-surface hover:text-danger">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none fixed inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <div className="glow-orb -top-40 left-1/3 h-96 w-96 opacity-60" />

      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border/60 bg-surface/40 p-4 backdrop-blur-xl lg:flex">
        <Logo to="/app" className="px-2 py-1.5" />
        <Button className="mt-6 w-full" onClick={() => navigate("/app/pipelines/new")}><Plus className="h-4 w-4" />New pipeline</Button>
        <div className="mt-6 flex-1"><NavItems /></div>
        <UserCard />
      </aside>

      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl lg:pl-64">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button className="rounded-md p-1.5 hover:bg-surface-2" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <Logo to="/app" />
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success))]" /> All systems operational
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile nav */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside className="glass absolute inset-y-0 left-0 flex w-72 flex-col rounded-none p-4"
              initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
              <div className="flex items-center justify-between"><Logo to="/app" /><button onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
              <div className="mt-6 flex-1"><NavItems onNavigate={() => setMobileOpen(false)} /></div>
              <UserCard />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <main className="relative lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <PageTransition key={location.pathname}><Outlet /></PageTransition>
        </div>
      </main>
    </div>
  );
}
