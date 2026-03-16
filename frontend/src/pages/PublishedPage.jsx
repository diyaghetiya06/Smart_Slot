import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchPublished, fetchShare } from "@/api/published";

export default function PublishedPage() {
  const [generationId, setGenerationId] = useState("");
  const [publishData, setPublishData] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const [status, setStatus] = useState("");

  const load = async (id = "") => {
    try {
      const res = await fetchPublished(id);
      const data = res.data || null;
      setPublishData(data);
      setStatus("");

      if (data?.generation_id) {
        const shareRes = await fetchShare(data.generation_id);
        setShareUrl(shareRes.data?.share_url || "");
      } else {
        setShareUrl("");
      }
    } catch (error) {
      setStatus(error.message || "Unable to load published status.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = (event) => {
    event.preventDefault();
    load(generationId.trim());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Published</CardTitle>
          <CardDescription>Track publication readiness for generated timetables.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={onSubmit}>
            <div className="w-full md:max-w-sm">
              <Label htmlFor="pub_gen">Generation Id</Label>
              <Input id="pub_gen" value={generationId} onChange={(e) => setGenerationId(e.target.value)} placeholder="Leave blank for latest" />
            </div>
            <Button type="submit">Load Published Status</Button>
          </form>
          {status && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{status}</p>}
        </CardContent>
      </Card>

      {publishData && (
        <Card>
          <CardHeader><CardTitle>{publishData.published ? "Published" : "Not Published"}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Generation:</strong> {publishData.generation_id || "None"}</p>
            <p><strong>Divisions:</strong> {publishData.divisions}</p>
            <p><strong>Faculty:</strong> {publishData.faculty}</p>
            <p><strong>Slots:</strong> {publishData.slots}</p>
            {shareUrl && <p><strong>Share URL:</strong> <a className="text-primary underline" href={shareUrl}>{shareUrl}</a></p>}
            <div>
              <p className="mb-1 font-medium">Publication Timeline</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {(publishData.timeline || []).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
