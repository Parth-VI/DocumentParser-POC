import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  Pause,
  Play,
  Plug,
  Radio,
  RefreshCw,
  Search,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ConnectMailboxDialog } from "@/components/mail/ConnectMailboxDialog";
import { WebhookManager } from "@/components/mail/WebhookManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/ai-api";
import { formatDateTime, formatRelative, formatTime, secondsSince } from "@/lib/time";
import {
  disconnectAccount,
  fetchAccounts,
  fetchAutoSyncStatus,
  fetchMailboxConfig,
  fetchMessages,
  syncAccount,
  updateAccount,
  MAIL_STATUSES,
  SYNC_INTERVALS,
  type AutoSyncStatus,
  type MailAccount,
  type MailMessageListItem,
  type MailStatus,
  type SyncSummary,
} from "@/lib/mailbox-api";

export const Route = createFileRoute("/mail/")({ component: MailInbox });

const PAGE_SIZE = 25;
/** How often the inbox refreshes itself while auto-sync is actually watching. */
const POLL_INTERVAL_MS = 15000;

function MailInbox() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("all");
  const [messages, setMessages] = useState<MailMessageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<"all" | MailStatus>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [webhooksOpen, setWebhooksOpen] = useState(false);
  const [encryptionReady, setEncryptionReady] = useState(true);
  const [autoStatus, setAutoStatus] = useState<AutoSyncStatus | null>(null);
  // Operator override for the auto-refresh below.
  const [live, setLive] = useState(true);

  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === accountId) ?? null,
    [accounts, accountId],
  );

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await fetchAccounts());
    } catch (e) {
      toast.error(errorMessage(e, "Could not load mailboxes"));
    }
  }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMessages({
        account_id: accountId === "all" ? undefined : Number(accountId),
        status: status === "all" ? undefined : status,
        search: search.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setMessages(res.messages);
      setTotal(res.total);
    } catch (e) {
      toast.error(errorMessage(e, "Could not load messages"));
    } finally {
      setLoading(false);
    }
  }, [accountId, status, search, offset]);

  const loadAutoStatus = useCallback(async () => {
    try {
      setAutoStatus(await fetchAutoSyncStatus());
    } catch {
      // Non-critical: the banner just won't render.
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadAutoStatus();
    void fetchMailboxConfig()
      .then((c) => setEncryptionReady(c.encryption_ready))
      .catch(() => setEncryptionReady(true));
  }, [loadAccounts, loadAutoStatus]);

  /**
   * Auto-refresh so mail that arrives and gets extracted appears without a manual
   * reload — but only while something could actually change. Three conditions,
   * because polling a mailbox that can't receive anything is pure noise in the
   * service log:
   *
   *   1. the user hasn't switched Live off;
   *   2. at least one mailbox is active AND has auto-sync on — a paused mailbox
   *      can't produce new mail, so there is nothing to poll for.
   *
   * That second condition is read from the local account list, not from the
   * server's auto-sync snapshot: resuming a mailbox must start the refresh
   * immediately. Gating on the snapshot was self-locking, since the snapshot is
   * itself only refreshed by the poller — so once polling stopped, only a page
   * reload could restart it.
   *
   * The worker's heartbeat deliberately does NOT gate this. If a mailbox is
   * watching but the worker is down, polling is exactly what lets the page
   * notice the moment it comes back up; the banner says meanwhile that it needs
   * starting.
   */
  const watching = useMemo(
    () => accounts.some((a) => a.is_active && a.auto_sync_enabled),
    [accounts],
  );
  const shouldPoll = live && watching;

  useEffect(() => {
    if (!shouldPoll) return;
    const tick = () => {
      // A backgrounded tab has nobody looking at it; skip the round trip.
      if (document.hidden) return;
      void loadMessages();
      void loadAccounts();
      void loadAutoStatus();
    };
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    // Coming back to the tab should show current data immediately, not after a
    // full interval.
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shouldPoll, loadMessages, loadAccounts, loadAutoStatus]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Filter changes restart pagination; otherwise page 3 of a narrower result set
  // would come back empty.
  useEffect(() => {
    setOffset(0);
  }, [accountId, status, search]);

  const sync = async (account: MailAccount) => {
    setSyncing(true);
    setLastSync(null);
    const toastId = toast.loading(`Fetching unread mail for ${account.email}…`);
    try {
      // wait=true: extraction is the point, so block for the real summary rather
      // than reporting "started" and leaving the operator guessing.
      const result = await syncAccount(account.id, true);
      if ("skipped_already_running" in result && result.skipped_already_running) {
        // The worker claimed this mailbox first; its results land via the refresh.
        toast.info("A sync is already running for this mailbox — showing its results shortly.", {
          id: toastId,
        });
      } else if ("fetched" in result) {
        setLastSync(result);
        toast.success(
          result.fetched === 0
            ? "No unread mail to fetch"
            : `${result.processed} message(s): ${result.succeeded} extracted, ` +
                `${result.failed} failed, ${result.skipped} skipped, ` +
                `${result.no_documents} without documents`,
          { id: toastId, duration: 6000 },
        );
      } else {
        toast.success(result.message, { id: toastId });
      }
      await Promise.all([loadAccounts(), loadMessages(), loadAutoStatus()]);
    } catch (e) {
      toast.error(errorMessage(e, "Sync failed"), { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Single path for every account edit, so the local copy and the auto-sync
   * banner are always both refreshed. Pause/resume used to skip the banner
   * refresh, which left the poll gate reading a stale "nothing is watching".
   */
  const patchAccount = async (account: MailAccount, patch: Partial<MailAccount>) => {
    try {
      const updated = await updateAccount(account.id, patch);
      setAccounts((curr) => curr.map((a) => (a.id === account.id ? updated : a)));
      void loadAutoStatus();
    } catch (e) {
      toast.error(errorMessage(e, "Could not update the mailbox"));
    }
  };

  const togglePaused = (account: MailAccount) =>
    patchAccount(account, { is_active: !account.is_active });

  const disconnect = async (account: MailAccount) => {
    if (
      !confirm(
        `Disconnect ${account.email}? Its stored messages, documents and extractions are deleted too.`,
      )
    )
      return;
    try {
      await disconnectAccount(account.id);
      setAccountId("all");
      await Promise.all([loadAccounts(), loadMessages()]);
      toast.success("Mailbox disconnected");
    } catch (e) {
      toast.error(errorMessage(e, "Could not disconnect the mailbox"));
    }
  };

  const syncTarget = selectedAccount ?? (accounts.length === 1 ? accounts[0] : null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <AppHeader
        subtitle="Fetch unread mail → merge attachments → extract with the tenant schema"
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWebhooksOpen(true)}>
              <WebhookIcon className="h-4 w-4" /> Webhooks
            </Button>
            <Button size="sm" onClick={() => setConnectOpen(true)}>
              <Plug className="h-4 w-4" /> Connect mailbox
            </Button>
          </div>
        }
      />

      <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
        {accounts.length === 0 ? (
          <EmptyMailboxes onConnect={() => setConnectOpen(true)} />
        ) : (
          <>
            {/* Is automatic syncing actually happening? Says which, rather than
                leaving "auto-sync on but nothing arrives" ambiguous. */}
            {autoStatus && autoStatus.auto_sync_accounts > 0 && (
              <div
                className={`rounded-md border text-xs px-3 py-2 flex items-start gap-2 ${
                  autoStatus.worker.running
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                }`}
              >
                {autoStatus.worker.running ? (
                  <>
                    <Radio className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Auto-sync is live — the worker checked in {autoStatus.worker.seconds_ago ?? 0}
                      s ago (pid {autoStatus.worker.pid}), polling every{" "}
                      {autoStatus.worker.tick_seconds}s.
                      {autoStatus.due_now.length > 0 &&
                        ` ${autoStatus.due_now.length} mailbox(es) due on the next pass.`}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong>
                        {autoStatus.auto_sync_accounts} mailbox(es) have auto-sync on, but the
                        worker isn't running
                      </strong>{" "}
                      — nothing will be fetched until you start it:
                      <code className="ml-1 font-mono bg-black/10 dark:bg-white/10 px-1 rounded">
                        {autoStatus.command}
                      </code>
                      {autoStatus.worker.last_seen_at && (
                        <> Last seen {formatDateTime(autoStatus.worker.last_seen_at)}.</>
                      )}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Connected mailboxes */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`rounded-xl border bg-card p-3 space-y-2 ${
                    String(account.id) === accountId ? "ring-1 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setAccountId(String(account.id))}
                      title="Filter the list to this mailbox"
                    >
                      <div className="text-sm font-medium truncate">{account.email}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {account.tenant_name ?? `tenant ${account.tenant_id}`} · {account.folder}
                        {account.model ? ` · ${account.model}` : ""}
                      </div>
                    </button>
                    {account.auto_sync_enabled && !account.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        Paused
                      </Badge>
                    )}
                  </div>

                  {account.last_error && (
                    <div className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{account.last_error}</span>
                    </div>
                  )}

                  {/* Auto-sync is the primary switch: off means manual-only, and
                      pause/resume has nothing to act on. Turning it back on also
                      clears a leftover pause, so "on" always means running. */}
                  <div className="rounded-lg border bg-background/60 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`auto-${account.id}`}
                        checked={account.auto_sync_enabled}
                        onCheckedChange={(v) =>
                          patchAccount(
                            account,
                            v
                              ? { auto_sync_enabled: true, is_active: true }
                              : { auto_sync_enabled: false },
                          )
                        }
                      />
                      <label
                        htmlFor={`auto-${account.id}`}
                        className="text-xs font-medium cursor-pointer"
                      >
                        Auto-sync
                      </label>
                      {account.syncing_since && (
                        <span className="ml-auto text-[10px] text-muted-foreground inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> syncing
                        </span>
                      )}
                    </div>
                    {account.auto_sync_enabled && (
                      <>
                        <Select
                          value={String(account.sync_interval_seconds)}
                          onValueChange={(v) =>
                            patchAccount(account, { sync_interval_seconds: Number(v) })
                          }
                          disabled={!account.is_active}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SYNC_INTERVALS.map((i) => (
                              <SelectItem key={i.value} value={String(i.value)}>
                                {i.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          {account.is_active
                            ? nextRunLabel(account)
                            : "Paused — press ▶ to resume. Sync now still works."}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => sync(account)}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Sync now
                    </Button>
                    {/* Only meaningful while auto-sync is on: there are no
                        automatic runs to pause otherwise. */}
                    {account.auto_sync_enabled && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title={
                          account.is_active ? "Pause automatic syncing" : "Resume automatic syncing"
                        }
                        onClick={() => togglePaused(account)}
                      >
                        {account.is_active ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                      title="Disconnect"
                      onClick={() => disconnect(account)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {account.last_synced_at
                        ? `synced ${formatTime(account.last_synced_at, true)}`
                        : "never synced"}
                    </span>
                  </div>
                </div>
              ))}
            </section>

            {lastSync && lastSync.errors.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 text-xs px-3 py-2">
                <strong>Last sync reported {lastSync.errors.length} problem(s):</strong>
                <ul className="mt-1 space-y-0.5">
                  {lastSync.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="font-mono text-[11px]">
                      {e.uid ? `UID ${e.uid}: ` : ""}
                      {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Filters */}
            <section className="flex flex-wrap items-end gap-2">
              <div className="w-full sm:w-64">
                <label className="text-xs text-muted-foreground">Mailbox</label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All mailboxes</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-44">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any status</SelectItem>
                    {MAIL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-muted-foreground">Search</label>
                <div className="relative mt-1">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Subject or sender…"
                    className="pl-8"
                  />
                </div>
              </div>
              {/* Says plainly whether the page is polling, and lets it be stopped —
                  a silent background refresh is confusing when you see it in the
                  service log. */}
              <div
                className="flex items-center gap-2"
                title={
                  "Re-queries this list so new extractions appear without reloading. " +
                  "It only affects this browser tab — it does not fetch mail."
                }
              >
                <Switch id="inbox-live" checked={live} onCheckedChange={setLive} />
                <label htmlFor="inbox-live" className="text-xs cursor-pointer">
                  <span className="font-medium">Auto-refresh</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {!live
                      ? "off"
                      : !watching
                        ? "idle, nothing is auto-syncing"
                        : `every ${POLL_INTERVAL_MS / 1000}s`}
                  </span>
                </label>
              </div>
              <Button variant="outline" size="sm" onClick={() => loadMessages()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              {syncTarget && (
                <Button size="sm" onClick={() => sync(syncTarget)} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Inbox className="h-4 w-4" />
                  )}
                  Fetch unread
                </Button>
              )}
            </section>

            {/* Message list */}
            <section className="rounded-xl border bg-card overflow-hidden">
              <div className="hidden md:grid grid-cols-[1fr_200px_110px_130px_90px] gap-3 px-4 py-2 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                <div>Subject</div>
                <div>From</div>
                <div>Received</div>
                <div>Status</div>
                <div className="text-right">Fields</div>
              </div>

              {loading && messages.length === 0 ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="p-10 text-center">
                  <Inbox className="h-10 w-10 text-muted-foreground/50 mx-auto" />
                  <p className="text-sm text-muted-foreground mt-3">
                    Nothing here yet. Hit <strong>Fetch unread</strong> to pull mail from the
                    connected mailbox.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {messages.map((message) => (
                    <li key={message.id}>
                      <Link
                        to="/mail/$messageId"
                        params={{ messageId: String(message.id) }}
                        className="grid md:grid-cols-[1fr_200px_110px_130px_90px] gap-1 md:gap-3 px-4 py-3 hover:bg-accent/40 transition-colors items-center"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {message.subject || (
                              <span className="text-muted-foreground">(no subject)</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                            {message.attachment_count > 0 && (
                              <span
                                className="inline-flex items-center gap-1"
                                title={`${message.attachment_count} attachment(s)`}
                              >
                                <Paperclip className="h-3 w-3" />
                                {message.attachment_count}
                              </span>
                            )}
                            {pageCountOf(message) != null && (
                              <span title="Pages in the extracted document">
                                {pageCountOf(message)}p
                              </span>
                            )}
                            {message.error_message && (
                              <span className="text-rose-600 dark:text-rose-400 truncate">
                                {message.error_message}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="min-w-0 text-xs">
                          <div className="truncate">
                            {message.from_name || message.from_address}
                          </div>
                          {message.from_name && (
                            <div className="text-muted-foreground truncate">
                              {message.from_address}
                            </div>
                          )}
                        </div>
                        <div
                          className="text-xs text-muted-foreground"
                          title={formatDateTime(message.received_at ?? message.sent_at)}
                        >
                          {formatRelative(message.received_at ?? message.sent_at)}
                        </div>
                        <div>
                          <StatusBadge status={message.status} />
                        </div>
                        <div className="text-xs text-muted-foreground md:text-right">
                          {message.status === "Success" ? "view →" : ""}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-2 border-t text-xs">
                  <span className="text-muted-foreground">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={offset + PAGE_SIZE >= total}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <ConnectMailboxDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        encryptionReady={encryptionReady}
        onConnected={(account) => {
          setAccounts((curr) => [account, ...curr]);
          setAccountId(String(account.id));
          // A fresh mailbox is empty until synced; offer that as the next step.
          toast.info("Mailbox connected — hit Sync now to fetch its unread mail.");
          void navigate({ to: "/mail" });
        }}
      />
      <WebhookManager open={webhooksOpen} onOpenChange={setWebhooksOpen} />
    </div>
  );
}

export function StatusBadge({ status }: { status: MailStatus }) {
  const styles: Record<MailStatus, string> = {
    Success:
      "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
    Failed:
      "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30",
    Skipped:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
    NoDocuments: "bg-muted text-muted-foreground border-border",
    Pending:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/30",
  };
  const label = status === "NoDocuments" ? "No documents" : status;
  return (
    <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {label}
    </span>
  );
}

/**
 * Pages in the extracted document, however it was assembled.
 *
 * `merged_page_count` is written for merged and single-document mail alike;
 * `page_count` (what the extraction read) covers rows stored before that was
 * true, so a one-PDF email shows its page count instead of nothing.
 */
function pageCountOf(message: MailMessageListItem): number | null {
  return message.merged_page_count ?? message.page_count ?? null;
}

/** "next check in ~40s" — derived from the interval and the last sync time. */
function nextRunLabel(account: MailAccount): string {
  const elapsed = secondsSince(account.last_synced_at);
  if (elapsed === null) return "due on the next worker pass";
  const remaining = Math.round(account.sync_interval_seconds - elapsed);
  if (remaining <= 0) return "due on the next worker pass";
  if (remaining < 60) return `next check in ~${remaining}s`;
  return `next check in ~${Math.round(remaining / 60)}m`;
}

function EmptyMailboxes({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed p-12 text-center">
      <Mail className="h-12 w-12 text-muted-foreground/40 mx-auto" />
      <h2 className="text-lg font-semibold mt-4">Connect a mailbox</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
        Unread mail is fetched over IMAP and marked read once stored. Every document attachment on a
        message is merged into a single PDF, and the subject, sender and body are passed to the
        model as the document context.
      </p>
      <Button className="mt-5" onClick={onConnect}>
        <Plug className="h-4 w-4" /> Connect mailbox
      </Button>
    </div>
  );
}
