import { useState } from "react";
import { toast } from "sonner";
import { History, Loader2, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DeliveryList, type DeliveryRecord } from "@/components/mail/DeliveryList";
import { errorMessage } from "@/lib/ai-api";
import {
  deleteWebhook,
  fetchDeliveries,
  testWebhook,
  updateWebhook,
  type MailWebhook,
  type WebhookDelivery,
} from "@/lib/mailbox-api";

/**
 * The connected destinations, each expandable into the payloads sent to it.
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
      toast.error(errorMessage(e, "Could not update the webhook"));
    }
  };

  const remove = async (hook: MailWebhook) => {
    if (!confirm(`Delete webhook "${hook.name}"?`)) return;
    try {
      await deleteWebhook(hook.id);
      if (historyId === hook.id) setHistoryId(null);
      onChanged();
      toast.success("Webhook deleted");
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete the webhook"));
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
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
      </div>
    );
  }

  if (hooks.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed p-8 text-center space-y-1">
        <p className="text-sm font-medium">No webhooks connected</p>
        <p className="text-xs text-muted-foreground">
          Add one under <strong>Add webhook</strong>, or use the <strong>Test receiver</strong> to
          see the payload shape first. Extractions are stored either way — a webhook only forwards
          them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hooks.map((hook) => {
        const open = historyId === hook.id;
        return (
          <div key={hook.id} className="rounded-lg border min-w-0">
            <div className="flex items-start gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{hook.name}</span>
                  {hook.include_document && (
                    <Badge variant="secondary" className="text-[10px]">
                      +document
                    </Badge>
                  )}
                  {!hook.is_active && (
                    <Badge variant="outline" className="text-[10px]">
                      Paused
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate" title={hook.url}>
                  {hook.url}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {hook.events.map((e) => (
                    <Badge key={e} variant="outline" className="text-[10px]">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={hook.is_active}
                  onCheckedChange={() => toggleActive(hook)}
                  title={hook.is_active ? "Active" : "Paused"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${open ? "bg-accent" : ""}`}
                  title={open ? "Hide sent payloads" : "Show sent payloads"}
                  onClick={() => loadHistory(hook)}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Send a test payload"
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
                  className="h-7 w-7 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                  title="Delete"
                  onClick={() => remove(hook)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {open && (
              <div className="border-t bg-muted/20 p-3 min-w-0">
                {historyLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sent payloads…
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium">
                        Sent payloads{" "}
                        <span className="text-muted-foreground">({records(hook).length})</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs ml-auto"
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
                          Nothing delivered yet. Press the <strong>send</strong> icon above, or sync
                          a mailbox with a matching event.
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
