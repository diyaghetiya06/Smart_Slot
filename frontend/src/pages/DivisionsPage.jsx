import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createDivision, deleteDivision, fetchDivisions } from "@/api/divisions";

const initialState = { name: "", semester: "1", program: "UG" };

export default function DivisionsPage() {
  const [divisions, setDivisions] = useState([]);
  const [form, setForm] = useState(initialState);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetchDivisions()
      .then((res) => setDivisions(res.data || []))
      .catch(() => setStatus("Unable to load division records right now."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setStatus("Please enter a division name before submitting.");
      return;
    }

    try {
      const res = await createDivision({ ...form, semester: Number(form.semester) });
      setDivisions(res.data || []);
      setForm(initialState);
      setStatus("Division added successfully.");
    } catch (error) {
      setStatus(error.message || "Unable to save division right now.");
    }
  };

  const remove = async (id) => {
    try {
      const res = await deleteDivision(id);
      setDivisions(res.data || []);
      setStatus(res.message || "Division deleted successfully.");
    } catch (error) {
      setStatus(error.message || "Unable to delete division right now.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Division Management</CardTitle></CardHeader>
        <CardContent>
          {status && <p className="mb-3 rounded-md border border-border bg-muted p-3 text-sm">{status}</p>}
          <form className="grid gap-3 md:grid-cols-4" onSubmit={submit}>
            <div>
              <Label htmlFor="div_name">Division Name</Label>
              <Input id="div_name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="div_semester">Semester</Label>
              <Input id="div_semester" type="number" min="1" max="8" value={form.semester} onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="div_program">Program</Label>
              <select id="div_program" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.program} onChange={(e) => setForm((p) => ({ ...p, program: e.target.value }))}>
                <option value="UG">UG</option>
                <option value="PG">PG</option>
              </select>
            </div>
            <div className="flex items-end"><Button type="submit">Add Division</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Division Records</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Name</th><th className="p-2">Semester</th><th className="p-2">Program</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {divisions.length === 0 ? <tr><td className="p-3 text-muted-foreground" colSpan="4">No division records yet.</td></tr> : divisions.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{item.name}</td><td className="p-2">{item.semester}</td><td className="p-2">{item.program}</td><td className="p-2"><Button type="button" variant="outline" size="sm" onClick={() => remove(item.id)}>Delete</Button></td></tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
