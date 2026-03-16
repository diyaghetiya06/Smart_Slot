import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchSearch } from "@/api/search";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ faculty: [], subjects: [], divisions: [] });
  const [status, setStatus] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!query.trim()) {
      setStatus("Enter a search term.");
      setResults({ faculty: [], subjects: [], divisions: [] });
      return;
    }

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

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Faculty ({results.faculty.length})</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            {results.faculty.length === 0 ? <p>No matches.</p> : results.faculty.map((item) => <p key={item.id}>{item.name} - {item.subject}</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Subjects ({results.subjects.length})</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            {results.subjects.length === 0 ? <p>No matches.</p> : results.subjects.map((item) => <p key={item.id}>{item.name} ({item.subject_type})</p>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Divisions ({results.divisions.length})</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            {results.divisions.length === 0 ? <p>No matches.</p> : results.divisions.map((item) => <p key={item.id}>{item.name} - Sem {item.semester}</p>)}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
