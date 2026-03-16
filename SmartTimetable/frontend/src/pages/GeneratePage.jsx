import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fetchGenerateOptions, generateTimetable } from "@/api/generate";

export default function GeneratePage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({ semester_type: "odd", default_program: "UG" });
  const [divisions, setDivisions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [semesterType, setSemesterType] = useState("odd");
  const [program, setProgram] = useState("UG");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGenerateOptions()
      .then((res) => {
        const nextSettings = res.data?.settings || { semester_type: "odd", default_program: "UG" };
        setSettings(nextSettings);
        setSemesterType(nextSettings.semester_type || "odd");
        setProgram(nextSettings.default_program || "UG");
        setDivisions(res.data?.divisions || []);
      })
      .catch(() => setStatus("Unable to load generation options right now."));
  }, []);

  const filteredDivisions = useMemo(
    () =>
      divisions.filter((item) => {
        const sem = Number(item.semester || 0);
        const parityMatch = semesterType === "odd" ? sem % 2 === 1 : sem % 2 === 0;
        return parityMatch && String(item.program).toUpperCase() === String(program).toUpperCase();
      }),
    [divisions, semesterType, program]
  );

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectAllVisible = () => {
    const ids = filteredDivisions.map((item) => item.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      const res = await generateTimetable({
        semester_type: semesterType,
        program,
        division_ids: selectedIds,
      });
      const generationId = res.data?.generation_id;
      if (!generationId) {
        throw new Error("Generation completed but no generation id was returned.");
      }
      navigate(`/timetable?generation_id=${encodeURIComponent(generationId)}`);
    } catch (error) {
      setStatus(error.message || "Unable to generate timetable right now.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Generate Timetable</CardTitle>
          <CardDescription>Run timetable generation with database-backed rules and constraints.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          {status && <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{status}</p>}
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
                  Select or Deselect Visible
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {filteredDivisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No divisions match the selected filters.</p>
                ) : (
                  filteredDivisions.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                      <span>
                        Sem {item.semester} - {item.name} ({item.program})
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                If no division is selected, all matching divisions for filters will be used.
              </p>
            </div>

            <Button type="submit" disabled={saving}>{saving ? "Generating..." : "Generate Timetable"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
