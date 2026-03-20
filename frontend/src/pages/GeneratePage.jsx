import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fetchGenerateOptions, generateTimetable, fetchGenerateStatus } from "@/api/generate";

export default function GeneratePage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({ semester_type: "odd", default_program: "UG" });
  const [divisions, setDivisions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [semesterType, setSemesterType] = useState("odd");
  const [program, setProgram] = useState("UG");
  const [status, setStatus] = useState("");

  // Async job polling state
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [pollStatus, setPollStatus] = useState(""); // queued | running | done | failed
  const pollRef = useRef(null);

  useEffect(() => {
    fetchGenerateOptions()
      .then((res) => {
        const s = res.data?.settings || { semester_type: "odd", default_program: "UG" };
        setSettings(s);
        setSemesterType(s.semester_type || "odd");
        setProgram(s.default_program || "UG");
        setDivisions(res.data?.divisions || []);
      })
      .catch(() => setStatus("Unable to load generation options right now."));
  }, []);

  // Cleanup polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  const filteredDivisions = useMemo(
    () =>
      divisions.filter((item) => {
        const sem = Number(item.semester || 0);
        const parityMatch = semesterType === "odd" ? sem % 2 === 1 : sem % 2 === 0;
        return parityMatch && String(item.program).toUpperCase() === String(program).toUpperCase();
      }),
    [divisions, semesterType, program]
  );

  const toggleSelect = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );

  const selectAllVisible = () => {
    const ids = filteredDivisions.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const startPolling = useCallback((jid) => {
    setPolling(true);
    setPollStatus("queued");
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchGenerateStatus(jid);
        const s = res.data?.status || "queued";
        setPollStatus(s);
        if (s === "done") {
          clearInterval(pollRef.current);
          setPolling(false);
          setSaving(false);
          const genId = res.data?.generation_id;
          if (genId) navigate(`/timetable?generation_id=${encodeURIComponent(genId)}`);
          else setStatus("Generation complete but no generation ID was returned.");
        } else if (s === "failed") {
          clearInterval(pollRef.current);
          setPolling(false);
          setSaving(false);
          setStatus(res.data?.error || "Generation job failed.");
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setPolling(false);
        setSaving(false);
        setStatus(err.message || "Lost contact with server during generation.");
      }
    }, 2000); // poll every 2 seconds
  }, [navigate]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    setJobId(null);
    setPollStatus("");

    try {
      const res = await generateTimetable({
        semester_type: semesterType,
        program,
        division_ids: selectedIds,
      });
      const isAsync = res.data?.async;
      const jid = res.data?.job_id;

      if (isAsync && jid) {
        // Background job — start polling
        setJobId(jid);
        startPolling(jid);
      } else {
        // Synchronous — navigate immediately
        const genId = res.data?.generation_id;
        setSaving(false);
        if (!genId) throw new Error("Generation completed but no generation id was returned.");
        navigate(`/timetable?generation_id=${encodeURIComponent(genId)}`);
      }
    } catch (error) {
      setStatus(error.message || "Unable to generate timetable right now.");
      setSaving(false);
    }
  };

  const pollLabel = { queued: "Queued…", running: "Running…", done: "Done!", failed: "Failed" }[pollStatus] || "Processing…";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Generate Timetable</CardTitle>
          <CardDescription>
            Run timetable generation with database-backed rules and constraints.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Configuration</CardTitle></CardHeader>
        <CardContent>
          {status && (
            <p className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="h-4 w-4 shrink-0" /> {status}
            </p>
          )}

          {/* Async job progress indicator */}
          {polling && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted px-4 py-3 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-medium">{pollLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {jobId ? `Job ID: ${jobId}` : "Processing timetable…"}
                </p>
              </div>
              {/* Animated progress bar */}
              <div className="ml-auto h-2 w-32 overflow-hidden rounded-full bg-background">
                <div className="h-full animate-pulse rounded-full bg-primary" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="semester_type">Semester Type</Label>
                <select
                  id="semester_type"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={semesterType}
                  onChange={(e) => setSemesterType(e.target.value)}
                >
                  <option value="odd">Odd (1,3,5,7)</option>
                  <option value="even">Even (2,4,6,8)</option>
                </select>
              </div>
              <div>
                <Label htmlFor="program">Program</Label>
                <select
                  id="program"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                >
                  <option value="UG">UG</option>
                  <option value="PG">PG</option>
                </select>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Target Divisions</Label>
                <Button type="button" variant="outline" size="sm" onClick={selectAllVisible}>
                  Select / Deselect Visible
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {filteredDivisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No divisions match the selected filters.</p>
                ) : (
                  filteredDivisions.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                      <span>
                        Sem {item.semester} — {item.name} ({item.program})
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                If no division is selected, all matching divisions will be used.
              </p>
            </div>

            <Button type="submit" disabled={saving || polling}>
              {saving || polling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {polling ? pollLabel : "Starting…"}
                </>
              ) : (
                "Generate Timetable"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
