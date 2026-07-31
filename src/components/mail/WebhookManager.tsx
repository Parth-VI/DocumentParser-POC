import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Webhook as WebhookIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectedWebhooks } from "@/components/mail/ConnectedWebhooks";
import { WebhookSink } from "@/components/mail/WebhookSink";
import { errorMessage } from "@/lib/ai-api";
import {
  createWebhook,
  fetchWebhooks,
  MAIL_STATUSES,
  type MailStatus,
  type MailWebhook,
} from "@/lib/mailbox-api";

const DEFAULT_EVENTS: MailStatus[] = ["Success"];

/**
 * Manage the destinations that receive each extraction. The payload carries the
 * extracted data plus the mail subject, body, and the merged document — the whole
 * point being that a consumer needs the source email, not just the fields.
 */
export function WebhookManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [hooks, setHooks] = useState<MailWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("connected");

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<MailStatus[]>(DEFAULT_EVENTS);
  const [includeDocument, setIncludeDocument] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setHooks(await fetchWebhooks());
    } catch (e) {
      toast.error(errorMessage(e, "Could not load webhooks"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const toggleEvent = (event: MailStatus) => {
    setEvents((curr) =>
      curr.includes(event) ? curr.filter((e) => e !== event) : [...curr, event],
    );
  };

  const create = async () => {
    setCreating(true);
    try {
      const hook = await createWebhook({
        name: name.trim(),
        url: url.trim(),
        events,
        include_document: includeDocument,
        secret: secret.trim() || null,
      });
      setHooks((curr) => [hook, ...curr]);
      setName("");
      setUrl("");
      setSecret("");
      setEvents(DEFAULT_EVENTS);
      toast.success("Webhook created");
      // Show it where the list lives, rather than leaving the form looking idle.
      setTab("connected");
    } catch (e) {
      toast.error(errorMessage(e, "Could not create the webhook"));
    } finally {
      setCreating(false);
    }
  };

  const canCreate = !!name.trim() && /^https?:\/\//.test(url.trim()) && events.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow-x-hidden: DialogContent is a grid, whose items default to
          min-width:auto — a long unbreakable URL would otherwise widen the dialog
          and add a horizontal scrollbar instead of being clamped. */}
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WebhookIcon className="h-4 w-4" /> Mail webhooks
          </DialogTitle>
          <DialogDescription>
            Each delivery POSTs the extracted data together with the mail subject, body, sender, and
            the merged document.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="add">Add webhook</TabsTrigger>
            <TabsTrigger value="connected">
              Connected webhooks 
              {hooks.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">{hooks.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="receiver">Test receiver</TabsTrigger>
          </TabsList>

          <TabsContent value="connected" className="mt-3 min-w-0">
            {/* The list and each destination's sent payloads together — managing a
                destination and seeing what it received is one task. */}
            <ConnectedWebhooks hooks={hooks} loading={loading} onChanged={load} />
          </TabsContent>

          <TabsContent value="receiver" className="mt-3 min-w-0">
            {/* Lets the payload be inspected before a real consumer exists. */}
            <WebhookSink onWebhookCreated={load} />
          </TabsContent>

          <TabsContent value="add" className="mt-3 space-y-3 min-w-0">
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ERP import"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Signing secret (optional)</Label>
                  <Input
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="adds X-Signature"
                    className="mt-1 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">URL</Label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-app.example/hooks/mail-extraction"
                    className="mt-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">Deliver on</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MAIL_STATUSES.filter((s) => s !== "Pending").map((event) => (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleEvent(event)}
                      aria-pressed={events.includes(event)}
                      className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                        events.includes(event)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-accent"
                      }`}
                    >
                      {event}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Switch
                  id="include-doc"
                  checked={includeDocument}
                  onCheckedChange={setIncludeDocument}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="include-doc" className="text-sm">
                    Embed the document
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sends the merged PDF as base64. Off means the payload carries only a URL the
                    consumer can fetch.
                  </p>
                </div>
              </div>

              <Button size="sm" onClick={create} disabled={!canCreate || creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Add webhook
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
