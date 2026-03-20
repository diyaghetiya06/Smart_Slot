import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppLayout from "@/components/layout/AppLayout";
import { useTheme } from "@/hooks/useTheme";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

// ─── Page imports ─────────────────────────────────────────────────────────────
const DashboardPage   = lazy(() => import("@/pages/DashboardPage"));
const FacultyPage     = lazy(() => import("@/pages/FacultyPage"));
const SubjectsPage    = lazy(() => import("@/pages/SubjectsPage"));
const DivisionsPage   = lazy(() => import("@/pages/DivisionsPage"));
const GeneratePage    = lazy(() => import("@/pages/GeneratePage"));
const TimetablePage   = lazy(() => import("@/pages/TimetablePage"));
const InfrastructurePage = lazy(() => import("@/pages/InfrastructurePage"));
const ReportsPage     = lazy(() => import("@/pages/ReportsPage"));
const ConflictsPage   = lazy(() => import("@/pages/ConflictsPage"));
const SettingsPage    = lazy(() => import("@/pages/SettingsPage"));
const ProfilePage     = lazy(() => import("@/pages/ProfilePage"));
const PublishedPage   = lazy(() => import("@/pages/PublishedPage"));
const SearchPage      = lazy(() => import("@/pages/SearchPage"));
const SharePage       = lazy(() => import("@/pages/SharePage"));
const LoginPage       = lazy(() => import("@/pages/LoginPage"));
const RegisterPage    = lazy(() => import("@/pages/RegisterPage"));
const LandingPage     = lazy(() => import("@/pages/LandingPage"));
const NotFoundPage    = lazy(() => import("@/pages/NotFoundPage"));


// ─── React Query client ───────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 s before refetch
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// ─── Protected route: redirects to /login when not authenticated ──────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// ─── Inner app (has access to AuthContext) ────────────────────────────────────
function AppInner() {
  const { theme, toggleTheme } = useTheme();
  const fallback = <LoadingSkeleton className="mt-4" />;

  return (
    <ErrorBoundary>
      <Suspense fallback={fallback}>
        <Routes>
          {/* ── Public routes ── */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/welcome"  element={<LandingPage />} />

          {/* ── Public share view (no auth required) ── */}
          <Route path="/share/:token" element={<SharePage />} />

          {/* ── Protected routes inside AppLayout ── */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppLayout theme={theme} onToggleTheme={toggleTheme}>
                  <ErrorBoundary>
                    <Suspense fallback={fallback}>
                      <Routes>
                        <Route path="/"              element={<DashboardPage />} />
                        <Route path="/faculty"       element={<FacultyPage />} />
                        <Route path="/subjects"      element={<SubjectsPage />} />
                        <Route path="/divisions"     element={<DivisionsPage />} />
                        <Route path="/generate"      element={<GeneratePage />} />
                        <Route path="/timetable"     element={<TimetablePage />} />
                        <Route path="/infrastructure"element={<InfrastructurePage />} />
                        <Route path="/reports"       element={<ReportsPage />} />
                        <Route path="/conflicts"     element={<ConflictsPage />} />
                        <Route path="/settings"      element={<SettingsPage />} />
                        <Route path="/profile"       element={<ProfilePage />} />
                        <Route path="/published"     element={<PublishedPage />} />
                        <Route path="/search"        element={<SearchPage />} />
                        <Route path="/share"         element={<SharePage />} />
                        <Route path="*"              element={<NotFoundPage />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </QueryClientProvider>
  );
}
