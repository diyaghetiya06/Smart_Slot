import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ChevronDown, ChevronUp, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import SubjectTypeBadge from "@/components/ui/SubjectTypeBadge";
import FileDropZone from "@/components/ui/FileDropZone";
import ImportResultBanner from "@/components/ui/ImportResultBanner";
import { fetchFaculty } from "@/api/faculty";
import { createSubject, deleteSubject, fetchSubjects, updateSubject } from "@/api/subjects";
import { importSubjects } from "@/api/import";
import { useAutoRegenerate } from "@/hooks/useAutoRegenerate";
import { useToast } from "@/hooks/useToast";

const initialState = { name: "", subject_type: "Class", assigned_faculty_id: "" };

const CSV_TEMPLATE = `name,subject_type,faculty_name\nMachine Learning,Lab,Dr. Jane Smith\n`;
const JSON_TEMPLATE = JSON.stringify([{ name: "Machine Learning", subject_type: "Lab", faculty_name: "Dr. Jane Smith" }], null, 2);

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────
function EditModal({ subject, faculty, onSave, onClose }) {
  const [form, setForm] = useState({
    name: subject.name,
    subject_type: subject.subject_type,
    assigned_faculty_id: String(subject.assigned_faculty_id),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.assigned_faculty_id) return;
    setSaving(true);
    await onSave(subject.id, { ...form, assigned_faculty_id: Number(form.assigned_faculty_id) });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Edit Subject</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <Label>Subject Name</Label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <Label>Type</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.subject_type}
              onChange={(e) => setForm((p) => ({ ...p, subject_type: e.target.value }))}
            >
              <option>Class</option>
              <option>Lab</option>
              <option>Tutorial</option>
            </select>
          </div>
          <div>
            <Label>Assigned Faculty</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.assigned_faculty_id}
              onChange={(e) => setForm((p) => ({ ...p, assigned_faculty_id: e.target.value }))}
            >
              <option value="">Select Faculty</option>
              {faculty.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
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
export default function SubjectsPage() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const toast = useToast();

  const [subjects, setSubjects] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [form, setForm] = useState(initialState);
  const [editTarget, setEditTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const { checkAndRegenerate, regenerationResult, clearResult } = useAutoRegenerate();

  useEffect(() => {
    Promise.all([fetchSubjects(), fetchFaculty()])
      .then(([subjectRes, facultyRes]) => {
        setSubjects(subjectRes.data || []);
        setFaculty(facultyRes.data || []);
      })
      .catch(() => toast.error("Unable to load subjects right now. Please refresh."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.assigned_faculty_id) {
      toast.warn("Please fill in subject name and assigned faculty.");
      return;
    }
    setSaving(true);
    try {
      const res = await createSubject({ ...form, assigned_faculty_id: Number(form.assigned_faculty_id) });
      setSubjects(res.data || []);
      setForm(initialState);
      toast.success("Subject added successfully.");
      await checkAndRegenerate("subjects");
    } catch (error) {
      toast.error(error.message || "Unable to save subject.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id, data) => {
    try {
      const res = await updateSubject(id, data);
      setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...res.data } : s)));
      setEditTarget(null);
      toast.success("Subject updated successfully.");
      await checkAndRegenerate("subjects");
    } catch (error) {
      toast.error(error.message || "Unable to update subject.");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Are you sure you want to delete this subject? This action cannot be undone.")) return;
    try {
      const res = await deleteSubject(id);
      setSubjects(res.data || []);
      toast.success(res.message || "Subject deleted.");
      await checkAndRegenerate("subjects");
    } catch (error) {
      toast.error(error.message || "Unable to delete subject.");
    }
  };

  const onImportFile = async (file) => {
    setUploading(true);
    setImportResult(null);
    try {
      const res = await importSubjects(file);
      const importData = res?.data || {};
      setSubjects(importData.subjects || subjects);
      const regenData = (await checkAndRegenerate("subjects")) || {};
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
        <EditModal
          subject={editTarget}
          faculty={faculty}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}

      <Card ref={formRef}>
        <CardHeader><CardTitle>Subject Management</CardTitle></CardHeader>
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
              <Label htmlFor="sub_name">Subject Name</Label>
              <Input id="sub_name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Machine Learning" />
            </div>
            <div>
              <Label htmlFor="sub_type">Type</Label>
              <select id="sub_type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.subject_type} onChange={(e) => setForm((p) => ({ ...p, subject_type: e.target.value }))}>
                <option>Class</option>
                <option>Lab</option>
                <option>Tutorial</option>
              </select>
            </div>
            <div>
              <Label htmlFor="sub_faculty">Assigned Faculty</Label>
              <select id="sub_faculty" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.assigned_faculty_id} onChange={(e) => setForm((p) => ({ ...p, assigned_faculty_id: e.target.value }))}>
                <option value="">Select Faculty</option>
                {faculty.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add Subject"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Bulk Import */}
      <Card>
        <CardHeader>
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setImportOpen((v) => !v)}>
            <CardTitle>Import Subjects in Bulk</CardTitle>
            {importOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {importOpen && (
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadBlob(CSV_TEMPLATE, "subjects_template.csv", "text/csv")}>Download CSV Template</Button>
              <Button variant="outline" size="sm" onClick={() => downloadBlob(JSON_TEMPLATE, "subjects_template.json", "application/json")}>Download JSON Template</Button>
            </div>
            <FileDropZone accept=".csv,.json" onFile={onImportFile} label="Drop your subjects CSV or JSON file here" sublabel="Supports .csv and .json files" uploading={uploading} />
            {importResult && <ImportResultBanner result={importResult} onDismiss={() => setImportResult(null)} />}
          </CardContent>
        )}
      </Card>

      {/* Records table */}
      <Card>
        <CardHeader><CardTitle>Subject Records</CardTitle></CardHeader>
        <CardContent>
          {subjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No subjects added yet"
              description="Create a subject and assign it to a faculty member."
              action={{ label: "Add Subject", onClick: () => formRef.current?.scrollIntoView({ behavior: "smooth" }) }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Name</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Faculty</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2"><SubjectTypeBadge type={item.subject_type} /></td>
                      <td className="p-2">{item.faculty_name}</td>
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
