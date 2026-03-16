import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchSettings, updateSettings } from "@/api/settings";

const fallback = {
  institute_name: "",
  logo_url: "",
  academic_year: "",
  semester_type: "odd",
  default_program: "UG",
  auto_resolution: true,
  preference_weighting: 60,
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  time_slots: [
    "9:00 AM-10:00 AM",
    "10:00 AM-11:00 AM",
    "11:00 AM-12:00 PM",
    "12:00 PM-1:00 PM",
    "1:00 PM-2:00 PM (Lunch Break)",
    "2:00 PM-3:00 PM",
    "3:00 PM-4:00 PM",
    "4:00 PM-5:00 PM",
  ],
};

export default function SettingsPage() {
  const [form, setForm] = useState(fallback);
  const [workingDaysText, setWorkingDaysText] = useState(fallback.working_days.join(", "));
  const [timeSlotsText, setTimeSlotsText] = useState(fallback.time_slots.join("\n"));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((res) => {
        const data = res.data || fallback;
        setForm({ ...fallback, ...data });
        setWorkingDaysText((data.working_days || fallback.working_days).join(", "));
        setTimeSlotsText((data.time_slots || fallback.time_slots).join("\n"));
      })
      .catch(() => setStatus("Unable to load settings right now."));
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    const working_days = workingDaysText.split(",").map((x) => x.trim()).filter(Boolean);
    const time_slots = timeSlotsText.split("\n").map((x) => x.trim()).filter(Boolean);

    setSaving(true);
    setStatus("");

    try {
      const res = await updateSettings({ ...form, working_days, time_slots });
      setForm({ ...form, ...(res.data || {}) });
      setStatus("Settings saved successfully.");
    } catch (error) {
      setStatus(error.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
      <CardContent>
        {status && <p className="mb-3 rounded-md border border-border bg-muted p-2 text-sm">{status}</p>}
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <div>
            <Label htmlFor="institute_name">Institute Name</Label>
            <Input id="institute_name" value={form.institute_name || ""} onChange={(e) => setForm((p) => ({ ...p, institute_name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="academic_year">Academic Year</Label>
            <Input id="academic_year" value={form.academic_year || ""} onChange={(e) => setForm((p) => ({ ...p, academic_year: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="logo_url">Logo URL</Label>
            <Input id="logo_url" value={form.logo_url || ""} onChange={(e) => setForm((p) => ({ ...p, logo_url: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="preference_weighting">Preference Weighting (1-100)</Label>
            <Input id="preference_weighting" type="number" min="1" max="100" value={form.preference_weighting || 60} onChange={(e) => setForm((p) => ({ ...p, preference_weighting: Number(e.target.value || 0) }))} />
          </div>
          <div>
            <Label htmlFor="semester_type">Semester Type</Label>
            <select id="semester_type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.semester_type || "odd"} onChange={(e) => setForm((p) => ({ ...p, semester_type: e.target.value }))}>
              <option value="odd">Odd</option>
              <option value="even">Even</option>
            </select>
          </div>
          <div>
            <Label htmlFor="default_program">Default Program</Label>
            <select id="default_program" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.default_program || "UG"} onChange={(e) => setForm((p) => ({ ...p, default_program: e.target.value }))}>
              <option value="UG">UG</option>
              <option value="PG">PG</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.auto_resolution)} onChange={(e) => setForm((p) => ({ ...p, auto_resolution: e.target.checked }))} />
              Auto conflict resolution
            </label>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="working_days">Working Days (comma separated)</Label>
            <Input id="working_days" value={workingDaysText} onChange={(e) => setWorkingDaysText(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="time_slots">Time Slots (one per line)</Label>
            <textarea id="time_slots" className="min-h-36 w-full rounded-md border border-input bg-background p-3 text-sm" value={timeSlotsText} onChange={(e) => setTimeSlotsText(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
