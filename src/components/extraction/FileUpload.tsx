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
  file,
  onFile,
  previewExpanded,
  onPreviewExpandedChange,
  sourceHighlights,
  activeLocationPath,
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

  const handleFile = useCallback(
    (f: File) => {
      if (!isAcceptedFile(f)) {
        toast.error("Unsupported file type. Use PDF, PNG, JPEG, CSV, XLS, XLSX, or ODS.");
        return;
      }
      if (f.size > MAX_SIZE) {
        toast.error("File too large (max 20 MB).");
        return;
      }
      onFile(f);
    },
    [onFile],
  );

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
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (file) {
    const spreadsheet = isSpreadsheet(file);
    const isDocumentPreviewable = file.type === "application/pdf" || file.type.startsWith("image/");
    const isPreviewable = isDocumentPreviewable || spreadsheet;
    return (
      <div className="rounded-md border border-line bg-surface p-4 shadow-card">
        <div className="flex gap-4">
          <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-line bg-wash">
            {preview ? (
              <img src={preview} alt="preview" className="h-full w-full object-cover" />
            ) : spreadsheet ? (
              <Sheet className="h-8 w-8 text-ok" />
            ) : file.type === "application/pdf" ? (
              <FileText className="h-8 w-8 text-faint" />
            ) : (
              <ImageIcon className="h-8 w-8 text-faint" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">{file.name}</div>
            <div className="mt-1 font-mono text-[11px] text-faint">
              {(file.size / 1024).toFixed(1)} KB ·{" "}
              {file.type || getExtension(file.name).replace(".", "").toUpperCase()}
            </div>
            <div className="-ml-2 mt-2 flex items-center gap-1">
              {isPreviewable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-faint hover:text-ink"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> Hide preview
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> Show preview
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-faint hover:text-destructive"
                onClick={() => onFile(null)}
              >
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
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      className={`cursor-pointer rounded-lg border border-dashed p-12 text-center transition-colors ${
        dragOver
          ? "border-highlight bg-highlight-tint"
          : "border-line hover:border-ink/40 hover:bg-wash"
      }`}
    >
      <Upload className="mx-auto mb-4 h-6 w-6 text-faint" strokeWidth={1.5} />
      <div className="font-serif text-[22px] leading-tight">Drop a document here</div>
      <div className="mt-2 text-[13.5px] text-muted-foreground">
        or{" "}
        <span className="text-ink underline decoration-line underline-offset-2">choose a file</span>{" "}
        from your computer
      </div>
      <div className="mt-4 text-[12px] leading-relaxed text-faint">
        PDF, photo, scan or spreadsheet · up to 20 MB
        <br />
        Files stay inside this workspace.
      </div>
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
