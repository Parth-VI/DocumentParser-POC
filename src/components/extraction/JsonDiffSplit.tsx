import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { copyText } from "@/lib/clipboard";
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Check,
  Copy,
  Wand2,
  Maximize2,
  Minimize2,
  ChevronsDownUp,
  ChevronsUpDown,
  Link2,
  Link2Off,
  Search,
  X,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  type GroupImperativeHandle,
} from "react-resizable-panels";
import { ResizableHandle } from "@/components/ui/resizable";

type Status = "same" | "added" | "removed" | "changed" | "type";

type Cell = {
  indent: number;
  text: string;
  status: Status;
  path: string;
  collapsible?: boolean;
  collapsed?: boolean;
};

type Row = {
  left: Cell | null;
  right: Cell | null;
  status: Status;
  path: string;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
function fmtPrimitive(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "string") return `"${v.replace(/"/g, '\\"')}"`;
  return String(v);
}
function buildKeyLabel(key: string | number | null): string {
  if (key === null) return "";
  if (typeof key === "number") return "";
  return `"${key}": `;
}

function renderOneSide(
  value: unknown,
  key: string | number | null,
  indent: number,
  path: string,
  status: Status,
  side: "left" | "right",
  collapsed: Set<string>,
  rows: Row[],
  trailingComma: boolean,
) {
  const label = buildKeyLabel(key);
  const comma = trailingComma ? "," : "";
  if (isObj(value)) {
    const isCollapsed = collapsed.has(path);
    const keys = Object.keys(value);
    if (isCollapsed || keys.length === 0) {
      pushRow(rows, side, {
        indent,
        text: `${label}{${keys.length ? "…" : ""}}${comma}`,
        status,
        path,
        collapsible: keys.length > 0,
        collapsed: isCollapsed,
      });
      return;
    }
    pushRow(rows, side, {
      indent,
      text: `${label}{`,
      status,
      path,
      collapsible: true,
      collapsed: false,
    });
    keys.forEach((k, i) =>
      renderOneSide(
        value[k],
        k,
        indent + 1,
        path ? `${path}.${k}` : k,
        status,
        side,
        collapsed,
        rows,
        i < keys.length - 1,
      ),
    );
    pushRow(rows, side, { indent, text: `}${comma}`, status, path: path + "::close" });
    return;
  }
  if (Array.isArray(value)) {
    const isCollapsed = collapsed.has(path);
    if (isCollapsed || value.length === 0) {
      pushRow(rows, side, {
        indent,
        text: `${label}[${value.length ? "…" : ""}]${comma}`,
        status,
        path,
        collapsible: value.length > 0,
        collapsed: isCollapsed,
      });
      return;
    }
    pushRow(rows, side, {
      indent,
      text: `${label}[`,
      status,
      path,
      collapsible: true,
      collapsed: false,
    });
    value.forEach((v, i) =>
      renderOneSide(
        v,
        i,
        indent + 1,
        `${path}[${i}]`,
        status,
        side,
        collapsed,
        rows,
        i < value.length - 1,
      ),
    );
    pushRow(rows, side, { indent, text: `]${comma}`, status, path: path + "::close" });
    return;
  }
  pushRow(rows, side, { indent, text: `${label}${fmtPrimitive(value)}${comma}`, status, path });
}

function pushRow(rows: Row[], side: "left" | "right", cell: Cell) {
  rows.push(
    side === "left"
      ? { left: cell, right: null, status: cell.status, path: cell.path }
      : { left: null, right: cell, status: cell.status, path: cell.path },
  );
}

function walk(
  left: unknown,
  right: unknown,
  hasL: boolean,
  hasR: boolean,
  key: string | number | null,
  indent: number,
  path: string,
  collapsed: Set<string>,
  rows: Row[],
  trailingCommaL: boolean,
  trailingCommaR: boolean,
) {
  if (!hasL && hasR) {
    renderOneSide(right, key, indent, path, "added", "right", collapsed, rows, trailingCommaR);
    return;
  }
  if (hasL && !hasR) {
    renderOneSide(left, key, indent, path, "removed", "left", collapsed, rows, trailingCommaL);
    return;
  }
  const lKind = kindOf(left);
  const rKind = kindOf(right);
  const label = buildKeyLabel(key);

  if (lKind !== rKind) {
    const before = rows.length;
    renderOneSide(left, key, indent, path, "type", "left", collapsed, rows, trailingCommaL);
    const mid = rows.length;
    renderOneSide(right, key, indent, path, "type", "right", collapsed, rows, trailingCommaR);
    const leftRows = rows.slice(before, mid).map((r) => r.left!);
    const rightRows = rows.slice(mid).map((r) => r.right!);
    rows.length = before;
    const max = Math.max(leftRows.length, rightRows.length);
    for (let i = 0; i < max; i++) {
      rows.push({ left: leftRows[i] ?? null, right: rightRows[i] ?? null, status: "type", path });
    }
    return;
  }

  if (isObj(left) && isObj(right)) {
    const isCollapsed = collapsed.has(path);
    const isSame = JSON.stringify(left) === JSON.stringify(right);
    const status: Status = isSame ? "same" : "changed";
    const lComma = trailingCommaL ? "," : "";
    const rComma = trailingCommaR ? "," : "";
    const lKeys = Object.keys(left);
    const rKeys = Object.keys(right);

    if (isCollapsed || (lKeys.length === 0 && rKeys.length === 0)) {
      pushPair(
        rows,
        {
          indent,
          text: `${label}{${lKeys.length ? "…" : ""}}${lComma}`,
          status,
          path,
          collapsible: lKeys.length > 0 || rKeys.length > 0,
          collapsed: isCollapsed,
        },
        {
          indent,
          text: `${label}{${rKeys.length ? "…" : ""}}${rComma}`,
          status,
          path,
          collapsible: lKeys.length > 0 || rKeys.length > 0,
          collapsed: isCollapsed,
        },
      );
      return;
    }

    pushPair(
      rows,
      { indent, text: `${label}{`, status, path, collapsible: true, collapsed: false },
      { indent, text: `${label}{`, status, path, collapsible: true, collapsed: false },
    );

    const seen = new Set<string>();
    const unionKeys: string[] = [];
    for (const k of lKeys)
      if (!seen.has(k)) {
        seen.add(k);
        unionKeys.push(k);
      }
    for (const k of rKeys)
      if (!seen.has(k)) {
        seen.add(k);
        unionKeys.push(k);
      }

    unionKeys.forEach((k, i) => {
      const last = i === unionKeys.length - 1;
      walk(
        (left as Record<string, unknown>)[k],
        (right as Record<string, unknown>)[k],
        k in left,
        k in right,
        k,
        indent + 1,
        path ? `${path}.${k}` : k,
        collapsed,
        rows,
        !last && k in left,
        !last && k in right,
      );
    });

    pushPair(
      rows,
      { indent, text: `}${lComma}`, status, path: path + "::close" },
      { indent, text: `}${rComma}`, status, path: path + "::close" },
    );
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const isCollapsed = collapsed.has(path);
    const isSame = JSON.stringify(left) === JSON.stringify(right);
    const status: Status = isSame ? "same" : "changed";
    const lComma = trailingCommaL ? "," : "";
    const rComma = trailingCommaR ? "," : "";
    const maxLen = Math.max(left.length, right.length);

    if (isCollapsed || maxLen === 0) {
      pushPair(
        rows,
        {
          indent,
          text: `${label}[${left.length ? "…" : ""}]${lComma}`,
          status,
          path,
          collapsible: maxLen > 0,
          collapsed: isCollapsed,
        },
        {
          indent,
          text: `${label}[${right.length ? "…" : ""}]${rComma}`,
          status,
          path,
          collapsible: maxLen > 0,
          collapsed: isCollapsed,
        },
      );
      return;
    }

    pushPair(
      rows,
      { indent, text: `${label}[`, status, path, collapsible: true, collapsed: false },
      { indent, text: `${label}[`, status, path, collapsible: true, collapsed: false },
    );
    for (let i = 0; i < maxLen; i++) {
      const last = i === maxLen - 1;
      walk(
        left[i],
        right[i],
        i < left.length,
        i < right.length,
        i,
        indent + 1,
        `${path}[${i}]`,
        collapsed,
        rows,
        !last && i < left.length - 1,
        !last && i < right.length - 1,
      );
    }
    pushPair(
      rows,
      { indent, text: `]${lComma}`, status, path: path + "::close" },
      { indent, text: `]${rComma}`, status, path: path + "::close" },
    );
    return;
  }

  const same = JSON.stringify(left) === JSON.stringify(right);
  const status: Status = same ? "same" : "changed";
  pushPair(
    rows,
    { indent, text: `${label}${fmtPrimitive(left)}${trailingCommaL ? "," : ""}`, status, path },
    { indent, text: `${label}${fmtPrimitive(right)}${trailingCommaR ? "," : ""}`, status, path },
  );
}

function pushPair(rows: Row[], l: Cell, r: Cell) {
  rows.push({ left: l, right: r, status: l.status, path: l.path });
}

// Collect every collapsible path (objects/arrays) from a value tree
function collectCollapsiblePaths(value: unknown, path: string, out: Set<string>) {
  if (isObj(value)) {
    if (Object.keys(value).length > 0) out.add(path);
    for (const k of Object.keys(value)) {
      collectCollapsiblePaths(
        (value as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
        out,
      );
    }
  } else if (Array.isArray(value)) {
    if (value.length > 0) out.add(path);
    value.forEach((v, i) => collectCollapsiblePaths(v, `${path}[${i}]`, out));
  }
}

function statusBg(s: Status, hasContent: boolean): string {
  if (!hasContent) return "bg-muted/20";
  switch (s) {
    case "added":
      return "bg-emerald-500/10 border-l-2 border-emerald-500/60";
    case "removed":
      return "bg-red-500/10 border-l-2 border-red-500/60";
    case "changed":
      return "bg-amber-500/10 border-l-2 border-amber-500/60";
    case "type":
      return "bg-purple-500/10 border-l-2 border-purple-500/60";
    default:
      return "";
  }
}

function highlightLine(text: string, query: string): string {
  const esc = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  let html = esc
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span style="color:#4f46e5">$1</span>$2')
    .replace(/:\s(&quot;[^&]*?&quot;)/g, ': <span style="color:#059669">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span style="color:#d97706">$1</span>')
    .replace(/(^|[\s:[,])(-?\d+\.?\d*)\b/g, '$1<span style="color:#0891b2">$2</span>');
  if (query.trim()) {
    try {
      const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
      html = html.replace(
        re,
        '<mark style="background:#fde68a;color:inherit;border-radius:2px">$1</mark>',
      );
    } catch {
      /* ignore */
    }
  }
  return html;
}

type EditorRow = {
  ln: number | null;
  cell: Cell | null;
  status: Status;
  rowIndex: number;
  isSummary?: boolean;
  summaryCount?: number;
};

function buildEditorRows(
  rows: Row[],
  side: "left" | "right",
  showOnlyDiffs: boolean,
  matchedRowIndexes: Set<number> | null,
): EditorRow[] {
  let counter = 0;
  const lineNos: Array<number | null> = rows.map((r) => {
    const cell = side === "left" ? r.left : r.right;
    if (cell) {
      counter += 1;
      return counter;
    }
    return null;
  });

  const out: EditorRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    const isHidden =
      (showOnlyDiffs && r.status === "same") || (matchedRowIndexes && !matchedRowIndexes.has(i));
    if (isHidden) {
      let j = i;
      while (
        j < rows.length &&
        ((showOnlyDiffs && rows[j].status === "same") ||
          (matchedRowIndexes && !matchedRowIndexes.has(j)))
      )
        j++;
      out.push({
        ln: null,
        cell: null,
        status: "same",
        rowIndex: i,
        isSummary: true,
        summaryCount: j - i,
      });
      i = j;
      continue;
    }
    const cell = side === "left" ? r.left : r.right;
    out.push({ ln: lineNos[i], cell, status: r.status, rowIndex: i });
    i++;
  }
  return out;
}

function autoFormat(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function JsonDiffSplit({ source }: { source: unknown }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [syncScroll, setSyncScroll] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<"left" | "right" | null>(null);

  const parsed = useMemo(() => {
    if (!text.trim()) return { ok: true as const, value: undefined };
    try {
      return { ok: true as const, value: JSON.parse(text) as unknown };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }, [text]);

  const rows = useMemo<Row[]>(() => {
    if (!parsed.ok || parsed.value === undefined) return [];
    const out: Row[] = [];
    walk(source, parsed.value, true, true, null, 0, "", collapsed, out, false, false);
    return out;
  }, [source, parsed, collapsed]);

  const counts = useMemo(() => {
    const c = { added: 0, removed: 0, changed: 0, type: 0 };
    for (const r of rows) {
      if (r.status === "same") continue;
      const cell = r.left ?? r.right;
      if (!cell) continue;
      const isStructural = /^[{}\[\],]?$/.test(cell.text.trim()) || /[{[]$/.test(cell.text.trim());
      if (isStructural) continue;
      if (r.status === "added") c.added++;
      else if (r.status === "removed") c.removed++;
      else if (r.status === "changed") c.changed++;
      else if (r.status === "type") c.type++;
    }
    return c;
  }, [rows]);

  const matchedRowIndexes = useMemo<Set<number> | null>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<number>();
    rows.forEach((r, i) => {
      const lt = r.left?.text.toLowerCase() ?? "";
      const rt = r.right?.text.toLowerCase() ?? "";
      if (lt.includes(q) || rt.includes(q) || r.path.toLowerCase().includes(q)) set.add(i);
    });
    return set;
  }, [rows, query]);

  const togglePath = useCallback((p: string) => {
    setCollapsed((curr) => {
      const next = new Set(curr);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const allCollapsiblePaths = useMemo(() => {
    const set = new Set<string>();
    collectCollapsiblePaths(source, "", set);
    if (parsed.ok && parsed.value !== undefined) collectCollapsiblePaths(parsed.value, "", set);
    return set;
  }, [source, parsed]);

  const collapseAll = () => setCollapsed(new Set(allCollapsiblePaths));
  const expandAll = () => setCollapsed(new Set());

  const leftRows = useMemo(
    () => buildEditorRows(rows, "left", showOnlyDiffs, matchedRowIndexes),
    [rows, showOnlyDiffs, matchedRowIndexes],
  );
  const rightRows = useMemo(
    () => buildEditorRows(rows, "right", showOnlyDiffs, matchedRowIndexes),
    [rows, showOnlyDiffs, matchedRowIndexes],
  );

  const hasCompare = parsed.ok && parsed.value !== undefined;
  const leftFallback = useMemo(() => JSON.stringify(source, null, 2), [source]);

  const copyLeft = async () => {
    if (!(await copyText(JSON.stringify(source, null, 2)))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // Sync scrolling
  useEffect(() => {
    if (!syncScroll) return;
    const l = leftScrollRef.current;
    const r = rightScrollRef.current;
    if (!l || !r) return;
    const onL = () => {
      if (syncingRef.current === "right") return;
      syncingRef.current = "left";
      r.scrollTop = l.scrollTop;
      requestAnimationFrame(() => {
        syncingRef.current = null;
      });
    };
    const onR = () => {
      if (syncingRef.current === "left") return;
      syncingRef.current = "right";
      l.scrollTop = r.scrollTop;
      requestAnimationFrame(() => {
        syncingRef.current = null;
      });
    };
    l.addEventListener("scroll", onL);
    r.addEventListener("scroll", onR);
    return () => {
      l.removeEventListener("scroll", onL);
      r.removeEventListener("scroll", onR);
    };
  }, [syncScroll, leftRows, rightRows, editing]);

  // Esc closes fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const wrapperCls = fullscreen
    ? "fixed inset-x-0 bottom-[96px] top-[60px] z-30 bg-background p-3 flex flex-col gap-2 overflow-hidden"
    : "space-y-2";

  return (
    <div className={wrapperCls}>
      {/* Sticky smart toolbar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur rounded-lg border px-3 py-2 flex flex-wrap items-center gap-2 justify-between shadow-sm">
        <div className="flex items-center gap-2 text-[11px] flex-wrap">
          <span className="font-semibold text-muted-foreground uppercase tracking-wide">Diff</span>
          <span className="px-1.5 py-0.5 rounded font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            +{counts.added} added
          </span>
          <span className="px-1.5 py-0.5 rounded font-mono bg-red-500/15 text-red-700 dark:text-red-300">
            −{counts.removed} missing
          </span>
          <span className="px-1.5 py-0.5 rounded font-mono bg-amber-500/15 text-amber-700 dark:text-amber-300">
            ~{counts.changed} changed
          </span>
          {counts.type > 0 && (
            <span className="px-1.5 py-0.5 rounded font-mono bg-purple-500/15 text-purple-700 dark:text-purple-300">
              !{counts.type} type
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {/* Search */}
          {showSearch ? (
            <div className="flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find in diff…"
                className="h-6 w-36 bg-transparent outline-none text-xs"
              />
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setQuery("");
                  setShowSearch(false);
                }}
                title="Close search"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowSearch(true)}
            >
              <Search className="h-3 w-3" /> Search
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowOnlyDiffs((v) => !v)}
            disabled={!hasCompare}
          >
            {showOnlyDiffs ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showOnlyDiffs ? "All lines" : "Only diffs"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={expandAll}
            title="Expand all"
          >
            <ChevronsUpDown className="h-3 w-3" /> Expand
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={collapseAll}
            title="Collapse all"
          >
            <ChevronsDownUp className="h-3 w-3" /> Collapse
          </Button>
          <Button
            variant={syncScroll ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSyncScroll((v) => !v)}
            title="Toggle synchronized scrolling"
          >
            {syncScroll ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
            Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFullscreen((v) => !v)}
            title="Fullscreen"
          >
            {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Split editor */}
      <div
        className={`rounded-lg border bg-background overflow-hidden ${fullscreen ? "flex-1 min-h-0" : ""}`}
      >
        <ResizablePanelGroup
          orientation="horizontal"
          groupRef={groupRef}
          className={`flex h-full w-full ${fullscreen ? "" : "min-h-[420px] max-h-[70vh]"}`}
        >
          <ResizablePanel id="left" defaultSize={50} minSize={15}>
            <div className="h-full flex flex-col">
              <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 border-b bg-muted/70 backdrop-blur">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Extracted Result
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={copyLeft}
                    className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
                    title="Copy"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
              <div
                ref={leftScrollRef}
                className="flex-1 overflow-auto font-mono text-xs leading-[1.55]"
              >
                {hasCompare ? (
                  <EditorPane
                    rows={leftRows}
                    side="left"
                    onToggleCollapse={togglePath}
                    query={query}
                  />
                ) : (
                  <PlainPane text={leftFallback} query={query} />
                )}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="right" defaultSize={50} minSize={15}>
            <div className="h-full flex flex-col">
              <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 border-b bg-muted/70 backdrop-blur">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Compare JSON
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setText((t) => autoFormat(t))}
                    disabled={!text.trim() || !parsed.ok}
                    className="h-6 px-1.5 inline-flex items-center gap-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-40 text-[10px]"
                    title="Format JSON"
                  >
                    <Wand2 className="h-3 w-3" /> Format
                  </button>
                  <button
                    onClick={() => setText("")}
                    disabled={!text}
                    className="h-6 px-1.5 inline-flex items-center gap-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-40 text-[10px]"
                    title="Clear"
                  >
                    <Trash2 className="h-3 w-3" /> Clear
                  </button>
                  <button
                    onClick={() => setEditing((v) => !v)}
                    className="h-6 px-2 inline-flex items-center rounded hover:bg-accent text-muted-foreground text-[10px]"
                  >
                    {editing ? "Done" : "Edit"}
                  </button>
                </div>
              </div>
              <div
                ref={rightScrollRef}
                className="flex-1 overflow-auto font-mono text-xs leading-[1.55] relative"
              >
                {editing || !hasCompare ? (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={() => hasCompare && setEditing(false)}
                    autoFocus={editing}
                    placeholder={'Paste JSON here to compare…\n\n{\n  "example": "value"\n}'}
                    className="absolute inset-0 w-full h-full resize-none p-3 bg-transparent outline-none font-mono text-xs leading-[1.55]"
                    spellCheck={false}
                  />
                ) : (
                  <EditorPane
                    rows={rightRows}
                    side="right"
                    onToggleCollapse={togglePath}
                    query={query}
                    onClick={() => setEditing(true)}
                  />
                )}
                {!parsed.ok && (
                  <div className="absolute bottom-2 left-2 right-2 text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1">
                    Invalid JSON: {parsed.error}
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function PlainPane({ text, query }: { text: string; query: string }) {
  const lines = text.split("\n");
  return (
    <div className="min-w-full">
      {lines.map((l, i) => (
        <div key={i} className="flex">
          <span className="inline-block w-10 text-right pr-2 text-muted-foreground/50 select-none border-r mr-2">
            {i + 1}
          </span>
          <span
            className="whitespace-pre"
            dangerouslySetInnerHTML={{ __html: highlightLine(l, query) }}
          />
        </div>
      ))}
    </div>
  );
}

function EditorPane({
  rows,
  side,
  onToggleCollapse,
  query,
  onClick,
}: {
  rows: EditorRow[];
  side: "left" | "right";
  onToggleCollapse: (path: string) => void;
  query: string;
  onClick?: () => void;
}) {
  return (
    <div className="min-w-full" onClick={onClick}>
      {rows.map((er, idx) => {
        if (er.isSummary) {
          return (
            <div
              key={idx}
              className="flex text-[10px] italic text-muted-foreground bg-muted/30 border-y border-border/40 select-none"
            >
              <span className="inline-block w-10 text-right pr-2 select-none">⋯</span>
              <span className="px-2 py-0.5">
                {er.summaryCount} hidden line{er.summaryCount === 1 ? "" : "s"}
              </span>
            </div>
          );
        }
        const cell = er.cell;
        const bg = statusBg(er.status, !!cell);
        const isClose = cell?.path.endsWith("::close");
        const collapsibleTarget = cell?.collapsible && !isClose;
        return (
          <div key={idx} className={`flex items-start ${bg}`} style={{ minHeight: "1.55em" }}>
            <span className="inline-block w-10 shrink-0 text-right pr-2 text-muted-foreground/50 select-none border-r mr-1 text-[10px] pt-[2px]">
              {er.ln ?? ""}
            </span>
            <span className="flex-1 min-w-0">
              {cell ? (
                <span
                  className="whitespace-pre inline-flex items-start"
                  style={{ paddingLeft: cell.indent * 14 }}
                >
                  {collapsibleTarget ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCollapse(cell.path);
                      }}
                      className="mr-0.5 -ml-3 text-muted-foreground hover:text-foreground"
                    >
                      {cell.collapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  ) : null}
                  <span dangerouslySetInnerHTML={{ __html: highlightLine(cell.text, query) }} />
                </span>
              ) : (
                <span className="opacity-30 select-none">&nbsp;</span>
              )}
            </span>
          </div>
        );
      })}
      {rows.length === 0 && (
        <div className="p-4 text-[11px] text-muted-foreground italic">
          {side === "right" ? "Paste JSON to see side-by-side diff." : "No data."}
        </div>
      )}
    </div>
  );
}
