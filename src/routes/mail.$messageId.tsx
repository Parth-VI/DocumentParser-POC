import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Braces,
  Check,
  Copy,
  Download,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Webhook as WebhookIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/routes/mail.index";
import { DocumentPreview } from "@/components/extraction/DocumentPreview";
import { JsonView } from "@/components/extraction/JsonView";
import { ResultView } from "@/components/extraction/ResultView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  // The document is always visible on this screen, so locating is just a toggle.
  const onLocate = (path: string) => {
    setActivePath((curr) => (curr === path ? null : path));
  };

  const reprocess = async () => {
    setReprocessing(true);
    const toastId = toast.loading("Re-extracting with the tenant's current schema…");
    try {
      const result = await reprocessMessage(id);
      toast.success(`Re-extraction finished: ${result.status}`, { id: toastId });
      await load();
    } catch (e) {
      toast.error(errorMessage(e, "Re-extraction failed"), { id: toastId });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <AppHeader
        subtitle="Extracted mail — document, result, and the email it came from"
        right={
          <div className="flex items-center gap-2">
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
              Re-extract
            </Button>
          </div>
        }
      />

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
        <Link
          to="/mail"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </Link>

        {loading && !message ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <div className="grid lg:grid-cols-2 gap-6">
              <Skeleton className="h-[60vh] w-full" />
              <Skeleton className="h-[60vh] w-full" />
            </div>
          </div>
        ) : !message ? (
          <div className="rounded-xl border-2 border-dashed p-12 text-center text-sm text-muted-foreground">
            This message no longer exists.
          </div>
        ) : (
          <>
            {/* Mail header */}
            <section className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start gap-3 flex-wrap">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold leading-snug break-words">
                    {message.subject || <span className="text-muted-foreground">(no subject)</span>}
                  </h2>
                  <div className="text-xs text-muted-foreground mt-1 space-x-2">
                    <span>
                      From{" "}
                      <strong className="text-foreground">
                        {message.from_name || message.from_address}
                      </strong>
                      {message.from_name && ` <${message.from_address}>`}
                    </span>
                    {message.received_at && <span>· {formatDateTime(message.received_at)}</span>}
                    {message.account_email && <span>· to {message.account_email}</span>}
                  </div>
                </div>
                <StatusBadge status={message.status} />
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                {message.model && <Badge variant="secondary">Model: {message.model}</Badge>}
                <Badge variant="secondary">OCR: {message.ocr_engine ?? "—"}</Badge>
                {message.page_count != null && (
                  <Badge variant="secondary">Pages: {message.page_count}</Badge>
                )}
                {message.response_time_ms != null && (
                  <Badge variant="secondary">
                    Time: {(message.response_time_ms / 1000).toFixed(2)} s
                  </Badge>
                )}
                {message.cost != null && (
                  <Badge variant="secondary">Cost: ${message.cost.toFixed(4)}</Badge>
                )}
                {message.total_tokens != null && (
                  <Badge variant="secondary">Tokens: {message.total_tokens.toLocaleString()}</Badge>
                )}
                {message.merged_from && message.merged_from.length > 1 && (
                  <Badge variant="secondary" title={message.merged_from.join(", ")}>
                    Merged: {message.merged_from.length} files
                  </Badge>
                )}
                {message.webhook_summary?.n_webhooks ? (
                  <Badge variant="secondary" className="gap-1">
                    <WebhookIcon className="h-3 w-3" />
                    {message.webhook_summary.delivered}/{message.webhook_summary.n_webhooks}{" "}
                    delivered
                  </Badge>
                ) : null}
              </div>

              {message.error_message && (
                <div
                  className={`rounded-md border text-xs px-3 py-2 flex items-start gap-2 ${
                    message.status === "Success"
                      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                      : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100"
                  }`}
                >
                  {message.status === "Success" ? (
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  )}
                  <span>{message.error_message}</span>
                </div>
              )}
            </section>

            <div className="grid lg:grid-cols-2 gap-6 items-start">
              {/* LEFT: the document that was extracted */}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Document
                    {message.merged_filename && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground font-mono">
                        {message.merged_filename}
                      </span>
                    )}
                  </h3>
                  {document && (
                    <Button variant="outline" size="sm" onClick={downloadDocument}>
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  )}
                </div>

                {documentError ? (
                  <div className="rounded-lg border p-6 text-center text-xs text-rose-600 dark:text-rose-400">
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
                  <div className="rounded-lg border-2 border-dashed p-8 text-center text-xs text-muted-foreground">
                    No document was stored for this email — nothing merged from its attachments.
                  </div>
                )}

                {message.attachments.length > 0 && (
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs font-medium mb-1 flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5" /> Original attachments
                      <span className="font-normal text-muted-foreground">
                        ({message.attachments.length})
                      </span>
                    </div>
                    {/* Stated once here rather than tagged on each row: a per-file
                        "merged" badge on every row reads as a status to check
                        instead of the norm, when the merged document is already
                        the thing shown above. */}
                    <p className="text-[11px] text-muted-foreground mb-2">{mergedNote(message)}</p>
                    <ul className="space-y-1">
                      {message.attachments.map((att) => (
                        <li key={att.id} className="flex items-center gap-2 text-xs">
                          <span className="truncate flex-1 font-mono">{att.filename}</span>
                          <span className="text-muted-foreground shrink-0">
                            {att.size_bytes != null
                              ? `${Math.max(1, Math.round(att.size_bytes / 1024))} KB`
                              : ""}
                          </span>
                          {/* Only the exception is flagged — a file left OUT of the
                              document is the part worth noticing. */}
                          {!att.is_merged && (
                            <Badge
                              variant="outline"
                              className="text-[10px] shrink-0 text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-500/40"
                              title="Not a PDF or image, so it isn't part of the extracted document"
                            >
                              not in document
                            </Badge>
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
                    <TabsTrigger value="result">Extracted data</TabsTrigger>
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="context">Context sent</TabsTrigger>
                  </TabsList>

                  <TabsContent value="result" className="mt-3 space-y-3">
                    {message.extracted_data ? (
                      <>
                        {message.locations?.length ? (
                          <>
                            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                              <span className="font-medium">
                                {locationsByPath.size} value(s) located on the document
                              </span>
                              <span className="text-muted-foreground/80">
                                — click a pin to highlight it (may not be accurate)
                              </span>
                              {activePath && (
                                <button
                                  type="button"
                                  onClick={() => setActivePath(null)}
                                  className="ml-auto underline underline-offset-2 hover:text-foreground"
                                >
                                  Clear highlight
                                </button>
                              )}
                            </div>
                            <ResultView
                              data={message.extracted_data}
                              locationsByPath={locationsByPath}
                              activePath={activePath}
                              onLocate={onLocate}
                            />
                          </>
                        ) : (
                          <JsonView value={message.extracted_data} />
                        )}
                        <Button variant="outline" size="sm" onClick={copyJson}>
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          {copied ? "Copied" : "Copy JSON"}
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground">
                        {message.status === "Skipped"
                          ? "The relevance check decided this attachment isn't a document, so no tokens were spent."
                          : message.status === "NoDocuments"
                            ? "This email had no PDF or image attachment to extract."
                            : "No data was extracted for this message."}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="email" className="mt-3">
                    <div className="rounded-lg border bg-card">
                      <dl className="px-3 py-2 text-xs space-y-1 border-b">
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
                        <Row label="Message-ID" value={message.message_id} mono />
                      </dl>
                      <div className="p-3 max-h-[55vh] overflow-y-auto">
                        {message.body_text ? (
                          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">
                            {message.body_text}
                          </pre>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            This email had no text body.
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="context" className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Braces className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Exactly what the model was told about this document, built from the subject,
                      sender and body. Stored per run, so a re-extraction can be compared against
                      it.
                    </p>
                    <pre className="rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap max-h-[55vh] overflow-y-auto">
                      {message.document_context || "No context was recorded."}
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

/** One line describing how the attachments became the document above. */
function mergedNote(message: MailMessageDetail): string {
  const included = message.attachments.filter((a) => a.is_merged).length;
  const excluded = message.attachments.length - included;
  const pages = message.merged_page_count;
  const pageText = pages != null ? ` (${pages} page${pages === 1 ? "" : "s"})` : "";

  if (included === 0) return "None of these could be extracted as a document.";

  const head =
    included === 1
      ? `Extracted as the document above${pageText}.`
      : `Combined into the single document above${pageText}, in this order.`;

  return excluded > 0
    ? `${head} ${excluded} file${excluded === 1 ? "" : "s"} left out — marked below.`
    : head;
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value || !value.trim() || value === " <>") return null;
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words ${mono ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}
