import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarX, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import { fetchTimetable } from "@/api/timetable";
import { formatGenerationId } from "@/lib/utils";

const TYPE_DOT = {
  Class: "bg-blue-500",
  Lab: "bg-purple-500",
  Tutorial: "bg-amber-500",
};

function TimetableCell({ slotData, slotLabel }) {
  if (!slotData) {
    if (slotLabel && (slotLabel.toLowerCase().includes("lunch") || slotLabel.toLowerCase().includes("break"))) {
      return <div className="text-muted-foreground italic text-xs py-2">Lunch Break</div>;
    }
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const dot = TYPE_DOT[slotData.subject_type] || "bg-gray-400";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className="font-medium text-xs leading-tight">{slotData.subject_name}</span>
      </div>
      <p className="text-xs text-muted-foreground pl-3.5">{slotData.faculty_name}</p>
      {/* Task 4C — show room name when available */}
      {slotData.room_name && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground/70 pl-3.5">
          <MapPin className="h-2.5 w-2.5" />
          {slotData.room_name}
        </p>
      )}
    </div>
  );
}

export default function TimetablePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useState(
    () => new URLSearchParams(window.location.search)
  );
  const [generationId, setGenerationId] = useState(
    searchParams.get("generation_id") || ""
  );
  const [data, setData] = useState({
    generation_id: "",
    timetable_data: {},
    days: [],
    time_slots: [],
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const load = async (id = "") => {
    setLoading(true);
    try {
      const res = await fetchTimetable(id);
      setData(res.data || { generation_id: "", timetable_data: {}, days: [], time_slots: [] });
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Unable to load timetable right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("generation_id") || "";
    setGenerationId(id);
    load(id);
  }, []);

  const divisionEntries = useMemo(
    () => Object.entries(data.timetable_data || {}),
    [data.timetable_data]
  );

  const onSubmit = (event) => {
    event.preventDefault();
    const nextId = generationId.trim();
    const url = nextId
      ? `${window.location.pathname}?generation_id=${encodeURIComponent(nextId)}`
      : window.location.pathname;
    window.history.pushState({}, "", url);
    load(nextId);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>View Timetable</CardTitle>
          <CardDescription>
            Inspect generated timetable data directly from the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={onSubmit}>
            <div className="w-full md:max-w-sm">
              <Label htmlFor="generation_id">Generation ID</Label>
              <Input
                id="generation_id"
                value={generationId}
                onChange={(e) => setGenerationId(e.target.value)}
                placeholder="Leave blank for latest generation"
              />
            </div>
            <Button type="submit">Load Timetable</Button>
          </form>
          {status && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {status}
            </p>
          )}
          {data.generation_id && (
            <p className="mt-3 text-sm text-muted-foreground">
              Loaded:{" "}
              <span className="font-medium">{formatGenerationId(data.generation_id)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        /* Skeleton loading (Task 8B) */
        <Card>
          <CardContent className="space-y-3 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-6 rounded-md bg-muted animate-pulse" />
            ))}
          </CardContent>
        </Card>
      ) : divisionEntries.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={CalendarX}
              title="No timetable generated yet"
              description="Go to Generate Timetable to create your first schedule."
              action={{ label: "Generate Timetable", onClick: () => navigate("/generate") }}
            />
          </CardContent>
        </Card>
      ) : (
        divisionEntries.map(([divisionName, dayMap]) => (
          <Card key={divisionName}>
            <CardHeader>
              <CardTitle>{divisionName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-2">Time Slot</th>
                      {data.days.map((day) => (
                        <th key={day} className="p-2">{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.time_slots.map((slot, slotIndex) => (
                      <tr key={slot} className="border-b align-top">
                        <td className="p-2 font-medium text-xs whitespace-nowrap">{slot}</td>
                        {data.days.map((day) => {
                          const slotData =
                            dayMap?.[day]?.[slotIndex] ||
                            dayMap?.[day]?.[String(slotIndex)] ||
                            null;
                          return (
                            <td key={`${day}-${slotIndex}`} className="p-2 min-w-[110px]">
                              <TimetableCell slotData={slotData} slotLabel={slot} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
