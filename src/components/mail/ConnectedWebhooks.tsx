import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, History, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DeliveryList, type DeliveryRecord } from "@/components/mail/DeliveryList";
import { statusLabel } from "@/routes/mail.index";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/ai-api";
import {
  deleteWebhook,
  fetchDeliveries,
  testWebhook,
  updateWebhook,
  type MailStatus,
  type MailWebhook,
  type WebhookDelivery,
} from "@/lib/mailbox-api";

/**
 * The connected destinations, each expandable into the results sent to it.
 *
 * The list and its history live together here rather than beside the create form:
 * managing a destination and inspecting what it received are the same task, and
 * the form only matters once.
 */
export function ConnectedWebhooks({
  hooks,
  loading,
  onChanged,
}: {
  hooks: MailWebhook[];
  loading: boolean;
  /** Refresh the parent's list after a toggle or delete. */
  onChanged: () => void;
}) {
  const [testingId, setTestingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [advId, setAdvId] = useState<number | null>(null);
  const [history, setHistory] = useState<WebhookDelivery[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async (hook: MailWebhook, force = false) => {
    if (historyId === hook.id && !force) {
      setHistoryId(null);
      return;
    }
    setHistoryId(hook.id);
    setHistoryLoading(true);
    try {
      const res = await fetchDeliveries(hook.id);
      setHistory(res.deliveries);
    } catch (e) {
      toast.error(errorMessage(e, "Could not load the delivery history"));
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleActive = async (hook: MailWebhook) => {
    try {
      await updateWebhook(hook.id, { is_active: !hook.is_active });
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Could not update the connection"));
    }
  };

  const remove = async (hook: MailWebhook) => {
    if (!confirm(`Remove the connection "${hook.name}"?`)) return;
    try {
      await deleteWebhook(hook.id);
      if (historyId === hook.id) setHistoryId(null);
      onChanged();
      toast.success("Connection removed");
    } catch (e) {
      toast.error(errorMessage(e, "Could not remove the connection"));
    }
  };

  const send = async (hook: MailWebhook) => {
    setTestingId(hook.id);
    try {
      const result = await testWebhook(hook.id);
      if (result.ok) toast.success(`Delivered — HTTP ${result.status_code}`);
      else toast.error(`Failed after ${result.attempts} attempt(s): ${result.error ?? "unknown"}`);
      // Open (or refresh) this destination's history so the result is right there.
      await loadHistory(hook, true);
    } catch (e) {
      toast.error(errorMessage(e, "Test delivery failed"));
    } finally {
      setTestingId(null);
    }
  };

  const records = (hook: MailWebhook): DeliveryRecord[] =>
    history
      .filter((d) => d.webhook_id === hook.id)
      .map((d) => ({
        id: d.id,
        at: d.created_at,
        event: d.event,
        subject: d.subject,
        payload: d.payload,
        bytes: d.payload_bytes,
        documentStripped: d.document_stripped,
        messageId: d.message_id,
        outcome: {
          ok: d.ok,
          statusCode: d.status_code,
          attempts: d.attempts,
          error: d.error,
          responseSnippet: d.response_snippet,
        },
      }));

  if (loading && hooks.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
    );
  }

  if (hooks.length === 0) {
    return (
      <div className="rounded-md border border-line-soft bg-wash p-8 text-center">
        <p className="text-sm font-medium">No connections yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Add one under <strong>Add a connection</strong>, or use the <strong>Test receiver</strong>{" "}
          to see what a delivery looks like first. Results are always saved here either way — a
          connection only forwards them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hooks.map((hook) => {
        const open = historyId === hook.id;
        const advOpen = advId === hook.id;
        return (
          <div key={hook.id} className="min-w-0 rounded-md border border-line">
            <div className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{hook.name}</span>
                  {hook.include_document && (
                    <span className="rounded-full border border-line bg-wash px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      with document
                    </span>
                  )}
                  {!hook.is_active && (
                    <span className="rounded-full border border-line bg-paper px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Paused
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {hook.events.map((e) => (
                    <span
                      key={e}
                      className="rounded-full border border-line bg-wash px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {statusLabel(e as MailStatus)}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setAdvId(advOpen ? null : hook.id)}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-faint transition-colors hover:text-ink"
                >
                  <ChevronRight
                    className={cn("h-3 w-3 transition-transform", advOpen && "rotate-90")}
                  />
                  Advanced setup
                </button>
                {advOpen && (
                  <div
                    className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-faint"
                    title={hook.url}
                  >
                    POST {hook.url}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={hook.is_active}
                  onCheckedChange={() => toggleActive(hook)}
                  title={hook.is_active ? "Active" : "Paused"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-7 w-7", open && "bg-wash-2")}
                  title={open ? "Hide what was sent" : "Show what was sent"}
                  onClick={() => loadHistory(hook)}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Send a test delivery"
                  onClick={() => send(hook)}
                  disabled={testingId === hook.id}
                >
                  {testingId === hook.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Remove"
                  onClick={() => remove(hook)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {open && (
              <div className="min-w-0 border-t border-line-soft bg-wash/50 p-3">
                {historyLoading ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading what was sent…
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium">
                        What we've sent{" "}
                        <span className="text-muted-foreground">({records(hook).length})</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 text-xs"
                        onClick={() => loadHistory(hook, true)}
                      >
                        Refresh
                      </Button>
                    </div>
                    <DeliveryList
                      records={records(hook)}
                      bodyLabel="What was sent to this destination"
                      emptyHint={
                        <>
                          Nothing sent yet. Press the <strong>send</strong> icon above, or fetch
                          mail matching one of the events above.
                        </>
                      }
                    />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
