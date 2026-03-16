import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchFaculty } from "@/api/faculty";
import { createSubject, deleteSubject, fetchSubjects } from "@/api/subjects";

const initialState = { name: "", subject_type: "Class", assigned_faculty_id: "" };

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [form, setForm] = useState(initialState);
  const [status, setStatus] = useState("");

  useEffect(() => {
    Promise.all([fetchSubjects(), fetchFaculty()])
      .then(([subjectRes, facultyRes]) => {
        setSubjects(subjectRes.data || []);
        setFaculty(facultyRes.data || []);
      })
      .catch(() => setStatus("Unable to load subjects right now. Please refresh and try again."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.assigned_faculty_id) {
      setStatus("Please enter subject details and select an assigned faculty.");
      return;
    }

    try {
      const res = await createSubject({ ...form, assigned_faculty_id: Number(form.assigned_faculty_id) });
      setSubjects(res.data || []);
      setForm(initialState);
      setStatus("Subject added successfully.");
    } catch (error) {
      setStatus(error.message || "Unable to save subject at the moment.");
    }
  };

  const remove = async (id) => {
    try {
      const res = await deleteSubject(id);
      setSubjects(res.data || []);
      setStatus(res.message || "Subject deleted successfully.");
    } catch (error) {
      setStatus(error.message || "Unable to delete subject right now.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Subject Management</CardTitle></CardHeader>
        <CardContent>
          {status && <p className="mb-3 rounded-md border border-border bg-muted p-3 text-sm">{status}</p>}
          <form className="grid gap-3 md:grid-cols-4" onSubmit={submit}>
            <div>
              <Label htmlFor="sub_name">Subject Name</Label>
              <Input id="sub_name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sub_type">Type</Label>
              <select id="sub_type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.subject_type} onChange={(e) => setForm((p) => ({ ...p, subject_type: e.target.value }))}>
                <option value="Class">Class</option>
                <option value="Lab">Lab</option>
                <option value="Tutorial">Tutorial</option>
              </select>
            </div>
            <div>
              <Label htmlFor="sub_faculty">Assigned Faculty</Label>
              <select id="sub_faculty" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.assigned_faculty_id} onChange={(e) => setForm((p) => ({ ...p, assigned_faculty_id: e.target.value }))}>
                <option value="">Select Faculty</option>
                {faculty.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="flex items-end"><Button type="submit">Add Subject</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Subject Records</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2">Faculty</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {subjects.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan="4">No subject records yet.</td></tr> : subjects.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{item.name}</td><td className="p-2">{item.subject_type}</td><td className="p-2">{item.faculty_name}</td><td className="p-2"><Button type="button" variant="outline" size="sm" onClick={() => remove(item.id)}>Delete</Button></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
