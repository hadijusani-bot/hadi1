import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex w-64 flex-col gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin, profile, loading } = useAuth();
  if (loading || !profile) return <FullScreenLoader />;
  if (!isAdmin) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
