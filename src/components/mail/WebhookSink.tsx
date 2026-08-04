import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DeliveryList, type DeliveryRecord } from "@/components/mail/DeliveryList";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/ai-api";
import { copyText } from "@/lib/clipboard";
import {
  clearSinkEntries,
  fetchSinkEntries,
  registerSinkWebhook,
  type SinkEntry,
} from "@/lib/mailbox-api";

/**
 * The built-in test receiver.
 *
 * Point a connection here and you see precisely what an external system would
 * get — headers, signature verdict, and the full results body. That removes the
 * chicken-and-egg of needing a working endpoint before you can tell whether the
 * results are right. Rendered through the same DeliveryList as a destination's
 * own history, so both read identically.
 */
export function WebhookSink({ onWebhookCreated }: { onWebhookCreated?: () => void }) {
  const [entries, setEntries] = useState<SinkEntry[]>([]);
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetchSinkEntries();
      setEntries(res.entries);
      setUrl(res.url);
    } catch (e) {
      if (!quiet) toast.error(errorMessage(e, "Could not load received deliveries"));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while the panel is open so a delivery appears without a manual refresh.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  const records = useMemo<DeliveryRecord[]>(
    () =>
      entries.map((entry) => ({
        id: entry.id,
        at: entry.received_at,
        event: entry.event,
        subject: entry.subject,
        payload: entry.body,
        bytes: entry.body_bytes,
        documentStripped: entry.document_stripped,
        messageId: entry.mail_message_id,
        signature: { state: entry.signature_state, signedBy: entry.signed_by },
        headers: entry.headers,
      })),
    [entries],
  );

  const register = async () => {
    setRegistering(true);
    try {
      const hook = await registerSinkWebhook();
      toast.success(`"${hook.name}" is now delivering here`);
      onWebhookCreated?.();
    } catch (e) {
      toast.error(errorMessage(e, "Could not create the test connection"));
    } finally {
      setRegistering(false);
    }
  };

  const clear = async () => {
    try {
      const res = await clearSinkEntries();
      setEntries([]);
      toast.success(res.removed ? `Cleared ${res.removed} delivery(ies)` : "Nothing to clear");
    } catch (e) {
      toast.error(errorMessage(e, "Could not clear the receiver"));
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border border-line bg-surface p-3">
        <p className="text-xs text-muted-foreground">
          Deliveries sent to this address are captured below with their headers and full body — so
          you can confirm the results before wiring up a real system.
        </p>
        <div className="flex items-start gap-2">
          {/* break-all rather than truncate: this URL is meant to be read and
              pasted, and wrapping keeps it fully visible without widening the
              dialog the way an unbreakable string would. */}
          <code className="min-w-0 flex-1 break-all rounded bg-wash px-2 py-1.5 font-mono text-[11px]">
            {url || "…"}
          </code>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="Copy the receiver address"
            onClick={async () => {
              if (await copyText(url)) toast.success("Address copied");
            }}
            disabled={!url}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={register} disabled={registering}>
            {registering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> Deliver here
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Creates a signed connection pointing at this receiver, for every event.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">
          Received{" "}
          {entries.length > 0 && <span className="text-muted-foreground">({entries.length})</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="sink-auto" className="cursor-pointer text-xs text-muted-foreground">
            Live
          </Label>
          <Switch id="sink-auto" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Refresh"
            onClick={() => load()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            title="Clear all"
            onClick={clear}
            disabled={entries.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <DeliveryList
          records={records}
          bodyLabel="What the receiver got"
          emptyHint={
            <>
              Nothing received yet. Click <strong>Deliver here</strong>, then either press the{" "}
              <strong>send</strong> icon on that connection or fetch mail.
            </>
          }
        />
      )}
    </div>
  );
}
