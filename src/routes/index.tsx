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
import { JsonView } from "@/components/extraction/JsonView";
import { JsonDiffSplit } from "@/components/extraction/JsonDiffSplit";
import { PasteSchemaDialog } from "@/components/extraction/PasteSchemaDialog";
import { TenantSelect, type Tenant } from "@/components/extraction/TenantConfig";
import { FieldsPreview } from "@/components/extraction/FieldsPreview";
import { EditFieldDialog } from "@/components/extraction/EditFieldDialog";
import { ResultView } from "@/components/extraction/ResultView";
import { isSpreadsheetFile } from "@/lib/file-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertCircle,
  AlertTriangle,
  Braces,
  Check,
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
  const [schemaAsJson, setSchemaAsJson] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [activeLocationPath, setActiveLocationPath] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<NonDocumentError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [hasRemoteSchema, setHasRemoteSchema] = useState(false);
  const [savedFields, setSavedFields] = useState<FieldSpec[]>([]);
  const [savingSchema, setSavingSchema] = useState(false);

  const savedSchemaJson = useMemo(
    () => ({ fields: savedFields.map(serializeField) }),
    [savedFields],
  );
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
    const toastId = toast.loading(`${verb} schema…`);
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
      toast.success(res.message ?? (hasRemoteSchema ? "Schema updated" : "Schema saved"), {
        id: toastId,
      });
    } catch (e) {
      toast.error(errorMessage(e, "Failed to save schema"), { id: toastId });
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
          toast.success("Restored previous schema", {
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

  // Name the actual blocker. Ordered by the sequence the user works through, so
  // "select a tenant" isn't reported as "add a field".
  const extractBlockedReason = useMemo(() => {
    if (!file) return "Upload a document";
    if (isSheet) return "";
    if (!selectedTenant) return "Select a tenant";
    if (fields.length === 0) return "Add at least one field";
    if (errors.length) return `Fix ${errors.length} schema error${errors.length > 1 ? "s" : ""}`;
    return "";
  }, [file, isSheet, selectedTenant, fields.length, errors.length]);

  const applyPastedFields = (next: FieldSpec[]) => {
    if (fields.some((f) => f.name) && !confirm("Replace current schema with the pasted JSON?"))
      return;
    setFields(next);
    toast.success("Schema loaded from JSON");
  };

  const editingField = useMemo(
    () => fields.find((f) => f.id === editingFieldId) ?? null,
    [fields, editingFieldId],
  );
  const editingSiblingNames = useMemo(
    () =>
      fields
        .filter((f) => f.id !== editingFieldId)
        .map((f) => f.name.trim())
        .filter(Boolean),
    [fields, editingFieldId],
  );

  const updateFieldById = (next: FieldSpec) => {
    setFields((curr) => curr.map((f) => (f.id === next.id ? next : f)));
  };

  const deleteFieldById = (id: string) => {
    setFields((curr) => curr.filter((f) => f.id !== id));
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

  /**
   * "located / total" over non-null leaves — the honest denominator, since only
   * leaves can be matched to a position. Tells you at a glance whether the OCR
   * pass found most values or barely any.
   */
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

  // Extraction is a 10–60s round trip (OCR + LLM). Count real seconds rather
  // than animating a bar that implies progress the backend never reports.
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

  // A result with source locations is only useful next to the document, so open
  // the preview instead of waiting for the user to discover the locate pins.
  useEffect(() => {
    if (result?.locations?.length) setPreviewExpanded(true);
  }, [result]);

  const extract = async (overrides?: { skipRelevanceCheck?: boolean }) => {
    if (!canExtract) return;
    setLoading(true);
    setExtractError(null);
    setTab("result");
    try {
      const res = await extractDocument({
        file: file!,
        // Spreadsheets don't use a tenant schema / document hints / relevance check.
        tenantId: isSheet ? null : selectedTenant?.id,
        model,
        docType: isSheet ? undefined : docType || undefined,
        docContext: isSheet ? undefined : docContext || undefined,
        skipRelevanceCheck: isSheet ? false : (overrides?.skipRelevanceCheck ?? skipRelevanceCheck),
      });
      setResult(res);
      toast.success("Extraction complete", { duration: 2000 });
    } catch (e) {
      // A relevance rejection arrives as structured detail → dedicated card with retry.
      const detail = e instanceof ApiError ? e.detail : null;
      if (detail && typeof detail === "object" && (detail as { code?: string }).code) {
        setExtractError(detail as NonDocumentError);
        return;
      }
      toast.error(errorMessage(e, "Extraction failed"));
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

  /** Prefer the full payload (already a JSON string) when the backend truncated `data`. */
  const resultJson = () => {
    if (!result) return "";
    if (result.full_payload_json) {
      try {
        // Pretty-print if the string is valid JSON; otherwise keep the raw string.
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
    a.download = `extraction-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const docTypeChips = ["service_invoice", "repair_order", "annual_inspection", "purchase_order"];

  // The handler accepts either modifier; label whichever one this platform uses.
  // Computed after mount so the SSR markup and first client render agree.
  const shortcutLabel = isMac ? "⌘↵" : "Ctrl+↵";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <AppHeader
        right={
          <div className="text-xs text-muted-foreground hidden md:block">
            <kbd className="rounded border bg-muted px-1.5 py-0.5">{shortcutLabel}</kbd> extract
          </div>
        }
      />

      <main className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* LEFT */}
          <div className="space-y-6">
            <section>
              <SectionTitle n={1} title="Upload Document" />
              <FileUpload
                file={file}
                onFile={setFile}
                previewExpanded={previewExpanded}
                onPreviewExpandedChange={setPreviewExpanded}
                sourceHighlights={result?.locations ?? null}
                activeLocationPath={activeLocationPath}
              />
            </section>

            <section className="space-y-4 rounded-xl border bg-card p-4">
              <SectionTitle n={2} title="Document Settings" inline />
              <SheetDisabled active={isSheet}>
                <TenantSelect
                  selected={selectedTenant}
                  onChange={handleTenantChange}
                  onLoad={handleTenantSchemaLoad}
                />
              </SheetDisabled>
              <SheetDisabled active={isSheet}>
                <div>
                  <Label className="text-xs">Document Type</Label>
                  <Input
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    placeholder="e.g. service_invoice"
                    className="font-mono mt-1"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {docTypeChips.map((c) => (
                      <button
                        key={c}
                        onClick={() => setDocType(c)}
                        className="text-xs px-2 py-0.5 rounded-full border bg-background hover:bg-accent transition-colors font-mono"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </SheetDisabled>
              <SheetDisabled active={isSheet}>
                <div>
                  <Label className="text-xs">Document Context</Label>
                  <Textarea
                    value={docContext}
                    onChange={(e) => setDocContext(e.target.value)}
                    className="mt-1 min-h-20"
                    placeholder="Any hints about the document, vendor, or layout that will help the AI extract the right fields…"
                  />
                </div>
              </SheetDisabled>
              <SheetDisabled active={isSheet}>
                <div className="flex items-start gap-3">
                  <Switch
                    checked={skipRelevanceCheck}
                    onCheckedChange={setSkipRelevanceCheck}
                    id="skip-relevance"
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="skip-relevance" className="text-sm">
                      Skip relevance check
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Default OFF: the backend pre-screens the file to detect non-document content
                      (random photos, blanks, scans of unrelated images, etc.). If the file is
                      judged irrelevant, the LLM is <strong>not called</strong> and{" "}
                      <strong>no tokens are spent</strong>
                    </p>
                  </div>
                </div>
              </SheetDisabled>
              <div>
                <Label className="text-xs mb-2 block" id="model-label">
                  Model
                </Label>
                {/* Radiogroup semantics: it's a single choice, so screen readers and
                    arrow keys should treat it that way rather than as two buttons. */}
                <div
                  className="inline-flex rounded-lg border bg-background p-1"
                  role="radiogroup"
                  aria-labelledby="model-label"
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
                      className={`px-4 py-1.5 text-sm rounded-md transition-colors capitalize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                        model === m
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Which LLM formats the result. Claude is the default.
                </p>
              </div>
            </section>

            <SheetDisabled active={isSheet}>
              <section className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <SectionTitle n={3} title="Field Schema" inline />
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
                      <ClipboardPaste className="h-4 w-4" /> Paste JSON
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
                          ? "Select a tenant first"
                          : !dirtySchema
                            ? "No changes to save"
                            : hasRemoteSchema
                              ? "Update tenant schema"
                              : "Save tenant schema"
                      }
                    >
                      {savingSchema ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />{" "}
                          {hasRemoteSchema ? "Updating…" : "Saving…"}
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" /> {hasRemoteSchema ? "Update" : "Save"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {selectedTenant && dirtySchema && (
                  <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Unsaved changes — click {hasRemoteSchema ? "Update" : "Save"} to apply.
                  </div>
                )}

                <div className="rounded-xl border bg-card/30 p-3 max-h-[60vh] overflow-y-auto">
                  <NestedFieldList fields={fields} onChange={setFields} depth={0} errors={errors} />
                </div>
              </section>
            </SheetDisabled>

            <div className="sticky bottom-4 z-10 rounded-xl border bg-background/95 backdrop-blur shadow-lg p-3 space-y-2">
              {/* The service extracts with the tenant's SAVED config — the editor's
                  unsaved edits are not sent, so say so before tokens are spent. */}
              {!isSheet && selectedTenant && dirtySchema && (
                <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 text-xs px-2.5 py-2 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    Extraction uses the <strong>saved</strong> schema. Your unsaved edits won't
                    apply until you click {hasRemoteSchema ? "Update" : "Save"}.
                  </span>
                </div>
              )}
              <Button
                size="lg"
                className="w-full h-12 text-base"
                disabled={!canExtract || loading}
                onClick={() => extract()}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Extracting…{" "}
                    {elapsed > 0 && `${elapsed}s`}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" /> Extract Document
                  </>
                )}
              </Button>
              {canExtract ? (
                // Confirm what this run will actually do — every input lives in a
                // different section, so restate them at the point of no return.
                <div className="text-xs text-muted-foreground text-center">
                  {isSheet ? (
                    <>
                      Spreadsheet · <span className="font-medium text-foreground">{model}</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">{selectedTenant?.name}</span>
                      {" · "}
                      <span className="font-medium text-foreground">{model}</span>
                      {" · "}
                      relevance check {skipRelevanceCheck ? "skipped" : "on"}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {extractBlockedReason}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="lg:sticky lg:top-20 self-start">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "schema" | "result")}>
              <TabsList>
                <TabsTrigger value="schema">Schema</TabsTrigger>
                <TabsTrigger value="result">
                  Result{" "}
                  {result && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="schema" className="mt-3 space-y-3">
                <SheetDisabled active={isSheet}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Braces className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Schema preview</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor="schema-json"
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          Show as JSON
                        </Label>
                        <Switch
                          id="schema-json"
                          checked={schemaAsJson}
                          onCheckedChange={setSchemaAsJson}
                        />
                      </div>
                    </div>
                    {savedFields.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed p-8 text-center text-xs text-muted-foreground">
                        {selectedTenant ? (
                          <>
                            No saved schema yet. Edit fields on the left and click{" "}
                            <strong>{hasRemoteSchema ? "Update" : "Save"}</strong> to preview them
                            here.
                          </>
                        ) : (
                          <>Select a tenant and save a schema to preview it here.</>
                        )}
                      </div>
                    ) : schemaAsJson ? (
                      <JsonView value={savedSchemaJson} />
                    ) : (
                      <div className="max-h-[70vh] overflow-y-auto">
                        <FieldsPreview
                          fields={savedFields}
                          errors={[]}
                          onEdit={setEditingFieldId}
                          onDelete={deleteFieldById}
                        />
                      </div>
                    )}
                  </div>
                </SheetDisabled>
              </TabsContent>
              <TabsContent value="result" className="mt-3 space-y-3">
                {loading ? (
                  <div className="rounded-lg border bg-card p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground mt-3">
                      Extracting structured data…{" "}
                      <span className="font-mono tabular-nums">{elapsed}s</span>
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-1">
                      OCR then {model} — usually 10–60s depending on page count.
                    </p>
                    {/* Indeterminate: the backend reports no progress, so don't fake a percentage. */}
                    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full w-1/3 rounded-full bg-primary animate-[pulse_1.4s_ease-in-out_infinite]" />
                    </div>
                  </div>
                ) : extractError ? (
                  <NonDocumentErrorCard
                    error={extractError}
                    onRetry={retrySkippingRelevanceCheck}
                    onDismiss={() => setExtractError(null)}
                  />
                ) : result ? (
                  <>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="secondary">Model: {result.model}</Badge>
                      <Badge variant="secondary">OCR: {result.ocr_engine ?? "—"}</Badge>
                      <Badge variant="secondary">Vision: {result.used_vision ? "yes" : "no"}</Badge>
                      <Badge variant="secondary">Pages: {result.page_count}</Badge>
                      <Badge variant="secondary">
                        Time: {(result.response_time_ms / 1000).toFixed(2)} s
                      </Badge>
                      {result.cost != null && (
                        <Badge variant="secondary">Cost: ${result.cost.toFixed(4)}</Badge>
                      )}
                      {result.total_tokens != null && (
                        <Badge variant="secondary">
                          Tokens: {result.total_tokens.toLocaleString()}
                        </Badge>
                      )}
                      {result.document_type && (
                        <Badge variant="secondary">Type: {result.document_type}</Badge>
                      )}
                      {locatedSummary && (
                        <Badge
                          variant="secondary"
                          title="Values matched back to a position on the page"
                        >
                          Located: {locatedSummary}
                        </Badge>
                      )}
                    </div>
                    {result.full_payload_json && (
                      <div className="rounded-md border border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100 text-xs px-3 py-2 flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                        <div>
                          <strong>Preview truncated.</strong> Showing the first 100 rows only for
                          performance. The complete dataset will be included when you click{" "}
                          <strong>Download JSON</strong>.
                        </div>
                      </div>
                    )}
                    {result.locations ? (
                      <>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium">
                              Extracted result with source locations
                            </span>
                            <span className="text-muted-foreground/80">
                              — click a <Locate className="inline h-3 w-3 align-[-2px]" /> pin to
                              highlight it on the document (may not be accurate)
                            </span>
                            {activeLocationPath && (
                              <button
                                type="button"
                                onClick={() => setActiveLocationPath(null)}
                                className="ml-auto underline underline-offset-2 hover:text-foreground"
                              >
                                Clear highlight
                              </button>
                            )}
                          </div>
                          <ResultView
                            data={result.data}
                            locationsByPath={locationsByPath}
                            activePath={activeLocationPath}
                            onLocate={onLocateField}
                          />
                        </div>
                        <JsonDiffSplit source={result.data} />
                      </>
                    ) : (
                      <>
                        {/* Absent locations look like a bug otherwise — name the cause. */}
                        {!isSheet && (
                          <div className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>
                              No source locations for this run — the page had no OCR text to match
                              against (image-only scan with OCR disabled, or a vision-only pass).
                            </span>
                          </div>
                        )}
                        <JsonDiffSplit source={result.data} />
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={downloadResult}>
                        <Download className="h-4 w-4" /> Download JSON
                      </Button>
                      <Button variant="outline" size="sm" onClick={copyResult}>
                        {copiedResult ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copiedResult ? "Copied" : "Copy JSON"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border-2 border-dashed p-10 text-center">
                    <FileSearch className="h-10 w-10 text-muted-foreground/50 mx-auto" />
                    <p className="text-sm text-muted-foreground mt-3">
                      Upload a document, define your fields on the left, then click{" "}
                      <strong>Extract</strong>.<br />
                      The structured result will appear here.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      <PasteSchemaDialog open={pasteOpen} onOpenChange={setPasteOpen} onApply={applyPastedFields} />
      <EditFieldDialog
        open={!!editingField}
        field={editingField}
        siblingNames={editingSiblingNames}
        onOpenChange={(v) => {
          if (!v) setEditingFieldId(null);
        }}
        onSave={(next) => {
          updateFieldById(next);
          setEditingFieldId(null);
        }}
      />
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
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
            {error.code === "non_document_pdf" ? "Document not recognized" : "Extraction blocked"}
          </h3>
          <p className="text-sm text-amber-900/90 dark:text-amber-100/90 mt-1">{error.message}</p>
        </div>
      </div>

      {stats && (
        <div className="rounded border border-amber-200 bg-white/60 text-amber-900 dark:border-amber-500/20 dark:bg-black/20 dark:text-amber-100 p-2 text-xs space-y-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>
              <strong>Verdict:</strong> <code className="font-mono">{verdict}</code>
            </span>
            {stats.reason && (
              <span>
                <strong>Reason:</strong> <code className="font-mono">{stats.reason}</code>
              </span>
            )}
            {stats.page_count != null && (
              <span>
                <strong>Pages:</strong> {stats.page_count}
              </span>
            )}
          </div>
          {stats.pages_sampled && stats.pages_sampled.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-amber-800/90 dark:text-amber-200/90">
                Sampled pages ({stats.pages_sampled.length})
              </summary>
              <ul className="mt-1 pl-3 space-y-0.5">
                {stats.pages_sampled.map((p, i) => (
                  <li key={i} className="font-mono text-[10px] leading-snug">
                    p{p.page ?? i + 1}: score {p.score}/{p.score_threshold} · verdict {p.verdict}
                    {p.bg_pct != null && ` · bg ${(p.bg_pct * 100).toFixed(1)}%`}
                    {p.saturation != null && ` · sat ${p.saturation.toFixed(1)}`}
                    {p.edge_density != null && ` · edge ${(p.edge_density * 100).toFixed(1)}%`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onRetry} className="bg-amber-600 hover:bg-amber-700 text-white">
          <RefreshCw className="h-3.5 w-3.5" /> Retry, skip relevance check
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="text-amber-800 dark:text-amber-200"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function SheetDisabled({
  active,
  children,
  message = "In this document format this action is not required.",
}: {
  active: boolean;
  children: React.ReactNode;
  message?: string;
}) {
  if (!active) return <>{children}</>;
  return (
    <div className="relative cursor-not-allowed" title={message} aria-disabled="true">
      <div className="opacity-40 blur-[1.5px] pointer-events-none select-none">{children}</div>
    </div>
  );
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

function SectionTitle({ n, title, inline }: { n: number; title: string; inline?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${inline ? "" : "mb-3"}`}>
      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold grid place-items-center">
        {n}
      </span>
      <h2 className="font-semibold text-sm">{title}</h2>
    </div>
  );
}
