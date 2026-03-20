import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { applyConflictFix, fetchConflicts } from "@/api/conflicts";
import { formatGenerationId } from "@/lib/utils";

export default function ConflictsPage() {
  const [generationId, setGenerationId] = useState("");
  const [conflict, setConflict] = useState(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (id = "") => {
    try {
      const res = await fetchConflicts(id);
      setConflict(res.data || null);
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Unable to load conflict data.");
    }
  };

  useEffect(() => { load(); }, []);

  const onLoad = (event) => { event.preventDefault(); load(generationId.trim()); };

  const onApplyFix = async () => {
    if (!conflict?.generation_id) { setStatus("Load a valid generation first."); return; }
    setSaving(true);
    try {
      const res = await applyConflictFix(conflict.generation_id);
      setConflict(res.data || conflict);
      setStatus("AI fix applied and conflict analysis refreshed.");
    } catch (error) {
      setStatus(error.message || "Unable to apply fix.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Conflict Hub</CardTitle>
          <CardDescription>Detect and resolve slot-level scheduling conflicts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={onLoad}>
            <div className="w-full md:max-w-sm">
              <Label htmlFor="conf_gen">Generation ID</Label>
              <Input id="conf_gen" value={generationId} onChange={(e) => setGenerationId(e.target.value)} placeholder="Leave blank for latest" />
            </div>
            <Button type="submit">Load Conflicts</Button>
          </form>
          {status && <p className="mt-3 rounded-md border border-border bg-muted p-2 text-sm">{status}</p>}
        </CardContent>
      </Card>

      {conflict && (
        !conflict.has_conflict ? (
          <Card>
            <CardContent className="p-4">
              <EmptyState
                icon={CheckCircle2}
                title="No conflicts detected"
                description="Your timetable has no slot conflicts. Everything looks good."
              />
              {conflict.generation_id && (
                <p className="text-center text-xs text-muted-foreground mt-2">{formatGenerationId(conflict.generation_id)}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Conflict Found</CardTitle>
              <CardDescription>{conflict.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{formatGenerationId(conflict.generation_id)}</p>
              {conflict.left_item && conflict.right_item && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border p-3 text-sm">
                    <p><strong>Division:</strong> {conflict.left_item.division_name}</p>
                    <p><strong>Faculty:</strong> {conflict.left_item.faculty_name}</p>
                    <p><strong>Subject:</strong> {conflict.left_item.subject_name}</p>
                    <p><strong>Slot:</strong> {conflict.left_item.day} — {conflict.left_item.time_slot}</p>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <p><strong>Division:</strong> {conflict.right_item.division_name}</p>
                    <p><strong>Faculty:</strong> {conflict.right_item.faculty_name}</p>
                    <p><strong>Subject:</strong> {conflict.right_item.subject_name}</p>
                    <p><strong>Slot:</strong> {conflict.right_item.day} — {conflict.right_item.time_slot}</p>
                  </div>
                </div>
              )}
              {Array.isArray(conflict.suggestions) && conflict.suggestions.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Suggested Alternate Slots</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Slot</th><th className="p-2">Score</th><th className="p-2">Probability</th></tr></thead>
                      <tbody>
                        {conflict.suggestions.map((item) => (
                          <tr key={item.slot} className="border-b"><td className="p-2">{item.slot}</td><td className="p-2">{item.score}</td><td className="p-2">{item.probability}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <Button type="button" onClick={onApplyFix} disabled={saving}>{saving ? "Applying..." : "Apply AI Fix"}</Button>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
