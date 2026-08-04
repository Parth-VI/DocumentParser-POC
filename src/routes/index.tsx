import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FieldSpec,
  ExtractionResponse,
  FieldLocation,
  serializeField,
  validateFields,
  newField,
} from "@/lib/extraction-types";
import { ApiError, errorMessage } from "@/lib/ai-api";
import { copyText } from "@/lib/clipboard";
import {
  extractDocument,
  saveTenantSchema,
  type ExtractionModel,
  type TenantSchema,
} from "@/lib/document-ai";
import { AppHeader } from "@/components/AppHeader";
import { FileUpload } from "@/components/extraction/FileUpload";
import { NestedFieldList } from "@/components/extraction/FieldCard";
import { JsonDiffSplit } from "@/components/extraction/JsonDiffSplit";
import { PasteSchemaDialog } from "@/components/extraction/PasteSchemaDialog";
import { TenantSelect, type Tenant } from "@/components/extraction/TenantConfig";
import { ResultForm } from "@/components/extraction/ResultForm";
import { isSpreadsheetFile } from "@/lib/file-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  FileSearch,
  Loader2,
  Locate,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Studio });

const STORAGE_KEY = "des:last-schema";

type NonDocumentError = {
  code: string;
  message: string;
  stats?: {
    verdict?: string;
    reason?: string;
    page_count?: number;
    pages_sampled?: Array<{
      page?: number;
      score?: number;
      score_threshold?: number;
      verdict?: string;
      bg_pct?: number;
      saturation?: number;
      edge_density?: number;
      image_size?: number[];
    }>;
  };
};

function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FieldSpec[]>(() => [newField({ name: "" })]);
  const [docType, setDocType] = useState("");
  const [docContext, setDocContext] = useState("");
  const [skipRelevanceCheck, setSkipRelevanceCheck] = useState(false);
  const [model, setModel] = useState<ExtractionModel>("claude");
  const [tab, setTab] = useState<"schema" | "result">("schema");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [activeLocationPath, setActiveLocationPath] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<NonDocumentError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [hasRemoteSchema, setHasRemoteSchema] = useState(false);
  const [savedFields, setSavedFields] = useState<FieldSpec[]>([]);
  const [savingSchema, setSavingSchema] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const dirtySchema = useMemo(
    () =>
      JSON.stringify(fields.map(serializeField)) !==
      JSON.stringify(savedFields.map(serializeField)),
    [fields, savedFields],
  );

  const handleTenantSchemaLoad = (
    loaded: FieldSpec[],
    hasRemote: boolean,
    config: TenantSchema | null,
  ) => {
    setFields(loaded);
    setSavedFields(loaded);
    setHasRemoteSchema(hasRemote);
    // Seed the run controls from the tenant's saved config so a plain
    // extract matches what production would do for that tenant.
    if (config) {
      if (config.model) setModel(config.model);
      setSkipRelevanceCheck(config.skipRelevanceCheck);
    }
  };

  const handleTenantChange = (t: Tenant | null) => {
    setSelectedTenant(t);
    if (!t) {
      setHasRemoteSchema(false);
      setSavedFields([]);
    }
  };

  const handleSaveSchema = async () => {
    if (!selectedTenant || savingSchema || !dirtySchema) return;
    setSavingSchema(true);
    const verb = hasRemoteSchema ? "Updating" : "Saving";
    const toastId = toast.loading(`${verb} details…`);
    try {
      const res = await saveTenantSchema({
        tenantId: selectedTenant.id,
        fields,
        model,
        skipRelevanceCheck,
        update: hasRemoteSchema,
      });
      setSavedFields(fields);
      setHasRemoteSchema(true);
      toast.success(res.message ?? (hasRemoteSchema ? "Details updated" : "Details saved"), {
        id: toastId,
      });
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save"), { id: toastId });
    } finally {
      setSavingSchema(false);
    }
  };

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  // restore on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setFields(parsed);
          toast.success("Restored your last setup", {
            action: {
              label: "Clear",
              onClick: () => {
                setFields([newField()]);
                localStorage.removeItem(STORAGE_KEY);
              },
            },
          });
        }
      }
    } catch {
      /* noop */
    }
  }, []);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fields));
    } catch {
      /* noop */
    }
  }, [fields]);

  const errors = useMemo(() => validateFields(fields), [fields]);

  const isSheet = !!file && isSpreadsheetFile(file);

  // Spreadsheets don't require a field schema — uploading the file is enough.
  const canExtract =
    !!file && (isSheet || (!!selectedTenant && fields.length > 0 && errors.length === 0));

  // Name the actual blocker. Ordered by the sequence the user works through.
  const extractBlockedReason = useMemo(() => {
    if (!file) return "Add a document to get started";
    if (isSheet) return "";
    if (!selectedTenant) return "Choose a client first";
    if (fields.length === 0) return "Add at least one detail to capture";
    if (errors.length)
      return `Fix ${errors.length} problem${errors.length > 1 ? "s" : ""} in the details`;
    return "";
  }, [file, isSheet, selectedTenant, fields.length, errors.length]);

  const applyPastedFields = (next: FieldSpec[]) => {
    if (fields.some((f) => f.name) && !confirm("Replace the current details with the pasted data?"))
      return;
    setFields(next);
    toast.success("Details loaded");
  };

  // Group source locations by JSONPath so ResultView can show pin icons per field.
  const locationsByPath = useMemo<Map<string, FieldLocation[]>>(() => {
    const m = new Map<string, FieldLocation[]>();
    for (const loc of result?.locations ?? []) {
      const arr = m.get(loc.path) ?? [];
      arr.push(loc);
      m.set(loc.path, arr);
    }
    return m;
  }, [result?.locations]);

  const foundCount = useMemo(() => (result ? countLeaves(result.data) : 0), [result]);

  const locatedSummary = useMemo(() => {
    if (!result?.locations?.length) return null;
    const total = countLeaves(result.data);
    if (!total) return null;
    return `${locationsByPath.size}/${total}`;
  }, [result, locationsByPath]);

  // Clicking a pin: toggle if same, otherwise activate + force-open the preview.
  const onLocateField = (path: string) => {
    setActiveLocationPath((curr) => (curr === path ? null : path));
    setPreviewExpanded(true);
  };

  // Clear active location whenever the result or file changes.
  useEffect(() => {
    setActiveLocationPath(null);
  }, [result, file]);

  // Clear extract error when the user picks a new file.
  useEffect(() => {
    setExtractError(null);
  }, [file]);

  // Extraction is a 10–60s round trip (OCR + LLM). Count real seconds.
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = window.setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (result?.locations?.length) setPreviewExpanded(true);
  }, [result]);

  const extract = async (overrides?: { skipRelevanceCheck?: boolean }) => {
    if (!canExtract) return;
    setLoading(true);
    setExtractError(null);
    setShowJson(false);
    setTab("result");
    try {
      const res = await extractDocument({
        file: file!,
        tenantId: isSheet ? null : selectedTenant?.id,
        model,
        docType: isSheet ? undefined : docType || undefined,
        docContext: isSheet ? undefined : docContext || undefined,
        skipRelevanceCheck: isSheet ? false : (overrides?.skipRelevanceCheck ?? skipRelevanceCheck),
      });
      setResult(res);
      toast.success("Done — here's what we found", { duration: 2000 });
    } catch (e) {
      const detail = e instanceof ApiError ? e.detail : null;
      if (detail && typeof detail === "object" && (detail as { code?: string }).code) {
        setExtractError(detail as NonDocumentError);
        return;
      }
      toast.error(errorMessage(e, "We couldn't read this one"));
    } finally {
      setLoading(false);
    }
  };

  const retrySkippingRelevanceCheck = () => {
    setSkipRelevanceCheck(true);
    void extract({ skipRelevanceCheck: true });
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        extract();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, fields, docType, docContext, model, canExtract]);

  const resultJson = () => {
    if (!result) return "";
    if (result.full_payload_json) {
      try {
        return JSON.stringify(JSON.parse(result.full_payload_json), null, 2);
      } catch {
        return result.full_payload_json;
      }
    }
    return JSON.stringify(result.data, null, 2);
  };

  const copyResult = async () => {
    const body = resultJson();
    if (!body) return;
    if (!(await copyText(body))) {
      toast.error("Couldn't copy — clipboard access was blocked");
      return;
    }
    setCopiedResult(true);
    window.setTimeout(() => setCopiedResult(false), 1500);
  };

  const downloadResult = () => {
    if (!result) return;
    const body = resultJson();
    const blob = new Blob([body], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const docTypeChips = ["service_invoice", "repair_order", "annual_inspection", "purchase_order"];
  const shortcutLabel = isMac ? "⌘↵" : "Ctrl+↵";

  const showResult = tab === "result" && (loading || !!result || !!extractError);

  return (
    // On desktop the app is locked to the viewport — the window itself never
    // scrolls; the document pane and the capture/results pane scroll on their own.
    <div className="flex min-h-screen flex-col bg-paper text-foreground lg:h-screen">
      <AppHeader
        right={
          <div className="hidden items-center gap-1.5 text-[11px] text-faint md:flex">
            <kbd className="rounded border border-line bg-wash px-1.5 py-0.5 font-mono">
              {shortcutLabel}
            </kbd>
            to read
          </div>
        }
      />

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        {/* ── LEFT · the document ─────────────────────────────── */}
        <section className="flex min-h-[40vh] flex-col border-b border-line bg-wash lg:min-h-0 lg:overflow-hidden lg:border-b-0 lg:border-r">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-5">
            <span className="text-[11px] uppercase tracking-[0.09em] text-faint">
              {file ? "Document" : "Step 1 — add a document"}
            </span>
            <div className="flex-1" />
            {file && !loading && (
              <button
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setTab("schema");
                }}
                className="text-[12px] text-faint transition-colors hover:text-ink"
              >
                Replace
              </button>
            )}
          </div>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col p-6 lg:overflow-y-auto",
              (!file || (extractError && !loading)) && "items-center justify-center",
            )}
          >
            {extractError && !loading ? (
              <NonDocumentErrorCard
                error={extractError}
                onRetry={retrySkippingRelevanceCheck}
                onDismiss={() => setExtractError(null)}
              />
            ) : (
              <div className="w-full">
                <FileUpload
                  file={file}
                  onFile={setFile}
                  previewExpanded={previewExpanded}
                  onPreviewExpandedChange={setPreviewExpanded}
                  sourceHighlights={result?.locations ?? null}
                  activeLocationPath={activeLocationPath}
                />
                {file && loading && (
                  <div className="mt-4 flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-highlight" />
                    <span className="flex-1 text-[13px] text-muted-foreground">
                      Reading the document…
                    </span>
                    <span className="font-mono text-[12px] tabular-nums text-faint">
                      {elapsed}s
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── RIGHT · capture / results ───────────────────────── */}
        <section className="flex min-h-[calc(100vh-3.25rem)] flex-col bg-surface lg:min-h-0 lg:overflow-hidden">
          <div className="flex h-11 shrink-0 items-center gap-5 border-b border-line px-5">
            {result || loading ? (
              <>
                <PanelTab active={tab === "schema"} onClick={() => setTab("schema")}>
                  What to capture
                </PanelTab>
                <PanelTab active={tab === "result"} onClick={() => setTab("result")}>
                  Results
                  {result && <span className="ml-1.5 inline-block h-1 w-1 rounded-full bg-ok" />}
                </PanelTab>
              </>
            ) : (
              <span className="text-[11px] uppercase tracking-[0.09em] text-faint">
                Step 2 — choose what to capture
              </span>
            )}
            <div className="flex-1" />
            <span className="font-mono text-[11px] text-faint">
              {showResult && result
                ? `${foundCount} found`
                : `${fields.length} ${fields.length === 1 ? "detail" : "details"}`}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {showResult ? (
              <ResultsPane
                loading={loading}
                elapsed={elapsed}
                model={model}
                result={result}
                extractError={extractError}
                showJson={showJson}
                locationsByPath={locationsByPath}
                activeLocationPath={activeLocationPath}
                onLocate={onLocateField}
                onClearHighlight={() => setActiveLocationPath(null)}
                foundCount={foundCount}
                locatedSummary={locatedSummary}
                isSheet={isSheet}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((v) => !v)}
              />
            ) : (
              <div className="space-y-6 px-5 py-6">
                <p className="max-w-[54ch] text-[13.5px] leading-relaxed text-muted-foreground">
                  Each item below is one piece of information we'll look for in the document. Give
                  it a plain name and pick what kind of value it is.
                </p>

                {!isSheet && (
                  <ClientPicker
                    selected={selectedTenant}
                    onChange={handleTenantChange}
                    onLoad={handleTenantSchemaLoad}
                  />
                )}

                {isSheet ? (
                  <div className="rounded-md border border-line-soft bg-wash px-4 py-3 text-[13px] text-muted-foreground">
                    This is a spreadsheet — no setup needed. We'll read every row for you when you
                    press <span className="text-ink">Read document</span>.
                  </div>
                ) : (
                  <div>
                    <NestedFieldList
                      fields={fields}
                      onChange={setFields}
                      depth={0}
                      errors={errors}
                    />
                  </div>
                )}

                {!isSheet && (
                  <Advanced open={advOpen} onToggle={() => setAdvOpen((v) => !v)}>
                    <div className="grid gap-5">
                      <div>
                        <MicroLabel>Reading engine</MicroLabel>
                        <div
                          className="mt-2 inline-flex rounded-md border border-line bg-paper p-1"
                          role="radiogroup"
                          aria-label="Reading engine"
                        >
                          {(["claude", "openai"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setModel(m)}
                              type="button"
                              role="radio"
                              aria-checked={model === m}
                              tabIndex={model === m ? 0 : -1}
                              onKeyDown={(e) => {
                                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                                  e.preventDefault();
                                  setModel(model === "claude" ? "openai" : "claude");
                                }
                              }}
                              className={cn(
                                "rounded px-3 py-1 text-[13px] capitalize transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                model === m
                                  ? "bg-ink text-paper"
                                  : "text-muted-foreground hover:text-ink",
                              )}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[12px] text-faint">
                          Which reader formats the answer. Claude is the default.
                        </p>
                      </div>

                      <div>
                        <MicroLabel>Kind of document (optional)</MicroLabel>
                        <Input
                          value={docType}
                          onChange={(e) => setDocType(e.target.value)}
                          placeholder="e.g. service invoice"
                          className="mt-2 font-mono"
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {docTypeChips.map((c) => (
                            <button
                              key={c}
                              onClick={() => setDocType(c)}
                              className="rounded-full border border-line bg-paper px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-ink hover:text-ink"
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <MicroLabel>Hints for the reader (optional)</MicroLabel>
                        <Textarea
                          value={docContext}
                          onChange={(e) => setDocContext(e.target.value)}
                          className="mt-2 min-h-20"
                          placeholder="Anything about the document, vendor, or layout that will help us find the right values…"
                        />
                      </div>

                      <label className="flex cursor-pointer items-start gap-3">
                        <Switch
                          checked={!skipRelevanceCheck}
                          onCheckedChange={(v) => setSkipRelevanceCheck(!v)}
                          id="double-check"
                          className="mt-0.5"
                        />
                        <span>
                          <span className="text-[13.5px] font-medium">
                            Double-check it's a real document
                          </span>
                          <span className="mt-1 block text-[12px] leading-relaxed text-faint">
                            We'll take a quick look first and stop if the file doesn't seem to be
                            paperwork — so nothing is spent reading a random photo or blank scan.
                          </span>
                        </span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
                        <span className="mr-1 text-[12px] text-faint">Details tools</span>
                        <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
                          <ClipboardPaste className="h-3.5 w-3.5" /> Paste data
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveSchema}
                          disabled={
                            !selectedTenant ||
                            !dirtySchema ||
                            savingSchema ||
                            fields.length === 0 ||
                            errors.length > 0
                          }
                          title={
                            !selectedTenant
                              ? "Choose a client first"
                              : !dirtySchema
                                ? "No changes to save"
                                : hasRemoteSchema
                                  ? "Update this client's saved details"
                                  : "Save these details for this client"
                          }
                        >
                          {savingSchema ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                              {hasRemoteSchema ? "Updating…" : "Saving…"}
                            </>
                          ) : (
                            <>
                              <Save className="h-3.5 w-3.5" /> {hasRemoteSchema ? "Update" : "Save"}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </Advanced>
                )}
              </div>
            )}
          </div>

          {/* ── sticky action footer ── */}
          <div className="sticky bottom-0 shrink-0 border-t border-line bg-surface/95 px-5 py-3.5 backdrop-blur-sm">
            {showResult && result && !loading ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={downloadResult}>
                    <Download className="h-4 w-4" /> Download results
                  </Button>
                  <Button variant="outline" onClick={copyResult}>
                    {copiedResult ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedResult ? "Copied" : "Copy"}
                  </Button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setShowJson((v) => !v)}
                    className="text-[12px] text-faint underline decoration-line underline-offset-2 transition-colors hover:text-muted-foreground"
                  >
                    {showJson ? "Back to plain view" : "View as data (JSON)"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {!isSheet && selectedTenant && dirtySchema && (
                  <div className="flex items-start gap-2 rounded-md border border-flag/30 bg-flag-tint px-2.5 py-2 text-[12px] text-flag">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Reading uses this client's <strong>saved</strong> details. Your edits won't
                      apply until you {hasRemoteSchema ? "Update" : "Save"} them (under Advanced).
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    className="h-11 flex-1 text-[15px] sm:flex-none sm:px-8"
                    disabled={!canExtract || loading}
                    onClick={() => extract()}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Reading…{" "}
                        {elapsed > 0 && `${elapsed}s`}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" /> Read document
                      </>
                    )}
                  </Button>
                  <p className="min-w-0 flex-1 text-[12px] leading-snug text-faint">
                    {canExtract ? (
                      isSheet ? (
                        <>We'll read every row and lay it out for you.</>
                      ) : (
                        <>
                          We'll read the whole document and fill in the{" "}
                          {fields.length === 1 ? "detail" : `${fields.length} details`} above.
                        </>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {extractBlockedReason}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <PasteSchemaDialog open={pasteOpen} onOpenChange={setPasteOpen} onApply={applyPastedFields} />
    </div>
  );
}

/* ────────────────────────── results pane ────────────────────────── */

function ResultsPane({
  loading,
  elapsed,
  model,
  result,
  extractError,
  showJson,
  locationsByPath,
  activeLocationPath,
  onLocate,
  onClearHighlight,
  foundCount,
  locatedSummary,
  isSheet,
  detailsOpen,
  onToggleDetails,
}: {
  loading: boolean;
  elapsed: number;
  model: string;
  result: ExtractionResponse | null;
  extractError: NonDocumentError | null;
  showJson: boolean;
  locationsByPath: Map<string, FieldLocation[]>;
  activeLocationPath: string | null;
  onLocate: (path: string) => void;
  onClearHighlight: () => void;
  foundCount: number;
  locatedSummary: string | null;
  isSheet: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center px-5 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-highlight" />
        <p className="mt-4 text-[14px] text-muted-foreground">
          Reading the document… <span className="font-mono tabular-nums">{elapsed}s</span>
        </p>
        <p className="mt-1 text-[12px] text-faint">
          A careful read of {model === "openai" ? "OpenAI" : "Claude"} — usually 10 to 60 seconds.
        </p>
        <div className="mt-5 h-px w-40 overflow-hidden bg-line">
          <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] bg-highlight" />
        </div>
      </div>
    );
  }

  if (extractError) {
    return (
      <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
        We stopped before reading this one — see the note on the left.
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center px-5 py-16 text-center">
        <FileSearch className="h-8 w-8 text-faint" />
        <p className="mt-4 max-w-[40ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Add a document and choose what to capture, then press{" "}
          <span className="text-ink">Read document</span>. What we find appears here.
        </p>
      </div>
    );
  }

  const seconds = (result.response_time_ms / 1000).toFixed(1);
  const hasTables = containsRowArray(result.data);

  return (
    <div className="space-y-5 px-5 py-6">
      {/* success line */}
      <div className="flex items-baseline gap-2.5">
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
        <div className="min-w-0">
          <h2 className="font-serif text-[20px] leading-tight">
            We found {foundCount} {foundCount === 1 ? "detail" : "details"}.
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Read in {seconds}s{result.page_count ? ` · ${result.page_count} pages` : ""}. You can
            check each value against the document.
            {hasTables &&
              " The count includes every line inside the tables — open a row with its arrow to see them."}
          </p>
        </div>
      </div>

      {result.full_payload_json && (
        <div className="flex items-start gap-2 rounded-md border border-highlight-line bg-highlight-tint px-3 py-2 text-[12px] text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-highlight" />
          <div>
            <strong className="text-ink">Preview shortened.</strong> Showing the first 100 rows for
            speed — the full set is included when you download.
          </div>
        </div>
      )}

      {showJson ? (
        <JsonDiffSplit source={result.data} />
      ) : (
        <>
          {result.locations ? (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
                <span>
                  Click a <Locate className="inline h-3 w-3 align-[-2px] text-highlight" /> to show
                  where a value came from on the document.
                </span>
                {activeLocationPath && (
                  <button
                    type="button"
                    onClick={onClearHighlight}
                    className="ml-auto underline decoration-line underline-offset-2 hover:text-ink"
                  >
                    Clear highlight
                  </button>
                )}
              </div>
              <ResultForm
                data={result.data}
                locationsByPath={locationsByPath}
                activePath={activeLocationPath}
                onLocate={onLocate}
              />
            </>
          ) : (
            <>
              {!isSheet && (
                <div className="flex items-start gap-1.5 text-[12px] text-faint">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    We couldn't line these values up with spots on the page for this document, so
                    there's nothing to highlight — the values themselves are still complete.
                  </span>
                </div>
              )}
              <ResultForm
                data={result.data}
                locationsByPath={locationsByPath}
                activePath={activeLocationPath}
                onLocate={onLocate}
              />
            </>
          )}
        </>
      )}

      {/* quiet, technical "details" expander */}
      <div>
        <button
          onClick={onToggleDetails}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-faint transition-colors hover:text-muted-foreground"
        >
          <ChevronRight
            className={cn("h-3 w-3 transition-transform", detailsOpen && "rotate-90")}
          />
          Read in {seconds}s · {result.page_count ?? "—"} pages · details
        </button>
        {detailsOpen && (
          <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-5 gap-y-2 font-mono text-[11px] text-faint">
            <Detail k="reader" v={`${result.document_type ?? "auto"} · ${result.model}`} />
            <Detail k="text detection" v={result.ocr_engine ?? "—"} />
            <Detail k="vision" v={result.used_vision ? "yes" : "no"} />
            {result.total_tokens != null && (
              <Detail k="units used" v={result.total_tokens.toLocaleString()} />
            )}
            {result.cost != null && <Detail k="cost" v={`$${result.cost.toFixed(4)}`} />}
            {locatedSummary && <Detail k="located" v={locatedSummary} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-faint/70">{k}</div>
      <div className="text-muted-foreground">{v}</div>
    </div>
  );
}

/* ────────────────────────── small pieces ────────────────────────── */

function MicroLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] uppercase tracking-[0.09em] text-faint">{children}</span>;
}

function PanelTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center border-b py-0.5 text-[13px] transition-colors",
        active ? "border-ink font-medium text-ink" : "border-transparent text-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function ClientPicker({
  selected,
  onChange,
  onLoad,
}: {
  selected: Tenant | null;
  onChange: (t: Tenant | null) => void;
  onLoad: (fields: FieldSpec[], hasRemote: boolean, config: TenantSchema | null) => void;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-wash px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <MicroLabel>Client</MicroLabel>
        <span className="text-flag" title="Required">
          ·
        </span>
      </div>
      <div className="mt-2">
        <TenantSelect selected={selected} onChange={onChange} onLoad={onLoad} />
      </div>
    </div>
  );
}

function Advanced({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line-soft pt-4">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 text-[12.5px] text-faint transition-colors hover:text-ink"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        Advanced options
      </button>
      {open && (
        <div className="mt-4 rounded-md border border-line-soft bg-wash p-4">{children}</div>
      )}
    </div>
  );
}

function NonDocumentErrorCard({
  error,
  onRetry,
  onDismiss,
}: {
  error: NonDocumentError;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const stats = error.stats;
  const verdict = stats?.verdict ?? "non_document";
  return (
    <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-card">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-flag" />
        <span className="text-[11px] uppercase tracking-[0.09em] text-flag">Couldn't read it</span>
      </div>
      <h3 className="font-serif text-[20px] leading-snug">
        This doesn't look like a document we can read.
      </h3>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">{error.message}</p>

      {stats && (
        <details className="mt-3 text-[11px] text-faint">
          <summary className="cursor-pointer font-mono transition-colors hover:text-muted-foreground">
            Technical details
          </summary>
          <div className="mt-2 space-y-1 font-mono">
            <div>
              verdict {verdict}
              {stats.reason ? ` · ${stats.reason}` : ""}
              {stats.page_count != null ? ` · ${stats.page_count} pages` : ""}
            </div>
            {stats.pages_sampled?.map((p, i) => (
              <div key={i} className="text-faint/80">
                p{p.page ?? i + 1}: score {p.score}/{p.score_threshold} · {p.verdict}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-5 flex items-center gap-4">
        <Button onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Read it anyway
        </Button>
        <button
          onClick={onDismiss}
          className="text-[13px] text-muted-foreground transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Does the result hold a table of rows? (Their inner lines sit behind per-row expanders.) */
function containsRowArray(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((v) => v !== null && typeof v === "object")) return true;
    return value.some(containsRowArray);
  }
  if (value !== null && typeof value === "object")
    return Object.values(value as Record<string, unknown>).some(containsRowArray);
  return false;
}

/** Count non-null scalar leaves — the values that could carry a source location. */
function countLeaves(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + countLeaves(v), 0);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (n, v) => n + countLeaves(v),
      0,
    );
  }
  return 1;
}
