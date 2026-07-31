import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { JsonView } from "@/components/extraction/JsonView";
import { formatDateTime, formatRelative } from "@/lib/time";

/**
 * One row of payload history, from either direction.
 *
 * Sent (a destination's history) and received (the built-in receiver) carry
 * different metadata — status codes one way, signature verdicts the other — but
 * the thing you're inspecting is the same JSON body. Normalising to this shape
 * lets both render through one component, so the two lists behave identically
 * instead of drifting apart.
 */
export type DeliveryRecord = {
  id: number;
  /** When it happened (server timestamp, offset-qualified). */
  at: string | null;
  event: string | null;
  subject: string | null;
  payload: Record<string, unknown> | null;
  bytes: number | null;
  documentStripped?: boolean;
  messageId?: number | null;
  /** Where it went — shown when the list spans more than one destination. */
  destination?: { name: string | null; url: string | null } | null;
  /** Outbound only: how the destination responded. */
  outcome?: {
    ok: boolean;
    statusCode: number | null;
    attempts: number | null;
    error: string | null;
    responseSnippet?: string | null;
  };
  /** Inbound only: did the signature verify, and against which webhook. */
  signature?: { state: "valid" | "invalid" | "absent" | null; signedBy: string | null };
  /** Inbound only: the request headers as received. */
  headers?: Record<string, string> | null;
};

export function DeliveryList({
  records,
  emptyHint,
  bodyLabel,
}: {
  records: DeliveryRecord[];
  emptyHint: React.ReactNode;
  /** What the JSON represents, e.g. "What the consumer received". */
  bodyLabel: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (records.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed p-6 text-center space-y-1">
        <Inbox className="h-8 w-8 text-muted-foreground/50 mx-auto" />
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {records.map((record) => {
        const open = expanded === record.id;
        return (
          <li key={record.id} className="rounded-lg border bg-card min-w-0">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : record.id)}
              className="w-full text-left p-3 flex items-start gap-2 hover:bg-accent/40 transition-colors rounded-lg"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {record.event && (
                    <Badge variant="secondary" className="text-[10px]">
                      {record.event}
                    </Badge>
                  )}
                  <span className="text-sm truncate">
                    {record.subject || <span className="text-muted-foreground">(no subject)</span>}
                  </span>
                </div>
                {record.destination && (
                  <div
                    className="text-xs text-muted-foreground truncate mt-0.5"
                    title={record.destination.url ?? undefined}
                  >
                    → {record.destination.name ?? "(deleted destination)"}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center flex-wrap gap-x-2">
                  <span title={formatDateTime(record.at)}>{formatRelative(record.at)}</span>
                  {record.bytes != null && <span>· {formatBytes(record.bytes)}</span>}
                  {record.messageId ? <span>· message #{record.messageId}</span> : null}
                  {record.outcome && <OutcomeChip outcome={record.outcome} />}
                  {record.signature && <SignatureChip signature={record.signature} />}
                </div>
              </div>
            </button>

            {open && (
              // min-w-0 so the JSON viewer scrolls inside itself rather than
              // stretching the row.
              <div className="border-t p-3 space-y-3 min-w-0">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{bodyLabel}</Label>
                    {/* The row header toggles too, but that stops being obvious
                        once the payload fills the panel. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setExpanded(null)}
                    >
                      <X className="h-3.5 w-3.5" /> Close
                    </Button>
                  </div>
                  <div className="mt-1.5">
                    {record.payload ? (
                      <JsonView value={record.payload} />
                    ) : (
                      // A bare `null` in the viewer reads as "the payload was
                      // null", which is misleading: it means the body wasn't
                      // recorded for this attempt.
                      <div className="rounded-lg border-2 border-dashed p-4 text-xs text-muted-foreground">
                        The body wasn't recorded for this delivery. Payloads are stored from the
                        moment the sending process picks up that change — a long-running worker
                        started earlier keeps dispatching without them until it's restarted.
                      </div>
                    )}
                  </div>
                  {record.documentStripped && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      The document was included base64-encoded; its size is shown in place of the
                      bytes so this view stays readable.
                    </p>
                  )}
                </div>

                {record.outcome?.error && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 break-words">
                    {record.outcome.error}
                  </p>
                )}
                {record.outcome?.responseSnippet && (
                  <details>
                    <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                      Response from the destination
                    </summary>
                    <pre className="mt-1.5 text-[11px] font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                      {record.outcome.responseSnippet}
                    </pre>
                  </details>
                )}
                {record.headers && (
                  <details>
                    <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                      Request headers
                    </summary>
                    <div className="mt-1.5">
                      <JsonView value={record.headers} />
                    </div>
                  </details>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Outbound result: whether the destination accepted it. */
function OutcomeChip({ outcome }: { outcome: NonNullable<DeliveryRecord["outcome"]> }) {
  if (outcome.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3 w-3" /> HTTP {outcome.statusCode}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"
      title={outcome.error ?? undefined}
    >
      <ShieldAlert className="h-3 w-3" />
      {outcome.statusCode ? `HTTP ${outcome.statusCode}` : "no response"}
      {outcome.attempts ? ` · ${outcome.attempts} attempt${outcome.attempts > 1 ? "s" : ""}` : ""}
    </span>
  );
}

/** Inbound verdict — the same check a consumer's own code performs. */
function SignatureChip({ signature }: { signature: NonNullable<DeliveryRecord["signature"]> }) {
  if (signature.state === "valid") {
    return (
      <span
        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"
        title={`X-Signature verified against "${signature.signedBy}"`}
      >
        <ShieldCheck className="h-3 w-3" /> signature valid
      </span>
    );
  }
  if (signature.state === "invalid") {
    return (
      <span
        className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"
        title="X-Signature did not match any active webhook secret"
      >
        <ShieldAlert className="h-3 w-3" /> signature mismatch
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-muted-foreground"
      title="No X-Signature header — the webhook has no signing secret set"
    >
      <ShieldQuestion className="h-3 w-3" /> unsigned
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
