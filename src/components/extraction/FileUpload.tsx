import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, X, Image as ImageIcon, Eye, EyeOff, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "./DocumentPreview";
import { SpreadsheetPreview } from "./SpreadsheetPreview";
import type { FieldLocation } from "@/lib/extraction-types";
import { isSpreadsheetFile } from "@/lib/file-utils";

const MAX_SIZE = 20 * 1024 * 1024;

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  // Spreadsheets
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel", // .xls (and sometimes .csv from Excel)
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.oasis.opendocument.spreadsheet", // .ods
]);

const ACCEPTED_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".csv", ".xls", ".xlsx", ".ods"]);

const ACCEPT_ATTR = [...ACCEPTED_MIME, ...ACCEPTED_EXT].join(",");

function getExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.substring(i).toLowerCase();
}

function isAcceptedFile(f: File): boolean {
  if (f.type && ACCEPTED_MIME.has(f.type)) return true;
  return ACCEPTED_EXT.has(getExtension(f.name));
}

const isSpreadsheet = isSpreadsheetFile;

type FileUploadProps = {
  file: File | null;
  onFile: (f: File | null) => void;
  /** Controlled preview-expansion. If omitted, falls back to internal state. */
  previewExpanded?: boolean;
  onPreviewExpandedChange?: (v: boolean) => void;
  /** Source highlights from the extraction response (null = vision LLM, no highlights). */
  sourceHighlights?: FieldLocation[] | null;
  activeLocationPath?: string | null;
};

export function FileUpload({
  file, onFile,
  previewExpanded, onPreviewExpandedChange,
  sourceHighlights, activeLocationPath,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [internalExpanded, setInternalExpanded] = useState(false);

  const isControlled = previewExpanded !== undefined;
  const expanded = isControlled ? previewExpanded! : internalExpanded;
  const setExpanded = (v: boolean) => {
    if (isControlled) onPreviewExpandedChange?.(v);
    else setInternalExpanded(v);
  };

  useEffect(() => {
    if (!isControlled) setInternalExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const handleFile = useCallback((f: File) => {
    if (!isAcceptedFile(f)) {
      toast.error("Unsupported file type. Use PDF, PNG, JPEG, CSV, XLS, XLSX, or ODS.");
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error("File too large (max 20 MB).");
      return;
    }
    onFile(f);
  }, [onFile]);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    if (file.type === "application/pdf") {
      (async () => {
        try {
          const pdfjs = await import("pdfjs-dist");
          const { default: PdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
          pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
          const buf = await file.arrayBuffer();
          const doc = await pdfjs.getDocument({ data: buf }).promise;
          const page = await doc.getPage(1);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (!cancelled) setPreview(canvas.toDataURL("image/png"));
        } catch (e) {
          console.error("pdf preview failed", e);
        }
      })();
    }
    return () => { cancelled = true; };
  }, [file]);

  if (file) {
    const spreadsheet = isSpreadsheet(file);
    const isDocumentPreviewable = file.type === "application/pdf" || file.type.startsWith("image/");
    const isPreviewable = isDocumentPreviewable || spreadsheet;
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex gap-4">
          <div className="h-24 w-20 shrink-0 overflow-hidden rounded-md border bg-muted flex items-center justify-center">
            {preview ? (
              <img src={preview} alt="preview" className="h-full w-full object-cover" />
            ) : spreadsheet ? (
              <Sheet className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            ) : file.type === "application/pdf" ? (
              <FileText className="h-8 w-8 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</div>
            <div className="text-xs text-muted-foreground">{file.type || getExtension(file.name).replace(".", "").toUpperCase()}</div>
            <div className="mt-2 -ml-2 flex items-center gap-1">
              {isPreviewable && (
                <Button variant="ghost" size="sm" className="h-7" onClick={() => setExpanded(!expanded)}>
                  {expanded ? <><EyeOff className="h-3.5 w-3.5" /> Hide preview</> : <><Eye className="h-3.5 w-3.5" /> Show preview</>}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => onFile(null)}>
                <X className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>
        </div>
        {isPreviewable && expanded && (
          <div className="mt-3">
            {spreadsheet ? (
              <SpreadsheetPreview file={file} />
            ) : (
              <DocumentPreview
                file={file}
                sourceHighlights={sourceHighlights ?? null}
                activeLocationPath={activeLocationPath ?? null}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-accent/30"
      }`}
    >
      <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
      <div className="font-medium">Drop your document here</div>
      <div className="text-sm text-muted-foreground mt-1">or click to browse — PDF, PNG, JPEG, CSV, XLS, XLSX, ODS up to 20 MB</div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
