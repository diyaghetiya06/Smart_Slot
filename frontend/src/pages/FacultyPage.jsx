import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ChevronDown, ChevronUp, Clock, Check, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/EmptyState";
import FileDropZone from "@/components/ui/FileDropZone";
import ImportResultBanner from "@/components/ui/ImportResultBanner";
import { createFaculty, deleteFaculty, fetchFaculty, updateFaculty } from "@/api/faculty";
import { importFaculty } from "@/api/import";
import { useAutoRegenerate } from "@/hooks/useAutoRegenerate";
import { formatAvailability } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";

// Standard time slots shown in the dropdown
const TIME_SLOT_OPTIONS = [
  "9:00 AM-10:00 AM",
  "10:00 AM-11:00 AM",
  "11:00 AM-12:00 PM",
  "12:00 PM-1:00 PM",
  "2:00 PM-3:00 PM",
  "3:00 PM-4:00 PM",
  "4:00 PM-5:00 PM",
];

const initialForm = {
  name: "",
  subject: "",
  max_lectures_per_day: "",
};

const CSV_TEMPLATE = `name,subject,available_time,max_lectures_per_day\nDr. Jane Smith,Computer Networks,9:00 AM-12:00 PM,3\n`;

const JSON_TEMPLATE = JSON.stringify(
  [{ name: "Dr. Jane Smith", subject: "Computer Networks", available_time: "9:00 AM-12:00 PM", max_lectures_per_day: 3 }],
  null,
  2
);

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── TimeSlotPicker Component ───────────────────────────────────────────────────
function TimeSlotPicker({ selected = [], onChange, error }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleSlot = (slot) => {
    if (selected.includes(slot)) {
      onChange(selected.filter((s) => s !== slot));
    } else {
      onChange([...selected, slot]);
    }
  };

  const displayText =
    selected.length === 0
      ? "Select available times..."
      : `${selected.length} slot${selected.length > 1 ? "s" : ""} selected`;

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={[
          "flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-destructive text-destructive" : "border-input",
        ].join(" ")}
      >
        <span className="flex items-center gap-2 truncate">
          <Clock className={`h-4 w-4 ${error ? "text-destructive" : "text-muted-foreground"}`} />
          {displayText}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg shadow-black/5 outline-none animate-in fade-in-0 zoom-in-95">
          <div className="max-h-[300px] overflow-y-auto p-1">
            {TIME_SLOT_OPTIONS.map((slot) => {
              const checked = selected.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => toggleSlot(slot)}
                  className={[
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left",
                    checked ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                    ].join(" ")}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  {slot}
                </button>
              );
            })}
          </div>
          <div className="border-t px-3 py-2 text-right">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────────
function EditModal({ faculty, onSave, onClose }) {
  const [form, setForm] = useState({
    name: faculty.name,
    subject: faculty.subject,
    max_lectures_per_day: String(faculty.max_lectures_per_day),
  });
  
  // Faculty available_time comes as a comma-separated string from the DB
  const initialSlots = typeof faculty.available_time === "string" 
    ? faculty.available_time.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  const [selectedSlots, setSelectedSlots] = useState(initialSlots);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || selectedSlots.length === 0) {
      toast.warn("Please full out all required fields.");
      return;
    }
    const max = Number(form.max_lectures_per_day);
    if (!form.max_lectures_per_day || Number.isNaN(max) || max < 1) {
      toast.warn("Max lectures must be at least 1.");
      return;
    }

    setSaving(true);
    await onSave(faculty.id, {
      ...form,
      available_time: selectedSlots.join(", "),
      max_lectures_per_day: max,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border bg-card shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between border-b px-5 py-4 sticky top-0 bg-card z-10">
          <h2 className="font-semibold">Edit Faculty</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 grid gap-4 md:grid-cols-2">
          <div>
            <Label>Faculty Name</Label>
            <Input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => setForm(p => ({...p, subject: e.target.value}))} />
          </div>
          <div className="md:col-span-2">
            <Label>Available Time</Label>
            <TimeSlotPicker selected={selectedSlots} onChange={setSelectedSlots} />
            {selectedSlots.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedSlots.map((slot) => (
                  <span
                    key={slot}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {slot}
                    <button
                      type="button"
                      onClick={() => setSelectedSlots(selectedSlots.filter((s) => s !== slot))}
                      className="ml-0.5 rounded-full text-primary/70 hover:text-destructive"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <Label>Max Lectures Per Day</Label>
            <Input 
              type="number" min="1" 
              value={form.max_lectures_per_day} 
              onChange={(e) => setForm(p => ({...p, max_lectures_per_day: e.target.value}))} 
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t mt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function FacultyPage() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const toast = useToast();

  const [faculty, setFaculty] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [editTarget, setEditTarget] = useState(null);
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const { checkAndRegenerate, regenerationResult, clearResult } = useAutoRegenerate();

  useEffect(() => {
    fetchFaculty()
      .then((res) => setFaculty(res.data || []))
      .catch(() => toast.error("Could not load faculty records right now. Please try again."));
  }, []);

  const friendlyCount = useMemo(() => `${faculty.length} Faculty`, [faculty.length]);

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = "Please enter faculty name.";
    if (!form.subject.trim()) errors.subject = "Please enter subject name.";
    if (selectedSlots.length === 0)
      errors.available_time = "Please select at least one available time slot.";
    const max = Number(form.max_lectures_per_day);
    if (!form.max_lectures_per_day || Number.isNaN(max) || max < 1)
      errors.max_lectures_per_day = "Max lectures per day must be at least 1.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const onSlotsChange = (slots) => {
    setSelectedSlots(slots);
    setFieldErrors((prev) => ({ ...prev, available_time: "" }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.warn("Please correct the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    const available_time = selectedSlots.join(", ");
    try {
      const response = await createFaculty({
        ...form,
        available_time,
        max_lectures_per_day: Number(form.max_lectures_per_day),
      });
      setFaculty(response.data || faculty);
      setForm(initialForm);
      setSelectedSlots([]);
      toast.success("Faculty details saved successfully.");
      await checkAndRegenerate("faculty");
    } catch (error) {
      toast.error(error.message || "Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id, data) => {
    try {
      const res = await updateFaculty(id, data);
      setFaculty((prev) => prev.map((f) => (f.id === id ? { ...f, ...res.data } : f)));
      setEditTarget(null);
      toast.success("Faculty updated successfully.");
      await checkAndRegenerate("faculty");
    } catch (error) {
      toast.error(error.message || "Unable to update faculty.");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this faculty member? This action cannot be undone.")) return;
    try {
      const response = await deleteFaculty(id);
      setFaculty(response.data || []);
      toast.success(response.message || "Faculty deleted successfully.");
      await checkAndRegenerate("faculty");
    } catch (error) {
      toast.error(error.message || "Unable to delete faculty right now.");
    }
  };

  const onImportFile = async (file) => {
    setUploading(true);
    setImportResult(null);
    try {
      const res = await importFaculty(file);
      const importData = res?.data || {};
      setFaculty(importData.faculty || faculty);
      const regenRes = await checkAndRegenerate("faculty");
      const regenData = regenRes || {};
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
        <EditModal faculty={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} />
      )}

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Faculty Management</CardTitle>
          <CardDescription>Add and manage faculty workload settings.</CardDescription>
          <Badge variant="secondary" className="w-fit">{friendlyCount}</Badge>
        </CardHeader>
      </Card>

      {/* Add faculty form */}
      <Card ref={formRef}>
        <CardHeader>
          <CardTitle>Add Faculty</CardTitle>
        </CardHeader>
        <CardContent>
          {showRegenBanner && (
            <div className="mb-4 flex items-center justify-between rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-300">
              <span>
                Timetable automatically updated.{" "}
                <button
                  className="underline font-medium"
                  onClick={() => {
                    clearResult();
                    navigate(`/timetable?generation_id=${regenerationResult.generation_id}`);
                  }}
                >
                  View Timetable
                </button>
              </span>
              <button onClick={clearResult} className="ml-2 text-blue-600 hover:text-blue-800">✕</button>
            </div>
          )}

          <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit} noValidate>
            <div>
              <Label htmlFor="name">Faculty Name</Label>
              <Input id="name" name="name" value={form.name} onChange={onChange} placeholder="Dr. Ananya Sharma" />
              {fieldErrors.name && <p className="mt-1 text-xs text-destructive">{fieldErrors.name}</p>}
            </div>

            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" name="subject" value={form.subject} onChange={onChange} placeholder="Computer Networks" />
              {fieldErrors.subject && <p className="mt-1 text-xs text-destructive">{fieldErrors.subject}</p>}
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="available_time">Available Time</Label>
              <TimeSlotPicker selected={selectedSlots} onChange={onSlotsChange} error={!!fieldErrors.available_time} />
              {selectedSlots.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedSlots.map((slot) => (
                    <span key={slot} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {slot}
                      <button
                        type="button"
                        onClick={() => onSlotsChange(selectedSlots.filter((s) => s !== slot))}
                        className="ml-0.5 rounded-full text-primary/70 hover:text-destructive"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              {fieldErrors.available_time && <p className="mt-1 text-xs text-destructive">{fieldErrors.available_time}</p>}
            </div>

            <div>
              <Label htmlFor="max_lectures_per_day">Max Lectures Per Day</Label>
              <Input
                id="max_lectures_per_day" name="max_lectures_per_day" type="number" min="1"
                value={form.max_lectures_per_day} onChange={onChange}
              />
              {fieldErrors.max_lectures_per_day && <p className="mt-1 text-xs text-destructive">{fieldErrors.max_lectures_per_day}</p>}
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Faculty"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Bulk Import Panel */}
      <Card>
        <CardHeader>
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setImportOpen((v) => !v)}>
            <CardTitle>Import Faculty in Bulk</CardTitle>
            {importOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {importOpen && (
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadBlob(CSV_TEMPLATE, "faculty_template.csv", "text/csv")}>Download CSV Template</Button>
              <Button variant="outline" size="sm" onClick={() => downloadBlob(JSON_TEMPLATE, "faculty_template.json", "application/json")}>Download JSON Template</Button>
            </div>
            <FileDropZone accept=".csv,.json" onFile={onImportFile} label="Drop your faculty CSV or JSON file here" sublabel="Supports .csv and .json files" uploading={uploading} />
            {importResult && <ImportResultBanner result={importResult} onDismiss={() => setImportResult(null)} />}
          </CardContent>
        )}
      </Card>

      {/* Faculty Records table */}
      <Card>
        <CardHeader><CardTitle>Faculty Records</CardTitle></CardHeader>
        <CardContent>
          {faculty.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No faculty added yet"
              description="Add your first faculty member above to start building timetables."
              action={{ label: "Add Faculty", onClick: () => formRef.current?.scrollIntoView({ behavior: "smooth" }) }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Name</th>
                    <th className="p-2">Subject</th>
                    <th className="p-2">Availability</th>
                    <th className="p-2">Max/Day</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {faculty.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2">{item.subject}</td>
                      <td className="p-2">{formatAvailability(item.available_time)}</td>
                      <td className="p-2">{item.max_lectures_per_day} lectures</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditTarget(item)}>
                            <Pencil className="mr-1 h-3 w-3" />Edit
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => onDelete(item.id)}>Delete</Button>
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
