import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, BookOpen, Layers, Calendar, Zap, Upload, Settings, BarChart3, CheckCircle2, Circle, LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { fetchDashboard } from "@/api/dashboard";

const STAT_KEYS = [
  { key: "faculty", label: "Total Faculty", icon: Users },
  { key: "subjects", label: "Total Subjects", icon: BookOpen },
  { key: "divisions", label: "Total Divisions", icon: Layers },
  { key: "timetables", label: "Generated Timetables", icon: Calendar },
];

const QUICK_ACTIONS = [
  { label: "Add Faculty", description: "Add faculty members and their schedules", icon: Users, to: "/faculty" },
  { label: "Import Data", description: "Bulk import faculty, subjects, or divisions", icon: Upload, to: "/faculty" },
  { label: "Generate Timetable", description: "Run the scheduling algorithm", icon: Zap, to: "/generate" },
  { label: "View Reports", description: "Analyse schedule stats and utilization", icon: BarChart3, to: "/reports" },
];

const CHECKLIST_STEPS = [
  { key: "faculty", label: "Add faculty", link: "/faculty" },
  { key: "subjects", label: "Add subjects", link: "/subjects" },
  { key: "divisions", label: "Add divisions", link: "/divisions" },
  { key: "timetables", label: "Generate timetable", link: "/generate" },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ faculty: 0, subjects: 0, divisions: 0, timetables: 0, latest_generation_id: null });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboard()
      .then((res) => {
        setStats(res.data || stats);
        setIsLoading(false);
      })
      .catch(() => {
        setError("Dashboard data is temporarily unavailable. Please refresh in a moment.");
        setIsLoading(false);
      });
  }, []);

  const completedSteps = CHECKLIST_STEPS.filter((s) => stats[s.key] > 0).length;
  const allComplete = completedSteps === CHECKLIST_STEPS.length;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {/* Stat cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAT_KEYS.map(({ key, label, icon: Icon }, index) => {
          const count = stats[key] ?? 0;
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  {!isLoading && (
                    count > 0 ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">Active</span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Empty</span>
                    )
                  )}
                </div>
                {isLoading ? (
                  <div className="mt-3 mb-1 h-8 w-16 animate-pulse rounded-md bg-muted" style={{ animationDelay: `${index * 100}ms` }} />
                ) : (
                  <CardTitle className="mt-2 text-3xl font-bold">{count}</CardTitle>
                )}
                <CardDescription>{label}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="mb-3 text-base font-semibold">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map(({ label, description, icon: Icon, to }) => (
            <button
              key={label}
              type="button"
              onClick={() => navigate(to)}
              className="group flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
              </div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Onboarding Checklist */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Checklist</CardTitle>
            <CardDescription>{completedSteps} of {CHECKLIST_STEPS.length} steps complete</CardDescription>
            {/* Progress bar */}
            <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(completedSteps / CHECKLIST_STEPS.length) * 100}%` }}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {allComplete && (
              <div className="mb-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-300 font-medium">
                🎉 Your timetable system is fully set up
              </div>
            )}
            {CHECKLIST_STEPS.map(({ key, label, link }) => {
              const done = stats[key] > 0;
              return (
                <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{label}</span>
                  </div>
                  {!done && (
                    <button type="button" onClick={() => navigate(link)} className="text-xs font-medium text-primary hover:underline">
                      Go →
                    </button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      {/* Empty state when no timetables */}
      {stats.timetables === 0 && (
        <EmptyState
          icon={LayoutDashboard}
          title="Ready to generate your first timetable"
          description="Add faculty, subjects, and divisions — then generate your schedule."
          action={{ label: "Get Started", onClick: () => navigate("/generate") }}
        />
      )}
    </div>
  );
}
