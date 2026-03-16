import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fetchDashboard } from "@/api/dashboard";

const statKeys = [
  { key: "faculty", label: "Total Faculty" },
  { key: "subjects", label: "Total Subjects" },
  { key: "divisions", label: "Total Divisions" },
  { key: "timetables", label: "Generated Timetables" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState({ faculty: 0, subjects: 0, divisions: 0, timetables: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard()
      .then((res) => setStats(res.data || stats))
      .catch(() => setError("Dashboard data is temporarily unavailable. Please refresh in a moment."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Generate conflict-free timetables faster</CardTitle>
          <CardDescription>Modern React + shadcn UI migration is now active.</CardDescription>
        </CardHeader>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statKeys.map((item) => (
          <Card key={item.key}>
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle>{stats[item.key]}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Live data from backend API.</CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
