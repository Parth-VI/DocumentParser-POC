import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronRight, Locate, LocateFixed } from "lucide-react";
import type { FieldLocation } from "@/lib/extraction-types";
import { cn, humanizeKey } from "@/lib/utils";

/**
 * Reads the extracted result as a filled-in form, not as raw data:
 *  - top-level values become a clean label → value list,
 *  - nested objects become titled groups,
 *  - lists of rows (line items) become a simple table,
 *  - missing values read "Not found" instead of `null`.
 * Every leaf keeps its JSONPath so the "show on document" pins still work.
 */
type Props = {
  data: unknown;
  locationsByPath: Map<string, FieldLocation[]>;
  activePath: string | null;
  onLocate: (path: string) => void;
};

type Ctx = Omit<Props, "data">;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isRowArray = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every(isPlainObject);

export function ResultForm({ data, locationsByPath, activePath, onLocate }: Props) {
  const ctx: Ctx = { locationsByPath, activePath, onLocate };
  if (Array.isArray(data)) return <ListBlock label="Results" items={data} path="" ctx={ctx} />;
  if (!isPlainObject(data))
    return (
      <div className="rounded-md border border-line-soft bg-wash px-4 py-3 text-[14px]">
        <Value value={data} />
      </div>
    );
  return <ObjectBlock value={data} path="" ctx={ctx} />;
}

function ObjectBlock({
  value,
  path,
  ctx,
}: {
  value: Record<string, unknown>;
  path: string;
  ctx: Ctx;
}) {
  const blocks: React.ReactNode[] = [];
  let rows: React.ReactNode[] = [];
  const flushRows = () => {
    if (rows.length) {
      blocks.push(
        <div
          key={`rows-${blocks.length}`}
          className="divide-y divide-line-soft rounded-md border border-line-soft"
        >
          {rows}
        </div>,
      );
      rows = [];
    }
  };

  for (const [k, v] of Object.entries(value)) {
    const childPath = path ? `${path}.${k}` : k;
    if (isRowArray(v)) {
      flushRows();
      blocks.push(<ListBlock key={childPath} label={k} items={v} path={childPath} ctx={ctx} />);
    } else if (isPlainObject(v)) {
      flushRows();
      blocks.push(<Group key={childPath} label={k} value={v} path={childPath} ctx={ctx} />);
    } else {
      rows.push(<Row key={childPath} label={k} value={v} path={childPath} ctx={ctx} />);
    }
  }
  flushRows();
  return <div className="space-y-5">{blocks}</div>;
}

function Group({
  label,
  value,
  path,
  ctx,
}: {
  label: string;
  value: Record<string, unknown>;
  path: string;
  ctx: Ctx;
}) {
  return (
    <section>
      <SectionLabel>{humanizeKey(label)}</SectionLabel>
      <div className="mt-2">
        <ObjectBlock value={value} path={path} ctx={ctx} />
      </div>
    </section>
  );
}

function ListBlock({
  label,
  items,
  path,
  ctx,
}: {
  label: string;
  items: unknown[];
  path: string;
  ctx: Ctx;
}) {
  // A table only makes sense for rows of objects; fall back to a plain list otherwise.
  if (!isRowArray(items)) {
    return (
      <section>
        <SectionLabel>{humanizeKey(label)}</SectionLabel>
        <div className="mt-2 rounded-md border border-line-soft px-4 py-2.5 text-[14px]">
          {items.length ? (
            <Value value={items} />
          ) : (
            <span className="italic text-faint">Not found</span>
          )}
        </div>
      </section>
    );
  }

  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of items) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <SectionLabel>{humanizeKey(label)}</SectionLabel>
        <span className="text-[11.5px] text-faint">
          {items.length} {items.length === 1 ? "row" : "rows"}
        </span>
      </div>
      <RowTable cols={cols} items={items} path={path} ctx={ctx} />
    </section>
  );
}

/** True when a cell value holds more rows or a group — i.e. can't fit in a table cell. */
const isNested = (v: unknown) => isPlainObject(v) || isRowArray(v);

function RowTable({
  cols,
  items,
  path,
  ctx,
}: {
  cols: string[];
  items: Record<string, unknown>[];
  path: string;
  ctx: Ctx;
}) {
  const [openRows, setOpenRows] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Only add the expander column when at least one row has something to open.
  const expandable = items.some((row) => Object.values(row).some(isNested));
  const colSpan = cols.length + (expandable ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-md border border-line-soft">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-wash">
            {expandable && <th className="w-8 px-2 py-2" aria-hidden />}
            {cols.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-normal uppercase tracking-[0.06em] text-faint"
              >
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => {
            const nested = Object.entries(row).filter(([, v]) => isNested(v));
            const open = openRows.has(i);
            return (
              <Fragment key={i}>
                <tr className="border-t border-line-soft align-top">
                  {expandable && (
                    <td className="w-8 px-2 py-2">
                      {nested.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(i)}
                          aria-expanded={open}
                          title={open ? "Hide the lines in this row" : "Show the lines in this row"}
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-wash hover:text-ink"
                        >
                          <ChevronRight
                            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
                          />
                        </button>
                      )}
                    </td>
                  )}
                  {cols.map((c) => {
                    const v = row[c];
                    const cellPath = `${path}[${i}].${c}`;
                    return (
                      <td
                        key={c}
                        className={cn(
                          "px-3 py-2",
                          ctx.activePath === cellPath && "bg-highlight-tint",
                        )}
                      >
                        {isNested(v) ? (
                          <button
                            type="button"
                            onClick={() => toggle(i)}
                            aria-expanded={open}
                            className="whitespace-nowrap text-highlight underline decoration-highlight-line underline-offset-2 transition-colors hover:decoration-highlight"
                          >
                            {isRowArray(v)
                              ? `${v.length} ${v.length === 1 ? "line" : "lines"}`
                              : "details"}
                            {open ? " —" : " +"}
                          </button>
                        ) : (
                          <span
                            className={cn(
                              "flex items-center gap-1.5",
                              typeof v === "number" && "justify-end",
                            )}
                          >
                            <Cell value={v} />
                            <PinButton path={cellPath} ctx={ctx} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {open && nested.length > 0 && (
                  <tr className="border-t border-line-soft">
                    <td colSpan={colSpan} className="bg-wash/60 px-4 py-4">
                      <div className="space-y-5">
                        {nested.map(([k, v]) => {
                          const childPath = `${path}[${i}].${k}`;
                          return isRowArray(v) ? (
                            <ListBlock key={k} label={k} items={v} path={childPath} ctx={ctx} />
                          ) : (
                            <Group
                              key={k}
                              label={k}
                              value={v as Record<string, unknown>}
                              path={childPath}
                              ctx={ctx}
                            />
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  label,
  value,
  path,
  ctx,
}: {
  label: string;
  value: unknown;
  path: string;
  ctx: Ctx;
}) {
  const active = ctx.activePath === path;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active]);

  const numeric = typeof value === "number";
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-baseline gap-4 px-4 py-2.5 transition-colors",
        active && "bg-highlight-tint",
      )}
    >
      <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">{humanizeKey(label)}</span>
      <span className={cn("text-right text-[14px] text-ink", numeric && "font-mono tabular-nums")}>
        <Value value={value} />
      </span>
      <PinButton path={path} ctx={ctx} />
    </div>
  );
}

/** The "show where this came from" pin — rendered only when the value has a source location. */
function PinButton({ path, ctx }: { path: string; ctx: Ctx }) {
  const locs = ctx.locationsByPath.get(path);
  const active = ctx.activePath === path;
  if (!locs?.length) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.onLocate(path)}
      title={
        active
          ? "Hide highlight"
          : `Show where this came from — page ${locs.map((l) => l.page).join(", ")}`
      }
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
        active
          ? "text-highlight"
          : "text-highlight/60 hover:bg-highlight-tint hover:text-highlight",
      )}
    >
      {active ? <LocateFixed className="h-3.5 w-3.5" /> : <Locate className="h-3.5 w-3.5" />}
    </button>
  );
}

function Cell({ value }: { value: unknown }) {
  const numeric = typeof value === "number";
  return (
    <span className={cn(numeric && "font-mono tabular-nums", numeric && "block text-right")}>
      <Value value={value} short />
    </span>
  );
}

/** Format a single value the way a person would expect to read it. */
function Value({ value, short }: { value: unknown; short?: boolean }) {
  if (value === null || value === undefined || value === "")
    return <span className="italic text-faint">{short ? "—" : "Not found"}</span>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (Array.isArray(value)) {
    if (value.length === 0)
      return <span className="italic text-faint">{short ? "—" : "Not found"}</span>;
    if (value.every((v) => v === null || typeof v !== "object")) return <>{value.join(", ")}</>;
    return (
      <span className="text-faint">
        {value.length} {value.length === 1 ? "item" : "items"}
      </span>
    );
  }
  if (typeof value === "object") return <span className="text-faint">details</span>;
  return <>{String(value)}</>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] uppercase tracking-[0.09em] text-faint">{children}</span>;
}
