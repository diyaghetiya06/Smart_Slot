import { Link, useLocation } from "react-router-dom";
import { Moon, Sun, Menu, Bell } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { fetchConflicts } from "@/api/conflicts";

const routePrefetchers = {
  "/": () => import("@/pages/DashboardPage"),
  "/faculty": () => import("@/pages/FacultyPage"),
  "/subjects": () => import("@/pages/SubjectsPage"),
  "/divisions": () => import("@/pages/DivisionsPage"),
  "/generate": () => import("@/pages/GeneratePage"),
  "/timetable": () => import("@/pages/TimetablePage"),
  "/infrastructure": () => import("@/pages/InfrastructurePage"),
  "/reports": () => import("@/pages/ReportsPage"),
  "/conflicts": () => import("@/pages/ConflictsPage"),
  "/settings": () => import("@/pages/SettingsPage"),
  "/profile": () => import("@/pages/ProfilePage"),
  "/published": () => import("@/pages/PublishedPage"),
  "/search": () => import("@/pages/SearchPage"),
  "/share": () => import("@/pages/SharePage"),
};

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Faculty Management", to: "/faculty" },
  { label: "Subject Management", to: "/subjects" },
  { label: "Division Management", to: "/divisions" },
  { label: "Generate Timetable", to: "/generate" },
  { label: "View Timetable", to: "/timetable" },
  { label: "Infrastructure", to: "/infrastructure" },
  { label: "Reports", to: "/reports" },
  { label: "Conflict Hub", to: "/conflicts" },
  { label: "Settings", to: "/settings" },
  { label: "Profile", to: "/profile" },
  { label: "Published", to: "/published" },
  { label: "Search", to: "/search" },
  { label: "Share", to: "/share" },
];

export default function AppLayout({ children, theme, onToggleTheme }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const { user } = useAuth();
  const [hasConflicts, setHasConflicts] = useState(false);

  useEffect(() => {
    if (user) {
      fetchConflicts()
        .then((res) => setHasConflicts(!!res.data?.has_conflict))
        .catch(() => {});
    }
  }, [user]);

  const prefetchRoute = (path) => {
    const prefetch = routePrefetchers[path];
    if (prefetch) {
      prefetch();
    }
  };

  return (
    <div className="page-shell min-h-screen p-4">
      <div className="mx-auto flex max-w-[1400px] gap-4">
        <aside
          className={cn(
            "fixed inset-y-4 left-4 z-40 w-[280px] rounded-xl border bg-card/95 p-4 shadow-xl backdrop-blur-md lg:static lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-[120%]",
            "transition-transform duration-200"
          )}
        >
          <h1 className="text-xl font-bold">SmartTimetable</h1>
          <p className="mb-4 text-sm text-muted-foreground">Automated Scheduler</p>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                onMouseEnter={() => prefetchRoute(item.to)}
                onFocus={() => prefetchRoute(item.to)}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm transition hover:bg-muted",
                  location.pathname === item.to ? "bg-muted font-medium" : "text-muted-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

        <main className="w-full lg:ml-0">
          <header className="mb-4 flex items-center justify-between rounded-xl border bg-card/90 p-3 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setOpen((v) => !v)}>
                <Menu className="h-4 w-4" />
              </Button>
              <h2 className="text-base font-semibold">{user?.institute || "Smart Timetable"}</h2>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/conflicts">
                <Button variant="outline" size="sm" className="relative group" aria-label="Notifications">
                  <Bell className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  {hasConflicts && (
                    <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-destructive" />
                  )}
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={onToggleTheme} aria-label="Toggle Theme">
                {theme === "dark" ? <Sun className="h-4 w-4 text-yellow-500" /> : <Moon className="h-4 w-4 text-slate-700" />}
              </Button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" title={user?.full_name || "User Avatar"}>
                {user?.full_name?.charAt(0)?.toUpperCase() || "A"}
              </div>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
