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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { JsonView } from "@/components/extraction/JsonView";
import { formatDateTime, formatRelative } from "@/lib/time";

/**
 * One row of delivery history, from either direction.
 *
 * Sent (a destination's history) and received (the built-in receiver) carry
 * different metadata — status codes one way, signature verdicts the other — but
 * the thing you're inspecting is the same results body. Normalising to this shape
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
  /** Inbound only: did the signature verify, and against which connection. */
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
  /** What the body represents, e.g. "What the consumer received". */
  bodyLabel: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (records.length === 0) {
    return (
      <div className="rounded-md border border-line-soft bg-wash p-6 text-center">
        <Inbox className="mx-auto h-8 w-8 text-faint" />
        <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {records.map((record) => {
        const open = expanded === record.id;
        return (
          <li key={record.id} className="min-w-0 rounded-md border border-line bg-surface">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : record.id)}
              className="flex w-full items-start gap-2 rounded-md p-3 text-left transition-colors hover:bg-wash"
            >
              {open ? (
                <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              ) : (
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {record.event && (
                    <span className="rounded-full border border-line bg-wash px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {record.event}
                    </span>
                  )}
                  <span className="truncate text-sm">
                    {record.subject || <span className="text-faint">(no subject)</span>}
                  </span>
                </div>
                {record.destination && (
                  <div
                    className="mt-0.5 truncate text-xs text-muted-foreground"
                    title={record.destination.url ?? undefined}
                  >
                    → {record.destination.name ?? "(removed connection)"}
                  </div>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
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
              <div className="min-w-0 space-y-3 border-t border-line-soft p-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{bodyLabel}</Label>
                    {/* The row header toggles too, but that stops being obvious
                        once the body fills the panel. */}
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
                      // A bare `null` in the viewer reads as "the results were
                      // null", which is misleading: it means the body wasn't
                      // recorded for this attempt.
                      <div className="rounded-md border border-line-soft bg-wash p-4 text-xs text-muted-foreground">
                        The body wasn't recorded for this delivery. Results are stored from the
                        moment the sending process picks up that change — a long-running worker
                        started earlier keeps sending without them until it's restarted.
                      </div>
                    )}
                  </div>
                  {record.documentStripped && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      The document was included in full; its size is shown in place of the bytes so
                      this view stays readable.
                    </p>
                  )}
                </div>

                {record.outcome?.error && (
                  <p className="break-words text-[11px] text-destructive">{record.outcome.error}</p>
                )}
                {record.outcome?.responseSnippet && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-ink">
                      Response from the destination
                    </summary>
                    <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-wash p-2 font-mono text-[11px]">
                      {record.outcome.responseSnippet}
                    </pre>
                  </details>
                )}
                {record.headers && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-ink">
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
      <span className="inline-flex items-center gap-1 text-ok">
        <ShieldCheck className="h-3 w-3" /> HTTP {outcome.statusCode}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-destructive"
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
        className="inline-flex items-center gap-1 text-ok"
        title={`Signature verified against "${signature.signedBy}"`}
      >
        <ShieldCheck className="h-3 w-3" /> signature valid
      </span>
    );
  }
  if (signature.state === "invalid") {
    return (
      <span
        className="inline-flex items-center gap-1 text-destructive"
        title="Signature did not match any active connection secret"
      >
        <ShieldAlert className="h-3 w-3" /> signature mismatch
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-muted-foreground"
      title="No signature header — the connection has no signing secret set"
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
