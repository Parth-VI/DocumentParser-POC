import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Download,
  Link2,
  Loader2,
  Locate,
  Paperclip,
  RefreshCw,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/routes/mail.index";
import { DocumentPreview } from "@/components/extraction/DocumentPreview";
import { ResultForm } from "@/components/extraction/ResultForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/ai-api";
import { copyText } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/time";
import type { FieldLocation } from "@/lib/extraction-types";
import {
  downloadAttachment,
  fetchMessage,
  fetchMessageDocument,
  reprocessMessage,
  type MailMessageDetail,
} from "@/lib/mailbox-api";

export const Route = createFileRoute("/mail/$messageId")({ component: MailMessageScreen });

function MailMessageScreen() {
  const { messageId } = Route.useParams();
  const id = Number(messageId);

  const [message, setMessage] = useState<MailMessageDetail | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await fetchMessage(id);
      setMessage(detail);
      if (detail.has_document) {
        setDocumentError(null);
        try {
          // Fetched as a File so the studio's existing preview — page rendering,
          // zoom, annotation, source highlights — works unchanged here.
          setDocument(await fetchMessageDocument(id));
        } catch (e) {
          setDocumentError(errorMessage(e, "Could not load the document"));
        }
      }
    } catch (e) {
      toast.error(errorMessage(e, "Could not load the message"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const locationsByPath = useMemo(() => {
    const map = new Map<string, FieldLocation[]>();
    for (const loc of message?.locations ?? []) {
      const list = map.get(loc.path) ?? [];
      list.push(loc);
      map.set(loc.path, list);
    }
    return map;
  }, [message?.locations]);

  const foundCount = useMemo(
    () => (message?.extracted_data ? countLeaves(message.extracted_data) : 0),
    [message?.extracted_data],
  );

  // The document is always visible on this screen, so locating is just a toggle.
  const onLocate = (path: string) => {
    setActivePath((curr) => (curr === path ? null : path));
  };

  const reprocess = async () => {
    setReprocessing(true);
    const toastId = toast.loading("Reading again with this client's saved details…");
    try {
      const result = await reprocessMessage(id);
      toast.success(`Read again — ${result.status}`, { id: toastId });
      await load();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't read it again"), { id: toastId });
    } finally {
      setReprocessing(false);
    }
  };

  const copyJson = async () => {
    if (!message?.extracted_data) return;
    if (!(await copyText(JSON.stringify(message.extracted_data, null, 2)))) {
      toast.error("Couldn't copy — clipboard access was blocked");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const downloadDocument = () => {
    if (!document) return;
    const url = URL.createObjectURL(document);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const seconds =
    message?.response_time_ms != null ? (message.response_time_ms / 1000).toFixed(1) : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-foreground">
      <AppHeader
        right={
          <Button
            variant="outline"
            size="sm"
            onClick={reprocess}
            disabled={reprocessing || !message?.has_document}
          >
            {reprocessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Read again
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-5 px-6 py-6">
        <Link
          to="/mail"
          className="inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to inbox
        </Link>

        {loading && !message ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <div className="grid gap-6 lg:grid-cols-2">
              <Skeleton className="h-[60vh] w-full" />
              <Skeleton className="h-[60vh] w-full" />
            </div>
          </div>
        ) : !message ? (
          <div className="rounded-lg border border-line bg-surface p-12 text-center text-[13.5px] text-muted-foreground">
            This message no longer exists.
          </div>
        ) : (
          <>
            {/* Mail header */}
            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="break-words font-serif text-[22px] leading-snug">
                    {message.subject || <span className="text-faint">(no subject)</span>}
                  </h1>
                  <div className="mt-1.5 text-[12.5px] text-muted-foreground">
                    From{" "}
                    <span className="text-ink">{message.from_name || message.from_address}</span>
                    {message.from_name && ` <${message.from_address}>`}
                    {message.received_at && <> · {formatDateTime(message.received_at)}</>}
                    {message.account_email && <> · to {message.account_email}</>}
                  </div>
                </div>
                <StatusBadge status={message.status} />
              </div>

              {/* plain summary + a quiet mono details expander */}
              <div className="mt-4 border-t border-line-soft pt-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                  {message.page_count != null && <span>{message.page_count} pages read</span>}
                  {seconds && <span>Read in {seconds}s</span>}
                  {message.merged_from && message.merged_from.length > 1 && (
                    <span>{message.merged_from.length} files combined</span>
                  )}
                  {message.webhook_summary?.n_webhooks ? (
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="h-3.5 w-3.5" />
                      sent to {message.webhook_summary.delivered}/
                      {message.webhook_summary.n_webhooks}
                    </span>
                  ) : null}
                </div>

                <button
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-faint transition-colors hover:text-muted-foreground"
                >
                  <ChevronRight
                    className={cn("h-3 w-3 transition-transform", detailsOpen && "rotate-90")}
                  />
                  details
                </button>
                {detailsOpen && (
                  <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-5 gap-y-2 font-mono text-[11px] text-faint">
                    <Detail k="reader" v={message.model ?? "—"} />
                    <Detail k="text detection" v={message.ocr_engine ?? "—"} />
                    {message.total_tokens != null && (
                      <Detail k="units used" v={message.total_tokens.toLocaleString()} />
                    )}
                    {message.cost != null && <Detail k="cost" v={`$${message.cost.toFixed(4)}`} />}
                  </div>
                )}
              </div>

              {message.error_message && (
                <div
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]",
                    message.status === "Success"
                      ? "border-flag/40 bg-flag-tint text-flag"
                      : "border-destructive/40 bg-destructive/10 text-destructive",
                  )}
                >
                  {message.status === "Success" ? (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{message.error_message}</span>
                </div>
              )}
            </section>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              {/* LEFT: the document that was read */}
              <section className="space-y-2.5">
                <div className="flex h-8 items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-[0.09em] text-faint">
                    Document
                    {message.merged_filename && (
                      <span className="ml-2 font-mono text-[11px] normal-case tracking-normal text-faint">
                        {message.merged_filename}
                      </span>
                    )}
                  </span>
                  {document && (
                    <Button variant="outline" size="sm" className="h-7" onClick={downloadDocument}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  )}
                </div>

                {documentError ? (
                  <div className="rounded-md border border-line p-6 text-center text-[12px] text-destructive">
                    {documentError}
                  </div>
                ) : document ? (
                  <DocumentPreview
                    file={document}
                    sourceHighlights={message.locations ?? null}
                    activeLocationPath={activePath}
                  />
                ) : message.has_document ? (
                  <Skeleton className="h-[60vh] w-full" />
                ) : (
                  <div className="rounded-md border border-line-soft bg-wash p-8 text-center text-[12px] text-muted-foreground">
                    No document was stored for this email — nothing was attached to read.
                  </div>
                )}

                {message.attachments.length > 0 && (
                  <div className="rounded-md border border-line bg-surface p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium">
                      <Paperclip className="h-3.5 w-3.5" /> Original attachments
                      <span className="font-normal text-faint">({message.attachments.length})</span>
                    </div>
                    {/* Stated once here rather than tagged on each row: a per-file
                        "combined" badge on every row reads as a status to check
                        instead of the norm, when the combined document is already
                        the thing shown above. */}
                    <p className="mb-2 text-[11px] text-faint">{mergedNote(message)}</p>
                    <ul className="space-y-1">
                      {message.attachments.map((att) => (
                        <li key={att.id} className="flex items-center gap-2 text-[12px]">
                          <span className="flex-1 truncate font-mono">{att.filename}</span>
                          <span className="shrink-0 text-faint">
                            {att.size_bytes != null
                              ? `${Math.max(1, Math.round(att.size_bytes / 1024))} KB`
                              : ""}
                          </span>
                          {/* Only the exception is flagged — a file left OUT of the
                              document is the part worth noticing. */}
                          {!att.is_merged && (
                            <span
                              className="shrink-0 rounded-full border border-flag/40 px-1.5 py-0.5 text-[10px] text-flag"
                              title="Not a PDF or image, so it isn't part of the document we read"
                            >
                              not read
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            title="Download"
                            onClick={() => downloadAttachment(att.id, att.filename ?? undefined)}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* RIGHT: result + the email itself */}
              <section className="lg:sticky lg:top-20">
                <Tabs defaultValue="result">
                  <TabsList>
                    <TabsTrigger value="result">Results</TabsTrigger>
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="context">Notes sent</TabsTrigger>
                  </TabsList>

                  <TabsContent value="result" className="mt-4 space-y-4">
                    {message.extracted_data ? (
                      <>
                        <div className="flex items-baseline gap-2.5">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
                          <h2 className="font-serif text-[19px] leading-tight">
                            We found {foundCount} {foundCount === 1 ? "detail" : "details"}.
                          </h2>
                        </div>
                        {message.locations?.length ? (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
                            <span>
                              Click a{" "}
                              <Locate className="inline h-3 w-3 align-[-2px] text-highlight" /> to
                              show where a value came from on the document.
                            </span>
                            {activePath && (
                              <button
                                type="button"
                                onClick={() => setActivePath(null)}
                                className="ml-auto underline decoration-line underline-offset-2 hover:text-ink"
                              >
                                Clear highlight
                              </button>
                            )}
                          </div>
                        ) : null}
                        <ResultForm
                          data={message.extracted_data}
                          locationsByPath={locationsByPath}
                          activePath={activePath}
                          onLocate={onLocate}
                        />
                        <Button variant="outline" size="sm" onClick={copyJson}>
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          {copied ? "Copied" : "Copy results"}
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-md border border-line-soft bg-wash p-8 text-center text-[13px] text-muted-foreground">
                        {message.status === "Skipped"
                          ? "The double-check decided this attachment isn't a real document, so it wasn't read."
                          : message.status === "NoDocuments"
                            ? "This email had no PDF or image attached to read."
                            : "Nothing was read from this message."}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="email" className="mt-4">
                    <div className="rounded-md border border-line bg-surface">
                      <dl className="space-y-1 border-b border-line-soft px-3 py-2.5 text-[12px]">
                        <Row label="Subject" value={message.subject} />
                        <Row
                          label="From"
                          value={`${message.from_name ?? ""} <${message.from_address ?? ""}>`}
                        />
                        <Row label="To" value={(message.to_addresses ?? []).join(", ")} />
                        {message.cc_addresses?.length ? (
                          <Row label="Cc" value={message.cc_addresses.join(", ")} />
                        ) : null}
                        <Row
                          label="Date"
                          value={message.sent_at ? formatDateTime(message.sent_at) : null}
                        />
                        <Row label="Message ID" value={message.message_id} mono />
                      </dl>
                      <div className="max-h-[55vh] overflow-y-auto p-3">
                        {message.body_text ? (
                          <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed">
                            {message.body_text}
                          </pre>
                        ) : (
                          <p className="text-[12.5px] text-muted-foreground">
                            This email had no text body.
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="context" className="mt-4 space-y-2.5">
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      Exactly what the reader was told about this document, built from the subject,
                      sender and body. Kept per run, so reading again can be compared against it.
                    </p>
                    <pre className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-line-soft bg-wash p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                      {message.document_context || "No notes were recorded."}
                    </pre>
                  </TabsContent>
                </Tabs>
              </section>
            </div>
          </>
        )}
      </main>
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

/** Count non-null scalar leaves — the individual details found. */
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

/** One line describing how the attachments became the document above. */
function mergedNote(message: MailMessageDetail): string {
  const included = message.attachments.filter((a) => a.is_merged).length;
  const excluded = message.attachments.length - included;
  const pages = message.merged_page_count;
  const pageText = pages != null ? ` (${pages} page${pages === 1 ? "" : "s"})` : "";

  if (included === 0) return "None of these could be read as a document.";

  const head =
    included === 1
      ? `Read as the document above${pageText}.`
      : `Combined into the single document above${pageText}, in this order.`;

  return excluded > 0
    ? `${head} ${excluded} file${excluded === 1 ? "" : "s"} left out — marked below.`
    : head;
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value || !value.trim() || value === " <>") return null;
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-faint">{label}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}
