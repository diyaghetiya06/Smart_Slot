import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, CheckCircle2, Clock, Star, ExternalLink, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { fetchPublished } from "@/api/published";
import { apiRequest } from "@/api/client";
import { formatGenerationId } from "@/lib/utils";

const STATUS_CONFIG = {
  draft:     { label: "Draft",    color: "bg-muted text-muted-foreground", icon: Clock },
  reviewed:  { label: "Reviewed", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: Star },
  published: { label: "Published",color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400", icon: CheckCircle2 },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

export default function PublishedPage() {
  const navigate = useNavigate();
  const [publishData, setPublishData] = useState(null);
  const [allGenerations, setAllGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [updating, setUpdating] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [sharingId, setSharingId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchPublished();
      const data = res.data || {};
      setPublishData(data);
      setAllGenerations(data.all_generations || []);
      setStatusMsg("");
    } catch (error) {
      setStatusMsg(error.message || "Unable to load published status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (generationId, newStatus) => {
    setUpdating(generationId + newStatus);
    try {
      await apiRequest(`/timetable/${generationId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      await load();
    } catch (err) {
      setStatusMsg(err.message || "Failed to update status.");
    } finally {
      setUpdating("");
    }
  };

  const createShare = async (generationId) => {
    setSharingId(generationId);
    try {
      const res = await apiRequest("/share", {
        method: "POST",
        body: JSON.stringify({ generation_id: generationId, expires_in_days: 7 }),
      });
      setShareUrl(res.data?.share_url || "");
    } catch (err) {
      setStatusMsg(err.message || "Failed to create share link.");
    } finally {
      setSharingId("");
    }
  };

  const hasData = allGenerations.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Published Timetables</CardTitle>
          <CardDescription>Track publication status and share generated timetables.</CardDescription>
        </CardHeader>
      </Card>

      {statusMsg && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {statusMsg}
        </p>
      )}

      {shareUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <span className="font-medium">Share link ready:</span>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="text-primary underline truncate">
            {shareUrl}
          </a>
          <button onClick={() => { navigator.clipboard.writeText(shareUrl); }} className="ml-auto shrink-0 text-xs text-muted-foreground hover:text-foreground">
            Copy
          </button>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
            ))}
          </CardContent>
        </Card>
      ) : !hasData ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={Send}
              title="Nothing generated yet"
              description="Generate and review a timetable before publishing."
              action={{ label: "Generate Timetable", onClick: () => navigate("/generate") }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>All Generations</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Generation</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Divisions</th>
                    <th className="p-2">Slots</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allGenerations.map((gen) => (
                    <tr key={gen.generation_id} className="border-b align-middle">
                      <td className="p-2 font-mono text-xs">
                        <button
                          className="text-primary hover:underline"
                          onClick={() => navigate(`/timetable?generation_id=${gen.generation_id}`)}
                        >
                          {formatGenerationId(gen.generation_id)}
                        </button>
                      </td>
                      <td className="p-2">
                        <StatusBadge status={gen.status || "draft"} />
                      </td>
                      <td className="p-2">{gen.divisions}</td>
                      <td className="p-2">{gen.slots}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1.5">
                          {/* View */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/timetable?generation_id=${gen.generation_id}`)}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" /> View
                          </Button>
                          {/* Mark Reviewed */}
                          {gen.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updating === gen.generation_id + "reviewed"}
                              onClick={() => setStatus(gen.generation_id, "reviewed")}
                            >
                              <Star className="h-3 w-3 mr-1" /> Review
                            </Button>
                          )}
                          {/* Publish */}
                          {(gen.status === "draft" || gen.status === "reviewed") && (
                            <Button
                              size="sm"
                              disabled={updating === gen.generation_id + "published"}
                              onClick={() => setStatus(gen.generation_id, "published")}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Publish
                            </Button>
                          )}
                          {/* Share */}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sharingId === gen.generation_id}
                            onClick={() => createShare(gen.generation_id)}
                          >
                            <Share2 className="h-3 w-3 mr-1" />
                            {sharingId === gen.generation_id ? "Creating…" : "Share"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
