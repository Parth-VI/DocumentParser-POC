import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, ChevronRight, KeyRound, Loader2, Plug } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
  const [advOpen, setAdvOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProbe(null);
    void fetchTenants()
      .then(setTenants)
      .catch((e) => toast.error(errorMessage(e, "Could not load clients")));
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
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-[20px] font-normal">
            <Plug className="h-4 w-4" /> Connect a mailbox
          </DialogTitle>
          <DialogDescription>
            We'll read each document as it arrives and pull the details you asked for. The email's
            subject and body help the reader understand it.
          </DialogDescription>
        </DialogHeader>

        {!encryptionReady && (
          <div className="flex items-start gap-2 rounded-md border border-flag/40 bg-flag-tint px-3 py-2 text-[12px] text-flag">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Password storage isn't set up on the server yet</strong>, so the mailbox
              password can't be saved securely. You can test the connection now; connecting is
              blocked until it's configured.
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
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors",
                  creds.imap_host === p.host
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-paper text-muted-foreground hover:border-ink hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <p className="mt-1 text-xs text-muted-foreground">
                {preset?.hint ?? "Use a provider app password, not your login password."}
              </p>
            </div>
            <div>
              <Label className="text-xs">Read for client</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a client…" />
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
              <Label className="text-xs">Reader</Label>
              <Select value={model} onValueChange={(v) => setModel(v as typeof model)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Client default</SelectItem>
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
                Mark mail as read once stored
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Only mail we successfully stored is marked, so a failed fetch is retried next time.
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
                Skip the double-check
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Leave off so non-documents (signatures, screenshots) are set aside before anything
                is read.
              </p>
            </div>
          </div>

          {/* Server connection detail — rarely touched once a preset is picked. */}
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
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-faint">Mail server (IMAP host)</Label>
                  <Input
                    value={creds.imap_host}
                    onChange={(e) => patch({ imap_host: e.target.value })}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-faint">Port</Label>
                  <Input
                    type="number"
                    value={creds.imap_port}
                    onChange={(e) => patch({ imap_port: Number(e.target.value) || 993 })}
                    className="mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-faint">Folder</Label>
                  <Input
                    value={creds.folder}
                    onChange={(e) => patch({ folder: e.target.value })}
                    className="mt-1 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {probe && (
            <div className="flex items-center gap-2 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-[12px] text-ok">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Connected — <strong>{probe.unseen}</strong> unread of {probe.total} in {probe.folder}
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
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            Pick the client whose saved details should read this mailbox.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
