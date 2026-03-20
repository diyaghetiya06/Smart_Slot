import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarX, MapPin, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import EmptyState from "@/components/ui/EmptyState";

export default function SharePage() {
  const { token } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("No share token in URL.");
      setLoading(false);
      return;
    }

    // Fetch without Authorization header (public endpoint).
    fetch(`/api/share/${token}`, { headers: { "Content-Type": "application/json" } })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(json.message || "Invalid or expired share link.");
        } else {
          setData(json.data);
        }
      })
      .catch(() => setError("Unable to load shared timetable."))
      .finally(() => setLoading(false));
  }, [token]);

  const divisionEntries = useMemo(
    () => Object.entries(data?.timetable_data || {}),
    [data]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="max-w-md w-full">
          <CardContent className="p-8">
            <EmptyState
              icon={Lock}
              title="Link unavailable"
              description={error}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Shared Timetable</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generation:{" "}
            <span className="font-mono font-medium">{data?.generation_id}</span>
          </p>
        </div>

        {divisionEntries.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <EmptyState
                icon={CalendarX}
                title="No timetable data"
                description="This shared link does not contain any timetable data."
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
                        {(data?.days || []).map((day) => (
                          <th key={day} className="p-2">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.time_slots || []).map((slot, slotIndex) => (
                        <tr key={slot} className="border-b align-top">
                          <td className="p-2 font-medium text-xs whitespace-nowrap">{slot}</td>
                          {(data?.days || []).map((day) => {
                            const cell =
                              dayMap?.[day]?.[slotIndex] ||
                              dayMap?.[day]?.[String(slotIndex)] ||
                              null;
                            return (
                              <td key={`${day}-${slotIndex}`} className="p-2 min-w-[110px]">
                                {cell ? (
                                  <div className="space-y-0.5">
                                    <p className="font-medium text-xs">{cell.subject_name}</p>
                                    <p className="text-xs text-muted-foreground">{cell.faculty_name}</p>
                                    {cell.room_name && (
                                      <p className="flex items-center gap-1 text-xs text-muted-foreground/70">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {cell.room_name}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
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

        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by Smart Slot
        </p>
      </div>
    </div>
  );
}
