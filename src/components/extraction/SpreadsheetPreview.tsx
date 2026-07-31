import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 100;
const MAX_COLS = 50;

export function SpreadsheetPreview({ file, className }: { file: File; className?: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setPage(0);
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const ext = file.name.toLowerCase().split(".").pop() ?? "";
        const parsed = ext === "csv" || file.type === "text/csv" || file.type === "application/csv"
          ? await parseCsv(file)
          : await parseExcelLike(file);
        if (cancelled) return;
        // Take only the first sheet, clip columns for safety, keep all rows.
        const firstSheet = parsed[0]?.rows ?? [];
        setRows(firstSheet.map((r) => r.slice(0, MAX_COLS)));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to parse spreadsheet");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  const colCount = useMemo(() => {
    if (!rows) return 0;
    return rows.reduce((m, r) => Math.max(m, r.length), 0);
  }, [rows]);

  const totalPages = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const pageStart = page * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, rows?.length ?? 0);
  const visibleRows = rows ? rows.slice(pageStart, pageEnd) : [];

  const download = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`rounded-lg border bg-background overflow-hidden flex flex-col ${className ?? ""}`}>
      <div className="border-b bg-card/60 px-3 py-1.5 flex items-center gap-2 text-xs flex-wrap">
        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="font-medium truncate">{file.name}</span>
        {rows && (
          <span className="text-muted-foreground">
            · {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
          </span>
        )}
        <Button variant="ghost" size="sm" className="h-7 ml-auto" onClick={download}>
          <Download className="h-3.5 w-3.5" /> Download
        </Button>
      </div>

      <div className="overflow-auto max-h-[70vh] min-h-[200px]">
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Parsing spreadsheet…
          </div>
        )}
        {error && (
          <div className="p-4 text-xs text-rose-600 dark:text-rose-400">Could not parse file: {error}</div>
        )}
        {!loading && !error && rows && rows.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground">Sheet is empty.</div>
        )}
        {!loading && !error && rows && rows.length > 0 && (
          <SheetTable rows={visibleRows} colCount={colCount} startRow={pageStart} />
        )}
      </div>

      {rows && rows.length > PAGE_SIZE && (
        <div className="border-t bg-card/60 px-3 py-1.5 flex items-center gap-2 text-xs">
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-muted-foreground">
            Rows {(pageStart + 1).toLocaleString()}–{pageEnd.toLocaleString()} of {rows.length.toLocaleString()}
            <span className="mx-2">·</span>
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 ml-auto"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function SheetTable({ rows, colCount, startRow }: { rows: string[][]; colCount: number; startRow: number }) {
  const cols = Array.from({ length: colCount }, (_, i) => i);
  return (
    <table className="text-xs w-full border-collapse">
      <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10">
        <tr>
          <th className="border-b border-r px-2 py-1.5 text-muted-foreground/70 font-normal w-10 text-center">#</th>
          {cols.map((i) => (
            <th
              key={i}
              className="border-b border-r px-2 py-1.5 text-muted-foreground/70 font-normal text-center min-w-[6rem]"
            >
              {colLabel(i)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className="hover:bg-accent/40">
            <td className="border-b border-r px-2 py-1 text-muted-foreground/60 text-center tabular-nums">
              {startRow + ri + 1}
            </td>
            {cols.map((ci) => (
              <td key={ci} className="border-b border-r px-2 py-1 align-top whitespace-pre-wrap break-words">
                {row[ci] ?? ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function colLabel(n: number): string {
  let s = "";
  let v = n + 1;
  while (v > 0) {
    const r = (v - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

/* ───────────── parsers ───────────── */

type Sheet = { name: string; rows: string[][] };

async function parseCsv(file: File): Promise<Sheet[]> {
  const text = await file.text();
  return [{ name: "CSV", rows: parseCsvText(text) }];
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = []; cur = "";
      } else {
        cur += ch;
      }
    }
  }
  if (cur !== "" || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

async function parseExcelLike(file: File): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", blankrows: false, raw: false });
    return { name, rows };
  });
}
