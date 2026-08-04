import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Download,
  Eraser,
  FileText,
  Highlighter,
  Loader2,
  RotateCw,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FieldLocation } from "@/lib/extraction-types";

type Tool = "highlight" | "box" | "arrow" | "eraser";
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

type Annotation =
  | { id: string; kind: "highlight"; page: number; rect: Rect; color: string }
  | { id: string; kind: "box"; page: number; rect: Rect; color: string }
  | { id: string; kind: "arrow"; page: number; from: Point; to: Point; color: string };

type PageInfo = { baseWidth: number; baseHeight: number };

const TOOLS: { key: Tool; label: string; icon: LucideIcon }[] = [
  { key: "highlight", label: "Highlight", icon: Highlighter },
  { key: "box", label: "Box", icon: Square },
  { key: "arrow", label: "Arrow", icon: ArrowUpRight },
  { key: "eraser", label: "Eraser", icon: Eraser },
];

const COLORS: { key: string; label: string }[] = [
  { key: "#fde68a", label: "Yellow" },
  { key: "#bbf7d0", label: "Green" },
  { key: "#bfdbfe", label: "Blue" },
  { key: "#fbcfe8", label: "Pink" },
  { key: "#fed7aa", label: "Orange" },
  { key: "#ef4444", label: "Red" },
  { key: "#111827", label: "Black" },
];

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

let _aid = 0;
const newAid = () => `a${(_aid++).toString(36)}`;

type DocumentPreviewProps = {
  file: File | null;
  className?: string;
  /** Source highlights from the extraction response. null = no source-location data. */
  sourceHighlights?: FieldLocation[] | null;
  /** When set, only locations matching this path are rendered as a passive highlight. */
  activeLocationPath?: string | null;
};

export function DocumentPreview({
  file,
  className,
  sourceHighlights,
  activeLocationPath,
}: DocumentPreviewProps) {
  const [isPdf, setIsPdf] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scale, setScale] = useState(1.25);
  const [rotation, setRotation] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<Tool | null>("highlight");
  const [color, setColor] = useState(COLORS[0].key);
  const [draft, setDraft] = useState<{ page: number; start: Point; cur: Point } | null>(null);
  const [erasing, setErasing] = useState(false);

  const pdfDocRef = useRef<unknown>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const renderTokenRef = useRef(0);

  // Load file
  useEffect(() => {
    setAnnotations([]);
    setScale(1.25);
    setRotation(0);
    setError(null);
    setPages([]);
    setImageUrl(null);
    setIsPdf(false);
    pdfDocRef.current = null;
    canvasRefs.current = [];

    if (!file) return;

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      const img = new Image();
      img.onload = () => setPages([{ baseWidth: img.naturalWidth, baseHeight: img.naturalHeight }]);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    }

    if (file.type === "application/pdf") {
      setIsPdf(true);
      setLoading(true);
      let cancelled = false;
      (async () => {
        try {
          const pdfjs = await import("pdfjs-dist");
          const { default: PdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
          pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
          const buf = await file.arrayBuffer();
          // pdfjs v5 needs wasmUrl to decode JBIG2/CCITT/JPEG2000 images.
          // Without it, scanned PDFs render as blank white pages.
          const pdfjsVersion = (pdfjs as { version?: string }).version ?? "5.7.284";
          const wasmUrl = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/wasm/`;
          const cMapUrl = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/cmaps/`;
          const standardFontDataUrl = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/standard_fonts/`;
          const doc = await pdfjs.getDocument({
            data: buf,
            wasmUrl,
            cMapUrl,
            cMapPacked: true,
            standardFontDataUrl,
          }).promise;
          if (cancelled) return;
          pdfDocRef.current = doc;
          const infos: PageInfo[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const vp = page.getViewport({ scale: 1 });
            infos.push({ baseWidth: vp.width, baseHeight: vp.height });
          }
          if (!cancelled) setPages(infos);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render PDF");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [file]);

  // Render PDF pages on scale / rotation changes
  useEffect(() => {
    if (!isPdf || pages.length === 0) return;
    const doc = pdfDocRef.current as { getPage: (n: number) => Promise<unknown> } | null;
    if (!doc) return;
    const token = ++renderTokenRef.current;
    (async () => {
      for (let i = 0; i < pages.length; i++) {
        if (token !== renderTokenRef.current) return;
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page: any = await doc.getPage(i + 1);
        const vp = page.getViewport({ scale, rotation });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = vp.width * dpr;
        canvas.height = vp.height * dpr;
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      }
    })();
  }, [isPdf, pages, scale, rotation]);

  // Scroll to the active source location's page when activated
  useEffect(() => {
    if (!activeLocationPath || !sourceHighlights) return;
    const loc = sourceHighlights.find((l) => l.path === activeLocationPath);
    if (!loc) return;
    const el = pageContainerRefs.current[loc.page - 1];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeLocationPath, sourceHighlights]);

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  const zoomReset = () => setScale(1);
  const zoomFit = () => {
    const c = scrollerRef.current;
    if (!c || pages.length === 0) return;
    const targetW = c.clientWidth - 24;
    const baseW = pages[0].baseWidth;
    setScale(+Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetW / baseW)).toFixed(2));
  };
  const rotate = () => setRotation((r) => (r + 90) % 360);

  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (annotations.length === 0) return;
    if (
      confirm(`Remove all ${annotations.length} annotation${annotations.length === 1 ? "" : "s"}?`)
    ) {
      setAnnotations([]);
    }
  };

  const eraseAt = (pageIdx: number, x: number, y: number) => {
    setAnnotations((curr) =>
      curr.filter((a) => {
        if (a.page !== pageIdx) return true;
        if (a.kind === "highlight" || a.kind === "box") {
          const r = a.rect;
          return !(x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
        }
        if (a.kind === "arrow") {
          return pointToSegmentDist({ x, y }, a.from, a.to) > 0.015;
        }
        return true;
      }),
    );
  };

  const onPageMouseDown = (e: React.MouseEvent, pageIdx: number) => {
    if (!tool) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (tool === "eraser") {
      setErasing(true);
      eraseAt(pageIdx, x, y);
      return;
    }
    setDraft({ page: pageIdx, start: { x, y }, cur: { x, y } });
  };

  const onPageMouseMove = (e: React.MouseEvent, pageIdx: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (erasing && tool === "eraser") {
      eraseAt(pageIdx, x, y);
      return;
    }
    if (!draft) return;
    setDraft({ ...draft, cur: { x, y } });
  };

  const onPageMouseUp = () => {
    if (erasing) {
      setErasing(false);
      return;
    }
    if (!draft) return;
    const { page, start, cur } = draft;
    if (tool === "arrow") {
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;
      if (dx * dx + dy * dy > 0.0004) {
        setAnnotations((curr) => [
          ...curr,
          { id: newAid(), kind: "arrow", page, from: start, to: cur, color },
        ]);
      }
    } else if (tool === "highlight" || tool === "box") {
      const r = normRect(start, cur);
      if (r.w > 0.005 && r.h > 0.005) {
        setAnnotations((curr) => [...curr, { id: newAid(), kind: tool, page, rect: r, color }]);
      }
    }
    setDraft(null);
  };

  if (!file) {
    return (
      <div
        className={`rounded-lg border-2 border-dashed p-10 text-center text-sm text-muted-foreground ${className ?? ""}`}
      >
        <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        Upload a document to see the preview.
      </div>
    );
  }

  const cursorClass =
    tool === null ? "cursor-default" : tool === "eraser" ? "cursor-cell" : "cursor-crosshair";

  return (
    <div
      className={`rounded-lg border bg-background overflow-hidden flex flex-col ${className ?? ""}`}
    >
      {/* TOOLBAR */}
      <div className="border-b bg-card/60 px-2 py-1.5 flex items-center gap-1 flex-wrap text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5"
          onClick={zoomOut}
          disabled={scale <= MIN_SCALE}
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <button
          onClick={zoomReset}
          className="px-1.5 py-0.5 rounded hover:bg-accent font-mono min-w-[3rem] text-center"
          title="Reset zoom (100%)"
        >
          {Math.round(scale * 100)}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5"
          onClick={zoomIn}
          disabled={scale >= MAX_SCALE}
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={zoomFit} title="Fit width">
          Fit
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5"
          onClick={rotate}
          title="Rotate 90°"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </Button>
        <span
          className="px-1 py-0.5 rounded font-mono min-w-[2rem] text-center text-[11px]"
          title="Current rotation"
        >
          {rotation}°
        </span>

        {/* TOOL BUTTONS (inline) */}
        <div className="flex items-center gap-0.5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.key;
            return (
              <Button
                key={t.key}
                variant="ghost"
                size="sm"
                onClick={() => setTool(active ? null : t.key)}
                title={t.label}
                className={`h-7 px-2 ${active ? "bg-primary/15 text-primary hover:bg-primary/20" : ""}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>

        {/* COLOR DROPDOWN */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 ml-1 px-1.5 gap-1"
              title={`Color: ${COLORS.find((c) => c.key === color)?.label ?? ""}`}
            >
              <span
                className="h-3.5 w-3.5 rounded border border-black/10 inline-block"
                style={{ background: color }}
              />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-0 w-auto p-1">
            <div className="grid grid-cols-4 gap-1">
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.key)}
                  title={c.label}
                  className={`h-6 w-6 rounded border border-black/10 ${color === c.key ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                  style={{ background: c.key }}
                  type="button"
                />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={clearAll}
            disabled={annotations.length === 0}
            title="Remove all annotations"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button variant="ghost" size="sm" className="h-7" onClick={download} title="Download">
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>

      <div className="px-3 py-1 text-[11px] text-muted-foreground border-b bg-muted/30">
        {tool === null && "No tool selected. Click a tool above to start drawing."}
        {tool === "highlight" && "Drag on the document to highlight an area."}
        {tool === "box" && "Drag on the document to draw a box."}
        {tool === "arrow" && "Drag from the arrow's tail to its head."}
        {tool === "eraser" &&
          "Drag across annotations to erase them. Click the Eraser button again to deselect."}
      </div>

      {/* SCROLLABLE VIEWER */}
      <div
        ref={scrollerRef}
        className="overflow-auto bg-muted/30 p-3 space-y-3 max-h-[75vh] min-h-[400px]"
      >
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Rendering document…
          </div>
        )}
        {error && <div className="text-xs text-destructive px-2">{error}</div>}

        {/* IMAGE MODE */}
        {!isPdf && imageUrl && pages[0] && (
          <PageStage
            width={rotation % 180 === 90 ? pages[0].baseHeight * scale : pages[0].baseWidth * scale}
            height={
              rotation % 180 === 90 ? pages[0].baseWidth * scale : pages[0].baseHeight * scale
            }
            cursorClass={cursorClass}
            onMouseDown={(e) => onPageMouseDown(e, 0)}
            onMouseMove={(e) => onPageMouseMove(e, 0)}
            onMouseUp={onPageMouseUp}
          >
            <img
              src={imageUrl}
              alt={file.name}
              className="block w-full h-full select-none pointer-events-none"
              draggable={false}
              style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "center center" }}
            />
            <Overlay
              pageIdx={0}
              pageWidth={
                rotation % 180 === 90 ? pages[0].baseHeight * scale : pages[0].baseWidth * scale
              }
              pageHeight={
                rotation % 180 === 90 ? pages[0].baseWidth * scale : pages[0].baseHeight * scale
              }
              annotations={annotations}
              draft={draft}
              draftTool={tool}
              draftColor={color}
              sourceHighlights={sourceHighlights ?? null}
              activeLocationPath={activeLocationPath ?? null}
            />
          </PageStage>
        )}

        {/* PDF MODE */}
        {isPdf &&
          pages.map((p, i) => {
            const r = ((rotation % 360) + 360) % 360;
            const swapped = r === 90 || r === 270;
            const w = (swapped ? p.baseHeight : p.baseWidth) * scale;
            const h = (swapped ? p.baseWidth : p.baseHeight) * scale;
            return (
              <div
                key={i}
                ref={(el) => {
                  pageContainerRefs.current[i] = el;
                }}
                className="space-y-1"
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">
                  Page {i + 1} of {pages.length}
                </div>
                <PageStage
                  width={w}
                  height={h}
                  cursorClass={cursorClass}
                  onMouseDown={(e) => onPageMouseDown(e, i)}
                  onMouseMove={(e) => onPageMouseMove(e, i)}
                  onMouseUp={onPageMouseUp}
                >
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[i] = el;
                    }}
                    className="block select-none pointer-events-none"
                  />
                  <Overlay
                    pageIdx={i}
                    pageWidth={w}
                    pageHeight={h}
                    annotations={annotations}
                    draft={draft}
                    draftTool={tool}
                    draftColor={color}
                    sourceHighlights={sourceHighlights ?? null}
                    activeLocationPath={activeLocationPath ?? null}
                  />
                </PageStage>
              </div>
            );
          })}
      </div>

      {/* FOOTER */}
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t bg-card/60 flex items-center gap-2">
        <FileText className="h-3 w-3" />
        <span className="truncate flex-1">{file.name}</span>
        {annotations.length > 0 && (
          <span>
            {annotations.length} annotation{annotations.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────── helpers ───────────── */

function normRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

function PageStage({
  width,
  height,
  cursorClass,
  children,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: {
  width: number;
  height: number;
  cursorClass: string;
  children: React.ReactNode;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`relative mx-auto bg-white shadow-sm rounded ${cursorClass}`}
      style={{ width, height }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {children}
    </div>
  );
}

function Overlay({
  pageIdx,
  pageWidth,
  pageHeight,
  annotations,
  draft,
  draftTool,
  draftColor,
  sourceHighlights,
  activeLocationPath,
}: {
  pageIdx: number;
  pageWidth: number;
  pageHeight: number;
  annotations: Annotation[];
  draft: { page: number; start: Point; cur: Point } | null;
  draftTool: Tool | null;
  draftColor: string;
  sourceHighlights: FieldLocation[] | null;
  activeLocationPath: string | null;
}) {
  const pageAnns = annotations.filter((a) => a.page === pageIdx);
  const showDraft = draft && draft.page === pageIdx;
  const arrowAnns = pageAnns.filter(
    (a): a is Extract<Annotation, { kind: "arrow" }> => a.kind === "arrow",
  );

  const activeSourceRects = (sourceHighlights ?? []).filter(
    (loc) => activeLocationPath && loc.path === activeLocationPath && loc.page - 1 === pageIdx,
  );

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {/* Rect-based annotations (highlight + box) */}
      {pageAnns.map((a) => {
        if (a.kind === "highlight") {
          return (
            <RectChrome key={a.id} rect={a.rect} title="Highlight">
              <div
                className="absolute inset-0"
                style={{ background: a.color, opacity: 0.45, mixBlendMode: "multiply" }}
              />
            </RectChrome>
          );
        }
        if (a.kind === "box") {
          return (
            <RectChrome key={a.id} rect={a.rect} title="Box">
              <div
                className="absolute inset-0"
                style={{ border: `2px solid ${a.color}`, background: `${a.color}10` }}
              />
            </RectChrome>
          );
        }
        return null;
      })}

      {/* Arrows as SVG */}
      {(arrowAnns.length > 0 || (showDraft && draftTool === "arrow")) && (
        <svg
          className="absolute inset-0"
          width="100%"
          height="100%"
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: "none" }}
        >
          <defs>
            {arrowAnns.map((a) => (
              <marker
                key={`m-${a.id}`}
                id={`arrow-${a.id}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" fill={a.color} />
              </marker>
            ))}
            {showDraft && draftTool === "arrow" && (
              <marker
                id="arrow-draft"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" fill={draftColor} />
              </marker>
            )}
          </defs>
          {arrowAnns.map((a) => (
            <line
              key={a.id}
              x1={a.from.x * pageWidth}
              y1={a.from.y * pageHeight}
              x2={a.to.x * pageWidth}
              y2={a.to.y * pageHeight}
              stroke={a.color}
              strokeWidth={3}
              strokeLinecap="round"
              markerEnd={`url(#arrow-${a.id})`}
            />
          ))}
          {showDraft && draftTool === "arrow" && (
            <line
              x1={draft!.start.x * pageWidth}
              y1={draft!.start.y * pageHeight}
              x2={draft!.cur.x * pageWidth}
              y2={draft!.cur.y * pageHeight}
              stroke={draftColor}
              strokeWidth={3}
              strokeOpacity={0.7}
              strokeLinecap="round"
              markerEnd="url(#arrow-draft)"
            />
          )}
        </svg>
      )}

      {/* Draft for highlight/box */}
      {showDraft && (draftTool === "highlight" || draftTool === "box") && (
        <div
          className="absolute"
          style={{
            ...pctStyle(normRect(draft!.start, draft!.cur)),
            ...(draftTool === "highlight"
              ? { background: draftColor, opacity: 0.35 }
              : { border: `2px dashed ${draftColor}`, background: `${draftColor}10` }),
          }}
        />
      )}

      {/* Source-location highlight (one active at a time) */}
      {activeSourceRects.map((loc, i) => {
        const [x0, y0, x1, y1] = loc.bbox_normalized.map((v) => Math.max(0, Math.min(1, v)));
        return (
          <div
            key={`src-${i}`}
            className="absolute z-20 pointer-events-none animate-pulse"
            style={{
              left: `${x0 * 100}%`,
              top: `${y0 * 100}%`,
              width: `${(x1 - x0) * 100}%`,
              height: `${(y1 - y0) * 100}%`,
              background: "rgba(53, 84, 138, 0.18)",
              border: "2px solid rgba(53, 84, 138, 0.9)",
              borderRadius: 2,
              boxShadow: "0 0 0 4px rgba(53, 84, 138, 0.12)",
            }}
            title={`${loc.path} = ${loc.value}`}
          />
        );
      })}
    </div>
  );
}

function RectChrome({
  rect,
  title,
  children,
}: {
  rect: Rect;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute pointer-events-none" style={pctStyle(rect)} title={title}>
      {children}
    </div>
  );
}

function pctStyle(r: Rect): React.CSSProperties {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
}
