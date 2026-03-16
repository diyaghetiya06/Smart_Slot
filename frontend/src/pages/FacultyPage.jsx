import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createFaculty, deleteFaculty, fetchFaculty } from "@/api/faculty";

const initialForm = {
  name: "",
  subject: "",
  available_time: "",
  max_lectures_per_day: "",
};

export default function FacultyPage() {
  const [faculty, setFaculty] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFaculty()
      .then((res) => setFaculty(res.data || []))
      .catch(() => {
        setStatus({
          type: "error",
          message: "We could not load faculty records right now. Please try again.",
        });
      });
  }, []);

  const friendlyCount = useMemo(() => `${faculty.length} Faculty`, [faculty.length]);

  const validate = () => {
    const errors = {};

    if (!form.name.trim()) errors.name = "Please enter faculty name.";
    if (!form.subject.trim()) errors.subject = "Please enter subject name.";
    if (!form.available_time.trim()) {
      errors.available_time = "Please provide availability in this format: 9:00 AM-12:00 PM, 2:00 PM-5:00 PM.";
    }

    const max = Number(form.max_lectures_per_day);
    if (!form.max_lectures_per_day || Number.isNaN(max) || max < 1) {
      errors.max_lectures_per_day = "Max lectures per day must be at least 1.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      setStatus({ type: "error", message: "Please correct the highlighted fields and try again." });
      return;
    }

    setSaving(true);
    setStatus({ type: "", message: "" });

    try {
      const response = await createFaculty({ ...form, max_lectures_per_day: Number(form.max_lectures_per_day) });
      if (!response.success) {
        throw new Error(response.message || "Unable to save faculty details.");
      }

      setFaculty(response.data || faculty);
      setForm(initialForm);
      setStatus({ type: "success", message: "Faculty details saved successfully." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Something went wrong while saving. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    try {
      const response = await deleteFaculty(id);
      setFaculty(response.data || []);
      setStatus({ type: "success", message: response.message || "Faculty deleted successfully." });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Unable to delete faculty right now.",
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Faculty Management</CardTitle>
          <CardDescription>Add and manage faculty workload settings.</CardDescription>
          <Badge variant="secondary" className="w-fit">{friendlyCount}</Badge>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Faculty</CardTitle>
        </CardHeader>
        <CardContent>
          {status.message && (
            <p
              className={`mb-4 rounded-md border p-3 text-sm ${
                status.type === "success"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              {status.message}
            </p>
          )}

          <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit} noValidate>
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
            <div>
              <Label htmlFor="available_time">Available Time</Label>
              <Input
                id="available_time"
                name="available_time"
                value={form.available_time}
                onChange={onChange}
                placeholder="9:00 AM-12:00 PM, 2:00 PM-5:00 PM"
              />
              {fieldErrors.available_time && <p className="mt-1 text-xs text-destructive">{fieldErrors.available_time}</p>}
            </div>
            <div>
              <Label htmlFor="max_lectures_per_day">Max Lectures Per Day</Label>
              <Input id="max_lectures_per_day" name="max_lectures_per_day" type="number" min="1" value={form.max_lectures_per_day} onChange={onChange} />
              {fieldErrors.max_lectures_per_day && (
                <p className="mt-1 text-xs text-destructive">{fieldErrors.max_lectures_per_day}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Faculty"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faculty Records</CardTitle>
        </CardHeader>
        <CardContent>
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
                {faculty.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-3 text-muted-foreground">No faculty records yet.</td>
                  </tr>
                ) : (
                  faculty.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.subject}</td>
                      <td className="p-2">{item.available_time}</td>
                      <td className="p-2">{item.max_lectures_per_day}</td>
                      <td className="p-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => onDelete(item.id)}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
