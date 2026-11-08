import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from "@/components/layout/Guards";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageTransition } from "@/components/layout/PageTransition";
import Landing from "@/pages/Landing";
import { Login, Signup, ForgotPassword, ResetPassword } from "@/pages/Auth";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/app/Dashboard";
import Pipelines from "@/pages/app/Pipelines";
import PipelineEditor from "@/pages/app/PipelineEditor";
import PipelineDetail from "@/pages/app/PipelineDetail";
import Leads from "@/pages/app/Leads";
import Campaigns from "@/pages/app/Campaigns";
import CampaignDetail from "@/pages/app/CampaignDetail";
import Settings from "@/pages/app/Settings";
import Admin from "@/pages/admin/Admin";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

function PublicRoutes() {
  const location = useLocation();
  return (
    <PageTransition key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PageTransition>
  );
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="bottom-right" richColors closeButton />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="pipelines" element={<Pipelines />} />
                <Route path="pipelines/new" element={<PipelineEditor />} />
                <Route path="pipelines/:id" element={<PipelineDetail />} />
                <Route path="pipelines/:id/edit" element={<PipelineEditor />} />
                <Route path="leads" element={<Leads />} />
                <Route path="campaigns" element={<Campaigns />} />
                <Route path="campaigns/:id" element={<CampaignDetail />} />
                <Route path="settings" element={<Settings />} />
                <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
                <Route path="*" element={<NotFound inApp />} />
              </Route>
              <Route path="/*" element={<PublicRoutes />} />
            </Routes>
          </BrowserRouter>
          <ThemedToaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
