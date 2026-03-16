import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchTimetable } from "@/api/timetable";

function cellContent(slotData) {
  if (!slotData) return "-";
  return `${slotData.subject_name} (${slotData.faculty_name})`;
}

export default function TimetablePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [generationId, setGenerationId] = useState(searchParams.get("generation_id") || "");
  const [data, setData] = useState({ generation_id: "", timetable_data: {}, days: [], time_slots: [] });
  const [status, setStatus] = useState("");

  const load = async (id = "") => {
    try {
      const res = await fetchTimetable(id);
      setData(res.data || { generation_id: "", timetable_data: {}, days: [], time_slots: [] });
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Unable to load timetable right now.");
    }
  };

  useEffect(() => {
    load(generationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const divisionEntries = useMemo(() => Object.entries(data.timetable_data || {}), [data.timetable_data]);

  const onSubmit = (event) => {
    event.preventDefault();
    const nextId = generationId.trim();
    setSearchParams(nextId ? { generation_id: nextId } : {});
    load(nextId);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>View Timetable</CardTitle>
          <CardDescription>Inspect generated timetable data directly from the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={onSubmit}>
            <div className="w-full md:max-w-sm">
              <Label htmlFor="generation_id">Generation Id</Label>
              <Input
                id="generation_id"
                value={generationId}
                onChange={(e) => setGenerationId(e.target.value)}
                placeholder="Leave blank for latest generation"
              />
            </div>
            <Button type="submit">Load Timetable</Button>
          </form>
          {status && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{status}</p>}
          <p className="mt-3 text-sm text-muted-foreground">Loaded Generation: {data.generation_id || "None"}</p>
        </CardContent>
      </Card>

      {divisionEntries.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">No timetable data found for this generation.</CardContent>
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
                        <td className="p-2 font-medium">{slot}</td>
                        {data.days.map((day) => {
                          const slotData = dayMap?.[day]?.[slotIndex] || dayMap?.[day]?.[String(slotIndex)] || null;
                          return <td key={`${day}-${slotIndex}`} className="p-2">{cellContent(slotData)}</td>;
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
