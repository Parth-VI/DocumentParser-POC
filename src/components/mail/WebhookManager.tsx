import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Link2, Loader2, Plus } from "lucide-react";
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
import { statusLabel } from "@/routes/mail.index";
import { cn } from "@/lib/utils";
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
 * Manage the destinations that receive each result. The payload carries the
 * extracted details plus the mail subject, body, and the merged document — the
 * whole point being that a consumer needs the source email, not just the fields.
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
  const [advOpen, setAdvOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setHooks(await fetchWebhooks());
    } catch (e) {
      toast.error(errorMessage(e, "Could not load connections"));
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
      toast.success("Connection added");
      // Show it where the list lives, rather than leaving the form looking idle.
      setTab("connected");
    } catch (e) {
      toast.error(errorMessage(e, "Could not add the connection"));
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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-[20px] font-normal">
            <Link2 className="h-4 w-4" /> Where results go
          </DialogTitle>
          <DialogDescription>
            Send each document's details to another system the moment it's read — together with the
            email's subject, body, sender, and the document itself.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="add">Add a connection</TabsTrigger>
            <TabsTrigger value="connected">
              Connections
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
            {/* Lets the results be inspected before a real consumer exists. */}
            <WebhookSink onWebhookCreated={load} />
          </TabsContent>

          <TabsContent value="add" className="mt-3 min-w-0 space-y-3">
            <div className="space-y-3 rounded-md border border-line p-3.5">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Accounting system"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Where to send results</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-app.example/incoming"
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <Label className="mb-1.5 block text-xs">Send when</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MAIL_STATUSES.filter((s) => s !== "Pending").map((event) => (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleEvent(event)}
                      aria-pressed={events.includes(event)}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
                        events.includes(event)
                          ? "border-ink bg-ink text-paper"
                          : "border-line bg-paper text-muted-foreground hover:border-ink hover:text-ink",
                      )}
                    >
                      {statusLabel(event)}
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
                    Include the document
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Sends the full document too. Off sends just a link the receiver can fetch.
                  </p>
                </div>
              </div>

              {/* Signing secret is a developer detail, kept off the main surface. */}
              <div className="border-t border-line-soft pt-3">
                <button
                  type="button"
                  onClick={() => setAdvOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-faint transition-colors hover:text-ink"
                >
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 transition-transform", advOpen && "rotate-90")}
                  />
                  Advanced setup
                </button>
                {advOpen && (
                  <div className="mt-3">
                    <Label className="text-xs text-faint">Signing secret (optional)</Label>
                    <Input
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="adds an X-Signature header"
                      className="mt-1 font-mono"
                    />
                    <p className="mt-1 text-[11px] text-faint">
                      Lets the receiver verify each delivery really came from here.
                    </p>
                  </div>
                )}
              </div>

              <Button size="sm" onClick={create} disabled={!canCreate || creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Add connection
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
