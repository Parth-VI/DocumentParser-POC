import { useEffect, useRef } from "react";
import { Locate, LocateFixed } from "lucide-react";
import type { FieldLocation } from "@/lib/extraction-types";

type Props = {
  data: unknown;
  locationsByPath: Map<string, FieldLocation[]>;
  activePath: string | null;
  onLocate: (path: string) => void;
};

export function ResultView({ data, locationsByPath, activePath, onLocate }: Props) {
  return (
    <div className="font-mono text-xs rounded-lg border bg-muted/30 p-3 overflow-auto max-h-[60vh] leading-relaxed">
      {renderNode(data, "", { locationsByPath, activePath, onLocate })}
    </div>
  );
}

type Ctx = {
  locationsByPath: Map<string, FieldLocation[]>;
  activePath: string | null;
  onLocate: (path: string) => void;
};

function renderNode(value: unknown, path: string, ctx: Ctx): React.ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <div className="ml-3 border-l border-border/40 pl-3 mt-0.5">
        {value.map((v, i) => {
          const childPath = `${path}[${i}]`;
          return (
            <div key={i} className="flex flex-wrap items-baseline gap-x-1">
              <span className="text-muted-foreground/70">[{i}]</span>
              <div className="flex-1 min-w-0">{renderNode(v, childPath, ctx)}</div>
            </div>
          );
        })}
      </div>
    );
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
    return (
      <div className="ml-3 border-l border-border/40 pl-3 mt-0.5">
        {entries.map(([k, v]) => {
          const childPath = path ? `${path}.${k}` : k;
          return (
            <div key={k} className="flex flex-wrap items-baseline gap-x-1">
              <span className="font-semibold text-foreground">{k}:</span>
              <div className="flex-1 min-w-0">{renderNode(v, childPath, ctx)}</div>
            </div>
          );
        })}
      </div>
    );
  }
  return <Leaf value={value} path={path} ctx={ctx} />;
}

function Leaf({ value, path, ctx }: { value: unknown; path: string; ctx: Ctx }) {
  const locs = ctx.locationsByPath.get(path);
  const active = ctx.activePath === path;
  const rowRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active]);

  const display =
    value === null ? "null" :
    typeof value === "string" ? `"${value}"` :
    String(value);
  const color =
    typeof value === "string" ? "text-emerald-700 dark:text-emerald-300" :
    typeof value === "number" ? "text-cyan-700 dark:text-cyan-300" :
    typeof value === "boolean" ? "text-amber-700 dark:text-amber-300" :
    "text-muted-foreground";

  return (
    <span
      ref={rowRef}
      className={`inline-flex items-center gap-1 px-1 rounded transition-colors ${
        active ? "bg-amber-200/60 ring-1 ring-amber-400 dark:bg-amber-400/25 dark:ring-amber-400/70" : ""
      }`}
    >
      <span className={color}>{display}</span>
      {locs && locs.length > 0 && (
        <button
          onClick={() => ctx.onLocate(path)}
          title={active
            ? "Hide source highlight"
            : `Show source on page ${locs.map((l) => l.page).join(", ")}`}
          className={`h-4 w-4 inline-flex items-center justify-center rounded transition-colors ${
            active
              ? "text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
              : "text-primary/70 hover:text-primary hover:bg-primary/10"
          }`}
          type="button"
        >
          {active ? <LocateFixed className="h-3 w-3" /> : <Locate className="h-3 w-3" />}
        </button>
      )}
    </span>
  );
}
