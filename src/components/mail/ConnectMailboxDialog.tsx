import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Plug } from "lucide-react";
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
import { errorMessage } from "@/lib/ai-api";
import { fetchTenants, type Tenant } from "@/lib/document-ai";
import {
  connectMailbox,
  testMailboxConnection,
  IMAP_PRESETS,
  type ImapCredentials,
  type MailAccount,
  type ProbeResult,
} from "@/lib/mailbox-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: (account: MailAccount) => void;
  /** Surfaced from /mailbox/config: without a key we can't store the password. */
  encryptionReady: boolean;
};

const EMPTY: ImapCredentials = {
  email: "",
  password: "",
  imap_host: "imap.gmail.com",
  imap_port: 993,
  use_ssl: true,
  folder: "INBOX",
};

export function ConnectMailboxDialog({ open, onOpenChange, onConnected, encryptionReady }: Props) {
  const [creds, setCreds] = useState<ImapCredentials>(EMPTY);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [model, setModel] = useState<"tenant" | "claude" | "openai">("tenant");
  const [markAsRead, setMarkAsRead] = useState(true);
  const [skipRelevance, setSkipRelevance] = useState(false);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProbe(null);
    void fetchTenants()
      .then(setTenants)
      .catch((e) => toast.error(errorMessage(e, "Could not load tenants")));
  }, [open]);

  // Credential edits invalidate a previous green tick.
  const patch = (next: Partial<ImapCredentials>) => {
    setCreds((curr) => ({ ...curr, ...next }));
    setProbe(null);
  };

  const preset = IMAP_PRESETS.find((p) => p.host === creds.imap_host);
  const canTest = !!creds.email && !!creds.password && !!creds.imap_host;
  const canConnect = canTest && !!tenantId && encryptionReady;

  const test = async () => {
    setTesting(true);
    try {
      const result = await testMailboxConnection(creds);
      setProbe(result);
      toast.success(`Connected — ${result.unseen} unread of ${result.total} in ${result.folder}`);
    } catch (e) {
      setProbe(null);
      toast.error(errorMessage(e, "Connection failed"));
    } finally {
      setTesting(false);
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const account = await connectMailbox({
        ...creds,
        tenant_id: Number(tenantId),
        tenant_name: tenants.find((t) => t.id === tenantId)?.name ?? null,
        model: model === "tenant" ? null : model,
        mark_as_read: markAsRead,
        skip_relevance_check: skipRelevance,
      });
      toast.success(`${account.email} connected`);
      onConnected(account);
      onOpenChange(false);
      setCreds(EMPTY);
      setTenantId("");
    } catch (e) {
      toast.error(errorMessage(e, "Could not connect the mailbox"));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" /> Connect a mailbox
          </DialogTitle>
          <DialogDescription>
            Unread mail is fetched, its attachments merged into one document, and extracted with the
            chosen tenant's schema. The subject and body become the document context.
          </DialogDescription>
        </DialogHeader>

        {!encryptionReady && (
          <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 text-xs px-3 py-2 flex items-start gap-2">
            <KeyRound className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              <strong>MAILBOX_ENCRYPTION_KEY is not set</strong> on the service, so the password
              can't be stored encrypted. Testing works; connecting is blocked until the key is
              added.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {IMAP_PRESETS.map((p) => (
              <button
                key={p.host}
                type="button"
                onClick={() => patch({ imap_host: p.host, imap_port: p.port })}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  creds.imap_host === p.host
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Email address</Label>
              <Input
                type="email"
                value={creds.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="you@company.com"
                className="mt-1 font-mono"
                autoComplete="off"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">App password</Label>
              <Input
                type="password"
                value={creds.password}
                onChange={(e) => patch({ password: e.target.value })}
                placeholder="16-character app password"
                className="mt-1 font-mono"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {preset?.hint ?? "Use a provider app password, not your login password."}
              </p>
            </div>
            <div>
              <Label className="text-xs">IMAP host</Label>
              <Input
                value={creds.imap_host}
                onChange={(e) => patch({ imap_host: e.target.value })}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Port</Label>
              <Input
                type="number"
                value={creds.imap_port}
                onChange={(e) => patch({ imap_port: Number(e.target.value) || 993 })}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Folder</Label>
              <Input
                value={creds.folder}
                onChange={(e) => patch({ folder: e.target.value })}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Extract with tenant schema</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select tenant…" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Tenant default</SelectItem>
                  <SelectItem value="claude">Claude</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-3 pt-1">
            <Switch
              id="mark-read"
              checked={markAsRead}
              onCheckedChange={setMarkAsRead}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="mark-read" className="text-sm">
                Mark mail as read after storing it
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Only messages we successfully stored are flagged, so a failed fetch is retried on
                the next sync.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Switch
              id="skip-rel"
              checked={skipRelevance}
              onCheckedChange={setSkipRelevance}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor="skip-rel" className="text-sm">
                Skip the relevance check
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Leave off so non-document attachments (signatures, screenshots) are rejected before
                any tokens are spent.
              </p>
            </div>
          </div>

          {probe && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100 text-xs px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Login OK — <strong>{probe.unseen}</strong> unread of {probe.total} in {probe.folder}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={test} disabled={!canTest || testing}>
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Testing…
              </>
            ) : (
              "Test connection"
            )}
          </Button>
          <Button onClick={connect} disabled={!canConnect || connecting}>
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
        {!tenantId && canTest && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Pick the tenant whose saved schema should extract this mailbox.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
