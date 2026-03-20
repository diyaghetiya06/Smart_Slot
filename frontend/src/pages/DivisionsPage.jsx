import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import FileDropZone from "@/components/ui/FileDropZone";
import ImportResultBanner from "@/components/ui/ImportResultBanner";
import { createDivision, deleteDivision, fetchDivisions, updateDivision } from "@/api/divisions";
import { importDivisions } from "@/api/import";
import { useAutoRegenerate } from "@/hooks/useAutoRegenerate";
import { formatSemester, formatProgram } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";

const initialState = { name: "", semester: "1", program: "UG" };
const CSV_TEMPLATE = `name,semester,program\nDivision A,1,UG\n`;
const JSON_TEMPLATE = JSON.stringify([{ name: "Division A", semester: 1, program: "UG" }], null, 2);

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────
function EditModal({ division, onSave, onClose }) {
  const [form, setForm] = useState({
    name: division.name,
    semester: String(division.semester),
    program: division.program,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(division.id, { ...form, semester: Number(form.semester) });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Edit Division</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <Label>Division Name</Label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <Label>Semester</Label>
            <Input
              type="number" min="1" max="8"
              value={form.semester}
              onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))}
            />
          </div>
          <div>
            <Label>Program</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.program}
              onChange={(e) => setForm((p) => ({ ...p, program: e.target.value }))}
            >
              <option value="UG">Undergraduate</option>
              <option value="PG">Postgraduate</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DivisionsPage() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const toast = useToast();

  const [divisions, setDivisions] = useState([]);
  const [form, setForm] = useState(initialState);
  const [editTarget, setEditTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const { checkAndRegenerate, regenerationResult, clearResult } = useAutoRegenerate();

  useEffect(() => {
    fetchDivisions()
      .then((res) => setDivisions(res.data || []))
      .catch(() => toast.error("Unable to load divisions. Please refresh."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) { toast.warn("Please enter a division name."); return; }
    setSaving(true);
    try {
      const res = await createDivision({ ...form, semester: Number(form.semester) });
      setDivisions(res.data || []);
      setForm(initialState);
      toast.success("Division added successfully.");
      await checkAndRegenerate("divisions");
    } catch (error) {
      toast.error(error.message || "Unable to save division.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id, data) => {
    try {
      const res = await updateDivision(id, data);
      setDivisions((prev) => prev.map((d) => (d.id === id ? { ...d, ...res.data } : d)));
      setEditTarget(null);
      toast.success("Division updated successfully.");
      await checkAndRegenerate("divisions");
    } catch (error) {
      toast.error(error.message || "Unable to update division.");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Are you sure you want to delete this division? This action cannot be undone.")) return;
    try {
      const res = await deleteDivision(id);
      setDivisions(res.data || []);
      toast.success(res.message || "Division deleted.");
      await checkAndRegenerate("divisions");
    } catch (error) {
      toast.error(error.message || "Unable to delete division.");
    }
  };

  const onImportFile = async (file) => {
    setUploading(true);
    setImportResult(null);
    try {
      const res = await importDivisions(file);
      const importData = res?.data || {};
      setDivisions(importData.divisions || divisions);
      const regenData = (await checkAndRegenerate("divisions")) || {};
      setImportResult({ ...importData, regenerated: regenData.regenerated, generation_id: regenData.generation_id });
    } catch (error) {
      setImportResult({ imported_count: 0, skipped_count: 0, errors: [{ row: 0, reason: error.message }] });
    } finally {
      setUploading(false);
    }
  };

  const showRegenBanner = regenerationResult && !regenerationResult.error && regenerationResult.regenerated;

  return (
    <div className="space-y-4">
      {editTarget && (
        <EditModal division={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} />
      )}

      <Card ref={formRef}>
        <CardHeader><CardTitle>Division Management</CardTitle></CardHeader>
        <CardContent>
          {showRegenBanner && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300">
              <span>
                Timetable automatically updated.{" "}
                <button className="underline font-medium" onClick={() => { clearResult(); navigate(`/timetable?generation_id=${regenerationResult.generation_id}`); }}>
                  View Timetable
                </button>
              </span>
              <button onClick={clearResult} className="ml-2 text-blue-600 hover:text-blue-800">✕</button>
            </div>
          )}
          <form className="grid gap-3 md:grid-cols-4" onSubmit={submit}>
            <div>
              <Label htmlFor="div_name">Division Name</Label>
              <Input id="div_name" value={form.name} placeholder="Division A" onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="div_semester">Semester</Label>
              <Input id="div_semester" type="number" min="1" max="8" value={form.semester} onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="div_program">Program</Label>
              <select id="div_program" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.program} onChange={(e) => setForm((p) => ({ ...p, program: e.target.value }))}>
                <option value="UG">Undergraduate</option>
                <option value="PG">Postgraduate</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add Division"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Bulk Import */}
      <Card>
        <CardHeader>
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setImportOpen((v) => !v)}>
            <CardTitle>Import Divisions in Bulk</CardTitle>
            {importOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {importOpen && (
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadBlob(CSV_TEMPLATE, "divisions_template.csv", "text/csv")}>Download CSV Template</Button>
              <Button variant="outline" size="sm" onClick={() => downloadBlob(JSON_TEMPLATE, "divisions_template.json", "application/json")}>Download JSON Template</Button>
            </div>
            <FileDropZone accept=".csv,.json" onFile={onImportFile} label="Drop your divisions CSV or JSON file here" sublabel="Supports .csv and .json files" uploading={uploading} />
            {importResult && <ImportResultBanner result={importResult} onDismiss={() => setImportResult(null)} />}
          </CardContent>
        )}
      </Card>

      {/* Records table */}
      <Card>
        <CardHeader><CardTitle>Division Records</CardTitle></CardHeader>
        <CardContent>
          {divisions.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No divisions added yet"
              description="Add a division to assign subjects and generate timetables."
              action={{ label: "Add Division", onClick: () => formRef.current?.scrollIntoView({ behavior: "smooth" }) }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Name</th>
                    <th className="p-2">Semester</th>
                    <th className="p-2">Program</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {divisions.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2">{formatSemester(item.semester)}</td>
                      <td className="p-2">{formatProgram(item.program)}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditTarget(item)}>
                            <Pencil className="mr-1 h-3 w-3" />Edit
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => remove(item.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
