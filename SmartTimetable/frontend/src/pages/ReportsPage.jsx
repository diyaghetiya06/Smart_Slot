import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchReports } from "@/api/reports";

export default function ReportsPage() {
  const [generationId, setGenerationId] = useState("");
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState("");

  const load = async (id = "") => {
    try {
      const res = await fetchReports(id);
      setReport(res.data || null);
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Unable to load reports right now.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = (event) => {
    event.preventDefault();
    load(generationId.trim());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Reports</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={onSubmit}>
            <div className="w-full md:max-w-sm">
              <Label htmlFor="rep_gen">Generation Id</Label>
              <Input id="rep_gen" value={generationId} onChange={(e) => setGenerationId(e.target.value)} placeholder="Leave blank for latest" />
            </div>
            <Button type="submit">Load Report</Button>
          </form>
          {status && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{status}</p>}
        </CardContent>
      </Card>

      {report && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader><CardTitle>{report.total_lectures}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Total Lectures</CardContent></Card>
            <Card><CardHeader><CardTitle>{report.faculty_utilization}%</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Faculty Utilization</CardContent></Card>
            <Card><CardHeader><CardTitle>{report.student_free_slots}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Student Free Slots</CardContent></Card>
            <Card><CardHeader><CardTitle>{report.peak_day || "-"}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Peak Day</CardContent></Card>
          </section>

          <Card>
            <CardHeader><CardTitle>Day Distribution</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Day</th><th className="p-2">Lectures</th></tr></thead>
                  <tbody>
                    {Object.entries(report.day_counts || {}).map(([day, count]) => (
                      <tr key={day} className="border-b"><td className="p-2">{day}</td><td className="p-2">{count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
