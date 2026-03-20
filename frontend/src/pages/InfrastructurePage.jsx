import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { Building2, Pencil, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import RoomStatusBadge from "@/components/ui/RoomStatusBadge";
import { createRoom, fetchInfrastructure, updateRoom, deleteRoom } from "@/api/infrastructure";
import { useToast } from "@/hooks/useToast";

const initialForm = { name: "", capacity: "", room_type: "Lecture Hall", status: "Available", equipment: "" };

function EditModal({ room, onSave, onClose }) {
  const [form, setForm] = useState({
    name: room.name,
    capacity: String(room.capacity),
    room_type: room.room_type,
    status: room.status,
    equipment: (room.equipment || []).join(", "),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.capacity) return;
    setSaving(true);
    await onSave(room.id, { ...form, capacity: Number(form.capacity) });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Edit Room</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <Label>Room Name</Label>
            <Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Capacity</Label>
              <Input type="number" min="1" value={form.capacity} onChange={(e) => setForm(p => ({ ...p, capacity: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <Input value={form.room_type} onChange={(e) => setForm(p => ({ ...p, room_type: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="Available">Available</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Reserved">Reserved</option>
            </select>
          </div>
          <div>
            <Label>Equipment (comma separated)</Label>
            <Input value={form.equipment} onChange={(e) => setForm(p => ({ ...p, equipment: e.target.value }))} />
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

export default function InfrastructurePage() {
  const formRef = useRef(null);
  const toast = useToast();
  
  const [rooms, setRooms] = useState([]);
  const [filters, setFilters] = useState([]);
  const [availableFilters, setAvailableFilters] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const load = (nextFilters = []) => {
    fetchInfrastructure(nextFilters)
      .then((res) => {
        setRooms(res.data?.rooms || []);
        setAvailableFilters(res.data?.equipment_filters || []);
      })
      .catch(() => toast.error("Unable to load room data right now. Please refresh."));
  };

  useEffect(() => { load(filters); }, []);

  const roomCountText = useMemo(() => `${rooms.length} Rooms`, [rooms.length]);

  const toggleFilter = (item) => {
    const next = filters.includes(item) ? filters.filter((x) => x !== item) : [...filters, item];
    setFilters(next);
    load(next);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.capacity) { 
      toast.warn("Room name and capacity are required."); 
      return; 
    }
    
    setSaving(true);
    try {
      const res = await createRoom({ ...form, capacity: Number(form.capacity), equipment: form.equipment });
      setRooms(res.data?.rooms || []);
      setAvailableFilters(res.data?.equipment_filters || []);
      setForm(initialForm);
      toast.success("Room added successfully.");
    } catch (error) {
      toast.error(error.message || "Unable to add room right now.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (id, data) => {
    try {
      const res = await updateRoom(id, data);
      setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...res.data } : r)));
      setEditTarget(null);
      toast.success("Room updated successfully.");
      load(filters); // refresh filters
    } catch (error) {
      toast.error(error.message || "Unable to update room.");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Are you sure you want to delete this room? This action cannot be undone.")) return;
    try {
      await deleteRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
      toast.success("Room deleted.");
      load(filters); // refresh filters
    } catch (error) {
      toast.error(error.message || "Unable to delete room.");
    }
  };

  return (
    <div className="space-y-4">
      {editTarget && (
        <EditModal room={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Infrastructure</CardTitle>
          <CardDescription>{roomCountText}</CardDescription>
        </CardHeader>
      </Card>

      <Card ref={formRef}>
        <CardHeader><CardTitle>Add Room</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="rm_name">Room Name</Label>
              <Input id="rm_name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Block A - 101" />
            </div>
            <div>
              <Label htmlFor="rm_cap">Capacity</Label>
              <Input id="rm_cap" type="number" min="1" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="rm_type">Room Type</Label>
              <Input id="rm_type" value={form.room_type} onChange={(e) => setForm((p) => ({ ...p, room_type: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="rm_status">Status</Label>
              <select id="rm_status" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="Available">Available</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Reserved">Reserved</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="rm_equip">Equipment (comma separated)</Label>
              <Input id="rm_equip" value={form.equipment} onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))} placeholder="Projector, Smart Board" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>{saving ? "Adding..." : "Add Room"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rooms</CardTitle></CardHeader>
        <CardContent>
          {availableFilters.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {availableFilters.map((item) => (
                <button key={item} type="button" className={`rounded-full border px-3 py-1 text-xs ${filters.includes(item) ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => toggleFilter(item)}>
                  {item}
                </button>
              ))}
            </div>
          )}
          {rooms.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No rooms added yet"
              description="Add classrooms and labs to include them in scheduling."
              action={{ label: "Add Room", onClick: () => formRef.current?.scrollIntoView({ behavior: "smooth" }) }}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Name</th><th className="p-2">Capacity</th><th className="p-2">Type</th><th className="p-2">Status</th><th className="p-2">Equipment</th><th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2">{item.capacity}</td>
                      <td className="p-2">{item.room_type}</td>
                      <td className="p-2"><RoomStatusBadge status={item.status} /></td>
                      <td className="p-2 flex gap-1 flex-wrap">
                        {(item.equipment || []).map(eq => (
                          <span key={eq} className="bg-muted px-2 py-0.5 rounded text-xs">{eq}</span>
                        ))}
                      </td>
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
