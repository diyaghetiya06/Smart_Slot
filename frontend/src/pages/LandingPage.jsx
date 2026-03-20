import { useNavigate } from "react-router-dom";
import { Calendar, Zap, BarChart3, Shield, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Zap,
    title: "AI-Powered Scheduling",
    desc: "Generate conflict-free timetables in seconds using our intelligent scheduling algorithm.",
  },
  {
    icon: Users,
    title: "Faculty Management",
    desc: "Manage faculty availability, workload limits, and subject assignments from one place.",
  },
  {
    icon: Clock,
    title: "Flexible Time Slots",
    desc: "Configure working days, time slots, and break periods to match your institution's schedule.",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    desc: "Visualise faculty utilisation, slot distribution, and identify scheduling bottlenecks.",
  },
  {
    icon: Shield,
    title: "Conflict Detection",
    desc: "Automatically detect and flag double-bookings, room conflicts, and overloaded faculty.",
  },
  {
    icon: Calendar,
    title: "Shareable Timetables",
    desc: "Publish and share timetables with students and staff via a secure public link.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">SmartSlot</span>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
              Log In
            </Button>
            <Button size="sm" onClick={() => navigate("/register")}>
              Get Started Free
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Automated timetable scheduling for educational institutions
        </div>

        <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight md:text-6xl">
          Build perfect timetables{" "}
          <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
            in minutes
          </span>
        </h1>

        <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
          SmartSlot automates the complex task of academic scheduling — eliminating conflicts,
          balancing workloads, and saving your team hours every semester.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button size="lg" className="px-8" onClick={() => navigate("/register")}>
            Start for Free
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/login")}>
            Sign In
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-6 py-12 md:grid-cols-4">
          {[
            { stat: "< 5s", label: "Timetable generation" },
            { stat: "0", label: "Scheduling conflicts" },
            { stat: "100%", label: "Constraint coverage" },
            { stat: "∞", label: "Timetable revisions" },
          ].map(({ stat, label }) => (
            <div key={label} className="text-center">
              <p className="text-3xl font-extrabold text-primary">{stat}</p>
              <p className="mt-1 text-sm text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-2 text-center text-3xl font-bold">Everything you need</h2>
        <p className="mb-12 text-center text-muted-foreground">
          A complete scheduling platform built for modern educational institutions.
        </p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group rounded-xl border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to simplify scheduling?</h2>
          <p className="mb-8 text-muted-foreground">
            Join thousands of institutions that trust SmartSlot to build their academic calendars.
          </p>
          <Button size="lg" className="px-10" onClick={() => navigate("/register")}>
            Create Free Account
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="font-semibold text-foreground">SmartSlot</span>
          </div>
          <p>© {new Date().getFullYear()} SmartSlot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
