import { useState } from "react";
import { SearchX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import SubjectTypeBadge from "@/components/ui/SubjectTypeBadge";
import { fetchSearch } from "@/api/search";
import { formatSemester, formatProgram } from "@/lib/utils";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState("");

  const hasResults = results && (results.faculty.length > 0 || results.subjects.length > 0 || results.divisions.length > 0);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!query.trim()) { setStatus("Enter a search term."); setResults(null); return; }
    try {
      const res = await fetchSearch(query.trim());
      setResults(res.data?.results || { faculty: [], subjects: [], divisions: [] });
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Unable to search right now.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Search</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={onSubmit}>
            <div className="w-full md:max-w-lg">
              <Label htmlFor="search_query">Search term</Label>
              <Input id="search_query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Faculty, subject, or division" />
            </div>
            <Button type="submit">Search</Button>
          </form>
          {status && <p className="mt-3 rounded-md border border-border bg-muted p-2 text-sm">{status}</p>}
        </CardContent>
      </Card>

      {results !== null && !hasResults && (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              icon={SearchX}
              title="No results found"
              description="Try a different search term — search by faculty name, subject, or division."
            />
          </CardContent>
        </Card>
      )}

      {hasResults && (
        <section className="grid gap-4 lg:grid-cols-3">
          {results.faculty.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Faculty ({results.faculty.length})</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {results.faculty.map((item) => (
                  <div key={item.id} className="rounded-md border p-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.subject}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {results.subjects.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Subjects ({results.subjects.length})</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {results.subjects.map((item) => (
                  <div key={item.id} className="rounded-md border p-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.faculty_name}</p>
                    </div>
                    <SubjectTypeBadge type={item.subject_type} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {results.divisions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Divisions ({results.divisions.length})</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                {results.divisions.map((item) => (
                  <div key={item.id} className="rounded-md border p-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatSemester(item.semester)} — {formatProgram(item.program)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
