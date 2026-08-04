import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  Link2,
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
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { ConnectMailboxDialog } from "@/components/mail/ConnectMailboxDialog";
import { WebhookManager } from "@/components/mail/WebhookManager";
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
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/ai-api";
import { formatDateTime, formatTime, secondsSince } from "@/lib/time";
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
    const toastId = toast.loading(`Checking ${account.email} for new mail…`);
    try {
      // wait=true: extraction is the point, so block for the real summary rather
      // than reporting "started" and leaving the operator guessing.
      const result = await syncAccount(account.id, true);
      if ("skipped_already_running" in result && result.skipped_already_running) {
        // The worker claimed this mailbox first; its results land via the refresh.
        toast.info(
          "A check is already running for this mailbox — its results will appear shortly.",
          {
            id: toastId,
          },
        );
      } else if ("fetched" in result) {
        setLastSync(result);
        toast.success(
          result.fetched === 0
            ? "No new mail waiting"
            : `${result.processed} message(s): ${result.succeeded} read, ` +
                `${result.failed} need attention, ${result.skipped} skipped, ` +
                `${result.no_documents} without documents`,
          { id: toastId, duration: 6000 },
        );
      } else {
        toast.success(result.message, { id: toastId });
      }
      await Promise.all([loadAccounts(), loadMessages(), loadAutoStatus()]);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't check for mail"), { id: toastId });
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
        `Disconnect ${account.email}? Its stored messages, documents and results are deleted too.`,
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

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-foreground">
      <AppHeader
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWebhooksOpen(true)}>
              <Link2 className="h-4 w-4" /> Connections
            </Button>
            <Button size="sm" onClick={() => setConnectOpen(true)}>
              <Plug className="h-4 w-4" /> Connect a mailbox
            </Button>
          </div>
        }
      />

      {accounts.length === 0 ? (
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-10">
          <EmptyMailboxes onConnect={() => setConnectOpen(true)} />
        </main>
      ) : (
        <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── LEFT · the inbox ─────────────────────────────── */}
          <section className="flex min-w-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
            <div className="px-7 pb-5 pt-8">
              <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.01em]">
                Inbox
              </h1>
              <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
                Documents emailed to this workspace are read as they arrive. Open one to see what we
                found.
              </p>
            </div>

            {/* filter / action toolbar */}
            <div className="flex flex-wrap items-center gap-2 border-y border-line-soft bg-wash/60 px-7 py-2.5">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sender or subject…"
                  className="h-8 pl-8 text-[13px]"
                />
              </div>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-8 w-auto min-w-[140px] text-[13px]">
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
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger className="h-8 w-auto min-w-[130px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  {MAIL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label
                htmlFor="inbox-live"
                className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground"
                title={
                  "Re-checks this list so newly read mail appears without reloading. " +
                  "It only affects this browser tab — it does not fetch mail."
                }
              >
                <Switch id="inbox-live" checked={live} onCheckedChange={setLive} />
                <span>
                  Auto-refresh
                  <span className="text-faint">
                    {" · "}
                    {!live ? "off" : !watching ? "idle" : `every ${POLL_INTERVAL_MS / 1000}s`}
                  </span>
                </span>
              </label>
              <button
                onClick={() => loadMessages()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-[12px] text-faint transition-colors hover:text-ink disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
              </button>
              {syncTarget && (
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => sync(syncTarget)}
                  disabled={syncing}
                >
                  {syncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Fetch new mail
                </Button>
              )}
            </div>

            {/* message list */}
            <div className="flex-1">
              {loading && messages.length === 0 ? (
                <div className="space-y-2 p-7">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="px-7 py-16 text-center">
                  <p className="text-[13.5px] text-muted-foreground">
                    Nothing here yet. Press <span className="text-ink">Fetch new mail</span> to pull
                    from a connected mailbox — new documents also appear on their own.
                  </p>
                </div>
              ) : (
                <MessageGroups messages={messages} />
              )}

              {messages.length > 0 && (
                <div className="px-7 py-6 text-[12.5px] text-faint">
                  Nothing else on this page. New documents appear here on their own.
                </div>
              )}
            </div>

            {/* pagination footer */}
            {total > PAGE_SIZE && (
              <div className="sticky bottom-0 flex items-center justify-between border-t border-line bg-paper/95 px-7 py-3 backdrop-blur-sm">
                <span className="font-mono text-[11px] text-faint">
                  {from}–{to} of {total}
                </span>
                <div className="flex gap-2">
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

          {/* ── RIGHT · setup ─────────────────────────────── */}
          <aside className="flex flex-col bg-surface px-6 py-8">
            <span className="mb-4 text-[11px] uppercase tracking-[0.09em] text-faint">Setup</span>

            {/* Is automatic checking actually happening? */}
            {autoStatus && autoStatus.auto_sync_accounts > 0 && (
              <div
                className={cn(
                  "mb-5 flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]",
                  autoStatus.worker.running
                    ? "border-ok/30 bg-ok/10 text-ok"
                    : "border-flag/40 bg-flag-tint text-flag",
                )}
              >
                {autoStatus.worker.running ? (
                  <>
                    <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Watching for new mail — last checked {autoStatus.worker.seconds_ago ?? 0}s
                      ago.
                      {autoStatus.due_now.length > 0 &&
                        ` ${autoStatus.due_now.length} mailbox(es) due next pass.`}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>
                        {autoStatus.auto_sync_accounts} mailbox(es) are set to auto-check, but the
                        watcher isn't running.
                      </strong>{" "}
                      Nothing new will arrive until it's started:
                      <code className="ml-1 rounded bg-ink/10 px-1 font-mono">
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

            {/* Where documents arrive */}
            <div className="border-b border-line-soft pb-6">
              <div className="text-[14px] font-medium">Where documents arrive</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Connect a mailbox and we'll read each document as it lands.
              </p>

              <div className="mt-4 space-y-2.5">
                {accounts.map((account) => (
                  <MailboxCard
                    key={account.id}
                    account={account}
                    selected={String(account.id) === accountId}
                    syncing={syncing}
                    onSelect={() => setAccountId(String(account.id))}
                    onSync={() => sync(account)}
                    onTogglePaused={() => togglePaused(account)}
                    onPatch={(patch) => patchAccount(account, patch)}
                    onDisconnect={() => disconnect(account)}
                  />
                ))}
              </div>

              <Button className="mt-4 w-full" onClick={() => setConnectOpen(true)}>
                <Plug className="h-4 w-4" /> Connect a mailbox
              </Button>

              {lastSync && lastSync.errors.length > 0 && (
                <div className="mt-4 rounded-md border border-flag/40 bg-flag-tint px-3 py-2 text-[12px] text-flag">
                  <strong>The last check reported {lastSync.errors.length} problem(s):</strong>
                  <ul className="mt-1 space-y-0.5">
                    {lastSync.errors.slice(0, 5).map((e, i) => (
                      <li key={i} className="font-mono text-[11px]">
                        {e.uid ? `#${e.uid}: ` : ""}
                        {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Where results go */}
            <div className="pt-6">
              <div className="text-[14px] font-medium">Where results go</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                Once a document is read, the details can pass straight to another system.
              </p>
              <button
                onClick={() => setWebhooksOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-highlight underline decoration-highlight-line underline-offset-2 transition-colors hover:text-ink"
              >
                <Link2 className="h-3.5 w-3.5" /> Set up where results go
              </button>
            </div>
          </aside>
        </main>
      )}

      <ConnectMailboxDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        encryptionReady={encryptionReady}
        onConnected={(account) => {
          setAccounts((curr) => [account, ...curr]);
          setAccountId(String(account.id));
          // A fresh mailbox is empty until checked; offer that as the next step.
          toast.info("Mailbox connected — press Fetch new mail to pull its unread mail.");
          void navigate({ to: "/mail" });
        }}
      />
      <WebhookManager open={webhooksOpen} onOpenChange={setWebhooksOpen} />
    </div>
  );
}

/* ────────────────────────── message list ────────────────────────── */

/** Group the current page of messages under Today / Yesterday / older headings. */
function MessageGroups({ messages }: { messages: MailMessageListItem[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, MailMessageListItem[]>();
    for (const m of messages) {
      const key = dayBucketLabel(m.received_at ?? m.sent_at);
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [messages]);

  return (
    <div>
      {groups.map(([label, items]) => (
        <div key={label}>
          <div className="flex items-center gap-3 px-7 pb-2 pt-5">
            <span className="text-[11px] uppercase tracking-[0.09em] text-faint">{label}</span>
            <span className="h-px flex-1 bg-line-soft" />
          </div>
          {items.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MessageRow({ message }: { message: MailMessageListItem }) {
  const meta = statusMeta(message.status);
  const sender = message.from_name || message.from_address || "Unknown sender";
  const pages = pageCountOf(message);
  return (
    <Link
      to="/mail/$messageId"
      params={{ messageId: String(message.id) }}
      className="group flex items-center gap-4 px-7 py-3 transition-colors hover:bg-wash"
    >
      <span className={cn("h-[6px] w-[6px] shrink-0 rounded-full", meta.dot)} />

      <span className="w-[150px] shrink-0 truncate text-[13.5px] font-medium" title={sender}>
        {sender}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-muted-foreground">
          {message.subject || <span className="text-faint">(no subject)</span>}
        </span>
        {(message.attachment_count > 0 || pages != null || message.error_message) && (
          <span className="mt-0.5 flex items-center gap-2.5 truncate text-[11.5px] text-faint">
            {message.attachment_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {message.attachment_count}
              </span>
            )}
            {pages != null && <span>{pages} pages</span>}
            {message.error_message && (
              <span className="truncate text-flag">{message.error_message}</span>
            )}
          </span>
        )}
      </span>

      <span className={cn("hidden w-[120px] shrink-0 text-[12px] sm:block", meta.text)}>
        {meta.label}
      </span>

      <span className="hidden w-[52px] shrink-0 text-right font-mono text-[11px] text-faint md:block">
        {formatTime(message.received_at ?? message.sent_at)}
      </span>
    </Link>
  );
}

/* ────────────────────────── mailbox card ────────────────────────── */

function MailboxCard({
  account,
  selected,
  syncing,
  onSelect,
  onSync,
  onTogglePaused,
  onPatch,
  onDisconnect,
}: {
  account: MailAccount;
  selected: boolean;
  syncing: boolean;
  onSelect: () => void;
  onSync: () => void;
  onTogglePaused: () => void;
  onPatch: (patch: Partial<MailAccount>) => void;
  onDisconnect: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-wash px-3.5 py-3",
        selected ? "border-highlight-line" : "border-line-soft",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
          title="Show only this mailbox"
        >
          <div className="truncate text-[13px] font-medium">{account.email}</div>
          <div className="truncate text-[11.5px] text-faint">
            {account.tenant_name ?? `client ${account.tenant_id}`} · {account.folder}
          </div>
        </button>
        {account.auto_sync_enabled && !account.is_active && (
          <span className="shrink-0 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] text-muted-foreground">
            Paused
          </span>
        )}
      </div>

      {account.last_error && (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-flag">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2">{account.last_error}</span>
        </div>
      )}

      {/* Auto-check is the primary switch: off means manual-only, and
          pause/resume has nothing to act on. Turning it back on also clears a
          leftover pause, so "on" always means running. */}
      <div className="mt-2.5 rounded-md border border-line-soft bg-surface p-2.5">
        <div className="flex items-center gap-2">
          <Switch
            id={`auto-${account.id}`}
            checked={account.auto_sync_enabled}
            onCheckedChange={(v) =>
              onPatch(
                v ? { auto_sync_enabled: true, is_active: true } : { auto_sync_enabled: false },
              )
            }
          />
          <label htmlFor={`auto-${account.id}`} className="cursor-pointer text-[12px] font-medium">
            Check automatically
          </label>
          {account.syncing_since && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-faint">
              <Loader2 className="h-3 w-3 animate-spin" /> checking
            </span>
          )}
        </div>
        {account.auto_sync_enabled && (
          <>
            <Select
              value={String(account.sync_interval_seconds)}
              onValueChange={(v) => onPatch({ sync_interval_seconds: Number(v) })}
              disabled={!account.is_active}
            >
              <SelectTrigger className="mt-2 h-7 text-[12px]">
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
            <p className="mt-1.5 text-[10.5px] text-faint">
              {account.is_active
                ? nextRunLabel(account)
                : "Paused — press play to resume. Fetch new mail still works."}
            </p>
          </>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[12px]"
          onClick={onSync}
          disabled={syncing}
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Fetch new mail
        </Button>
        {account.auto_sync_enabled && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title={account.is_active ? "Pause automatic checking" : "Resume automatic checking"}
            onClick={onTogglePaused}
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
          className="h-7 w-7 text-destructive hover:text-destructive"
          title="Disconnect"
          onClick={onDisconnect}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <span className="ml-auto text-[10.5px] text-faint">
          {account.last_synced_at
            ? `checked ${formatTime(account.last_synced_at, true)}`
            : "never checked"}
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────── status helpers ────────────────────────── */

type StatusMeta = { dot: string; text: string; label: string };

/** Dot colour, label colour, and plain label for a message status. */
function statusMeta(status: MailStatus): StatusMeta {
  switch (status) {
    case "Success":
      return { dot: "bg-ok", text: "text-faint", label: "Read" };
    case "Pending":
      return { dot: "bg-highlight", text: "text-highlight", label: "Reading…" };
    case "Failed":
      return { dot: "bg-flag", text: "text-flag", label: "Needs attention" };
    case "Skipped":
      return { dot: "bg-faint", text: "text-faint", label: "Skipped" };
    case "NoDocuments":
      return { dot: "bg-faint", text: "text-faint", label: "No document" };
  }
}

/** Plain-language label for a status, used in the filter and the badge. */
export function statusLabel(status: MailStatus): string {
  return statusMeta(status).label;
}

/** Editorial status pill — shared with the message detail screen. */
export function StatusBadge({ status }: { status: MailStatus }) {
  const styles: Record<MailStatus, string> = {
    Success: "border-ok/30 bg-ok/10 text-ok",
    Pending: "border-highlight-line bg-highlight-tint text-highlight",
    Failed: "border-flag/40 bg-flag-tint text-flag",
    Skipped: "border-line bg-wash text-muted-foreground",
    NoDocuments: "border-line bg-wash text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px]",
        styles[status],
      )}
    >
      {statusLabel(status)}
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

/** "Today" / "Yesterday" / "12 Mar" for the group headings. */
function dayBucketLabel(iso: string | null): string {
  if (!iso) return "Undated";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Undated";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  const diff = Math.round((startOf(new Date()) - startOf(parsed)) / dayMs);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "next check in ~40s" — derived from the interval and the last sync time. */
function nextRunLabel(account: MailAccount): string {
  const elapsed = secondsSince(account.last_synced_at);
  if (elapsed === null) return "due on the next pass";
  const remaining = Math.round(account.sync_interval_seconds - elapsed);
  if (remaining <= 0) return "due on the next pass";
  if (remaining < 60) return `next check in ~${remaining}s`;
  return `next check in ~${Math.round(remaining / 60)}m`;
}

function EmptyMailboxes({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface px-8 py-12 text-center shadow-card">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-md bg-wash text-muted-foreground">
        <Mail className="h-5 w-5" />
      </span>
      <h1 className="mt-5 font-serif text-[24px] leading-tight">Connect a mailbox</h1>
      <p className="mx-auto mt-2.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
        Forward paperwork to a connected mailbox and we'll read each document as it arrives —
        pulling the details you asked for and passing them wherever you need.
      </p>
      <Button className="mt-6" onClick={onConnect}>
        <Plug className="h-4 w-4" /> Connect a mailbox
      </Button>
    </div>
  );
}
