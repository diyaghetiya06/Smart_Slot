import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchShare } from "@/api/published";
import { useToast } from "@/hooks/useToast";

export default function SharePage() {
  const { generationId: routeGenerationId } = useParams();
  const [generationId, setGenerationId] = useState(routeGenerationId || "");
  const [shareUrl, setShareUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const hasValue = useMemo(() => Boolean(generationId.trim()), [generationId]);

  const onLoad = async () => {
    if (!hasValue) {
      toast({ title: "Generation required", description: "Enter a generation id to load share URL.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetchShare(generationId.trim());
      setShareUrl(res.data?.share_url || "");
      toast({ title: "Share URL ready", description: "Link generated successfully." });
    } catch (error) {
      toast({ title: "Unable to load share URL", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share Timetable</CardTitle>
        <CardDescription>Generate a public URL for a specific generation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={generationId} onChange={(e) => setGenerationId(e.target.value)} placeholder="GEN-20260316150507" />
        <Button type="button" onClick={onLoad} disabled={loading}>{loading ? "Loading..." : "Get Share URL"}</Button>
        {shareUrl ? <a className="block text-sm text-primary underline" href={shareUrl}>{shareUrl}</a> : null}
      </CardContent>
    </Card>
  );
}
