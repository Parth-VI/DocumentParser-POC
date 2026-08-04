import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Documents", exact: true, count: undefined },
  { to: "/mail", label: "Inbox", exact: false, count: 2 },
] as const;

/**
 * Shared top bar — quiet and editorial. `right` carries per-screen controls
 * (an extract-shortcut hint, a sync button) so each screen keeps its own
 * affordances without duplicating the wordmark, nav, and theme switch.
 */
export function AppHeader({ right }: { subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-13 max-w-[1400px] flex-wrap items-center gap-x-7 gap-y-2 px-5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Document Studio home">
          <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-ink text-paper">
            <FileText className="h-3 w-3" strokeWidth={1.75} />
          </span>
          <span className="text-[13.5px] font-medium tracking-[-0.01em] text-ink">
            Document Studio
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          {NAV.map(({ to, label, exact, count }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="group inline-flex items-center border-b border-transparent py-0.5 text-[13px] text-faint transition-colors hover:text-ink"
              activeProps={{
                className: cn("!border-ink font-medium !text-ink"),
              }}
            >
              {label}
              {count != null && (
                <span className="ml-1.5 font-mono text-[10.5px] text-faint group-hover:text-muted-foreground">
                  {count}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
