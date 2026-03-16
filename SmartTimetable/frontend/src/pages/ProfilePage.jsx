import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchProfile, updateProfile } from "@/api/profile";

const fallback = {
  full_name: "",
  role_title: "",
  institute: "",
  email: "",
  phone: "",
  theme: "dark",
  contrast: "standard",
  landing: "dashboard",
  email_notifications: true,
  auto_save: true,
  compact_view: false,
  slack_integration: false,
  two_factor: true,
};

export default function ProfilePage() {
  const [form, setForm] = useState(fallback);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((res) => setForm({ ...fallback, ...(res.data || {}) }))
      .catch(() => setStatus("Unable to load profile settings right now."));
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      const res = await updateProfile(form);
      setForm({ ...fallback, ...(res.data || {}) });
      setStatus("Profile preferences saved successfully.");
    } catch (error) {
      setStatus(error.message || "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
      <CardContent>
        {status && <p className="mb-3 rounded-md border border-border bg-muted p-2 text-sm">{status}</p>}
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <div><Label htmlFor="full_name">Full Name</Label><Input id="full_name" value={form.full_name || ""} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
          <div><Label htmlFor="role_title">Role Title</Label><Input id="role_title" value={form.role_title || ""} onChange={(e) => setForm((p) => ({ ...p, role_title: e.target.value }))} /></div>
          <div><Label htmlFor="institute">Institute</Label><Input id="institute" value={form.institute || ""} onChange={(e) => setForm((p) => ({ ...p, institute: e.target.value }))} /></div>
          <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={form.email || ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
          <div><Label htmlFor="phone">Phone</Label><Input id="phone" value={form.phone || ""} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div>
            <Label htmlFor="landing">Landing Page</Label>
            <Input id="landing" value={form.landing || "dashboard"} onChange={(e) => setForm((p) => ({ ...p, landing: e.target.value }))} />
          </div>

          <div className="md:col-span-2 grid gap-2 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.email_notifications)} onChange={(e) => setForm((p) => ({ ...p, email_notifications: e.target.checked }))} /> Email notifications</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.auto_save)} onChange={(e) => setForm((p) => ({ ...p, auto_save: e.target.checked }))} /> Auto save</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.compact_view)} onChange={(e) => setForm((p) => ({ ...p, compact_view: e.target.checked }))} /> Compact view</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.slack_integration)} onChange={(e) => setForm((p) => ({ ...p, slack_integration: e.target.checked }))} /> Slack integration</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.two_factor)} onChange={(e) => setForm((p) => ({ ...p, two_factor: e.target.checked }))} /> Two-factor authentication</label>
          </div>

          <div className="md:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Profile"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
