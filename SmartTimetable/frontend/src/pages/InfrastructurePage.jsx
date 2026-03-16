import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createRoom, fetchInfrastructure } from "@/api/infrastructure";

const initialForm = {
  name: "",
  capacity: "",
  room_type: "Lecture Hall",
  status: "Available",
  equipment: "",
};

export default function InfrastructurePage() {
  const [rooms, setRooms] = useState([]);
  const [filters, setFilters] = useState([]);
  const [availableFilters, setAvailableFilters] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("");

  const load = (nextFilters = []) => {
    fetchInfrastructure(nextFilters)
      .then((res) => {
        setRooms(res.data?.rooms || []);
        setAvailableFilters(res.data?.equipment_filters || []);
      })
      .catch(() => setStatus("Unable to load room data right now."));
  };

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roomCountText = useMemo(() => `${rooms.length} Rooms`, [rooms.length]);

  const toggleFilter = (item) => {
    const next = filters.includes(item) ? filters.filter((x) => x !== item) : [...filters, item];
    setFilters(next);
    load(next);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.capacity) {
      setStatus("Room name and capacity are required.");
      return;
    }

    try {
      const res = await createRoom({
        ...form,
        capacity: Number(form.capacity),
        equipment: form.equipment,
      });
      setRooms(res.data?.rooms || []);
      setAvailableFilters(res.data?.equipment_filters || []);
      setForm(initialForm);
      setStatus("Room added successfully.");
    } catch (error) {
      setStatus(error.message || "Unable to add room right now.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure</CardTitle>
          <CardDescription>{roomCountText}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Add Room</CardTitle></CardHeader>
        <CardContent>
          {status && <p className="mb-3 rounded-md border border-border bg-muted p-3 text-sm">{status}</p>}
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="name">Room Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Input id="capacity" type="number" min="1" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="room_type">Room Type</Label>
              <Input id="room_type" value={form.room_type} onChange={(e) => setForm((p) => ({ ...p, room_type: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select id="status" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="Available">Available</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Reserved">Reserved</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="equipment">Equipment (comma separated)</Label>
              <Input id="equipment" value={form.equipment} onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))} placeholder="Projector, Smart Board" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit">Add Room</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rooms</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2">
            {availableFilters.map((item) => (
              <button
                key={item}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs ${filters.includes(item) ? "bg-primary text-primary-foreground" : "bg-background"}`}
                onClick={() => toggleFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Name</th>
                  <th className="p-2">Capacity</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Equipment</th>
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 ? (
                  <tr><td colSpan="5" className="p-3 text-muted-foreground">No rooms available.</td></tr>
                ) : (
                  rooms.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.capacity}</td>
                      <td className="p-2">{item.room_type}</td>
                      <td className="p-2">{item.status}</td>
                      <td className="p-2">{(item.equipment || []).join(", ") || "-"}</td>
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
