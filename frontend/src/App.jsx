import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { useTheme } from "@/hooks/useTheme";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const FacultyPage = lazy(() => import("@/pages/FacultyPage"));
const SubjectsPage = lazy(() => import("@/pages/SubjectsPage"));
const DivisionsPage = lazy(() => import("@/pages/DivisionsPage"));
const GeneratePage = lazy(() => import("@/pages/GeneratePage"));
const TimetablePage = lazy(() => import("@/pages/TimetablePage"));
const InfrastructurePage = lazy(() => import("@/pages/InfrastructurePage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const ConflictsPage = lazy(() => import("@/pages/ConflictsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const PublishedPage = lazy(() => import("@/pages/PublishedPage"));
const SearchPage = lazy(() => import("@/pages/SearchPage"));
const SharePage = lazy(() => import("@/pages/SharePage"));

export default function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <AppLayout theme={theme} onToggleTheme={toggleTheme}>
      <Suspense fallback={<div className="rounded-lg border bg-card p-4 text-sm">Loading page...</div>}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/faculty" element={<FacultyPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/divisions" element={<DivisionsPage />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/infrastructure" element={<InfrastructurePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/conflicts" element={<ConflictsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/published" element={<PublishedPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/share" element={<SharePage />} />
          <Route path="/share/:generationId" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}
