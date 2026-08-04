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
    <div className="max-h-[60vh] overflow-auto rounded-md border border-line-soft bg-wash p-3 font-mono text-xs leading-relaxed">
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
    value === null ? "null" : typeof value === "string" ? `"${value}"` : String(value);
  const color =
    typeof value === "string"
      ? "text-ink"
      : typeof value === "number"
        ? "text-highlight"
        : typeof value === "boolean"
          ? "text-flag"
          : "text-faint";

  return (
    <span
      ref={rowRef}
      className={`inline-flex items-center gap-1 rounded px-1 transition-colors ${
        active ? "bg-highlight-tint ring-1 ring-highlight-line" : ""
      }`}
    >
      <span className={color}>{display}</span>
      {locs && locs.length > 0 && (
        <button
          onClick={() => ctx.onLocate(path)}
          title={
            active
              ? "Hide highlight"
              : `Show where this came from — page ${locs.map((l) => l.page).join(", ")}`
          }
          className={`inline-flex h-4 w-4 items-center justify-center rounded transition-colors ${
            active
              ? "text-highlight hover:opacity-80"
              : "text-highlight/70 hover:bg-highlight-tint hover:text-highlight"
          }`}
          type="button"
        >
          {active ? <LocateFixed className="h-3 w-3" /> : <Locate className="h-3 w-3" />}
        </button>
      )}
    </span>
  );
}
