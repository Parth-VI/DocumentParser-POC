import { Link } from "@tanstack/react-router";
import { FileSearch, Mail } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Schema studio", icon: FileSearch },
  { to: "/mail", label: "Mail inbox", icon: Mail },
] as const;

/**
 * Shared top bar. `right` carries per-screen controls (the extract shortcut hint,
 * a sync button) so each screen keeps its own affordances without duplicating the
 * brand, nav, and theme switch.
 */
export function AppHeader({ subtitle, right }: { subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0">
          <FileSearch className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold leading-tight truncate">Document Extraction Studio</h1>
          <p className="text-xs text-muted-foreground truncate">
            {subtitle ?? "Define your schema → upload → extract structured data"}
          </p>
        </div>

        <nav className="ml-4 hidden sm:flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              // activeOptions.exact keeps "/" from lighting up on /mail.
              activeOptions={{ exact: to === "/" }}
              className="px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors inline-flex items-center gap-1.5"
              activeProps={{ className: cn("bg-accent text-accent-foreground font-medium") }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
