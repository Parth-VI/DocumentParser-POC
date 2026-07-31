/**
 * Typed calls for the mail-extraction endpoints (/api/v1/mailbox/*).
 *
 * These live on a separate router from the extraction endpoints and write to a
 * separate database, but they're behind the same HMAC auth, so they reuse aiFetch.
 */
import { aiBlob, aiFetch } from "@/lib/ai-api";
import type { FieldLocation } from "@/lib/extraction-types";

/** Terminal state of one email's extraction. */
export type MailStatus = "Pending" | "Success" | "Failed" | "Skipped" | "NoDocuments";

export const MAIL_STATUSES: MailStatus[] = [
  "Success",
  "Failed",
  "Skipped",
  "NoDocuments",
  "Pending",
];

export type MailAccount = {
  id: number;
  email: string;
  imap_host: string;
  imap_port: number;
  use_ssl: boolean;
  folder: string;
  tenant_id: number;
  tenant_name: string | null;
  model: "claude" | "openai" | null;
  skip_relevance_check: boolean;
  mark_as_read: boolean;
  is_active: boolean;
  auto_sync_enabled: boolean;
  sync_interval_seconds: number;
  /** Non-null while a sync is in flight, in any process. */
  syncing_since: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};

export type AutoSyncStatus = {
  worker: {
    running: boolean;
    last_seen_at: string | null;
    seconds_ago?: number;
    pid?: number;
    hostname?: string;
    tick_seconds?: number;
    last_pass_synced?: number;
  };
  due_now: Array<{ id: number; email: string }>;
  auto_sync_accounts: number;
  command: string;
};

/** Interval choices offered in the UI, in seconds. */
export const SYNC_INTERVALS: Array<{ value: number; label: string }> = [
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every minute" },
  { value: 120, label: "Every 2 minutes" },
  { value: 300, label: "Every 5 minutes" },
  { value: 900, label: "Every 15 minutes" },
  { value: 3600, label: "Hourly" },
];

export type MailMessageListItem = {
  id: number;
  account_id: number;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  sent_at: string | null;
  received_at: string | null;
  status: MailStatus;
  attachment_count: number;
  /** Pages in the extracted document — set whether or not anything was merged. */
  merged_page_count: number | null;
  /** Pages the extraction actually read; the fallback for older rows. */
  page_count: number | null;
  merged_filename: string | null;
  model: string | null;
  cost: number | null;
  total_tokens: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  tenant_id: number | null;
  processed_at: string | null;
};

export type MailAttachmentMeta = {
  id: number;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  is_merged: boolean;
  order_index: number;
};

export type MailMessageDetail = MailMessageListItem & {
  account_email: string | null;
  message_id: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  body_text: string | null;
  body_html: string | null;
  merged_mime: string | null;
  merged_from: string[] | null;
  has_document: boolean;
  document_context: string | null;
  extracted_data: Record<string, unknown> | null;
  locations: FieldLocation[] | null;
  provider: string | null;
  ocr_engine: string | null;
  webhook_summary: WebhookSummary | null;
  attachments: MailAttachmentMeta[];
};

export type WebhookSummary = {
  event?: string;
  n_webhooks?: number;
  delivered?: number;
  failed?: number;
  deliveries?: Array<{
    webhook_id: number;
    url: string;
    ok: boolean;
    status_code: number | null;
    attempts: number;
    error: string | null;
  }>;
};

export type MailWebhook = {
  id: number;
  name: string;
  url: string;
  is_active: boolean;
  events: MailStatus[];
  include_document: boolean;
  last_status_code: number | null;
  last_delivered_at: string | null;
  last_error: string | null;
};

export type SyncSummary = {
  account_id: number;
  email: string;
  /** True when another process already held this mailbox's sync claim. */
  skipped_already_running?: boolean;
  fetched: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  no_documents: number;
  marked_read: number;
  message_ids: number[];
  errors: Array<{ uid: string | null; error: string }>;
};

export type MailboxConfig = {
  encryption_ready: boolean;
  statuses: string[];
  max_messages_per_sync: number;
  max_attachment_mb: number;
  max_merged_pages: number;
  max_context_chars: number;
};

export type ImapCredentials = {
  email: string;
  password: string;
  imap_host: string;
  imap_port: number;
  use_ssl: boolean;
  folder: string;
};

export type ProbeResult = {
  ok: boolean;
  folder: string;
  total: number;
  unseen: number;
  encryption_ready: boolean;
};

const BASE = "/api/v1/mailbox";

export function fetchMailboxConfig() {
  return aiFetch<MailboxConfig>({ path: `${BASE}/config` });
}

/** Whether the auto-sync worker is alive, and which mailboxes are due. */
export function fetchAutoSyncStatus() {
  return aiFetch<AutoSyncStatus>({ path: `${BASE}/auto-sync-status` });
}

/** Probe IMAP credentials without saving them. */
export function testMailboxConnection(creds: ImapCredentials) {
  return aiFetch<ProbeResult>({
    path: `${BASE}/test-connection`,
    method: "POST",
    body: { ...creds },
  });
}

export function connectMailbox(
  payload: ImapCredentials & {
    tenant_id: number;
    tenant_name?: string | null;
    model?: "claude" | "openai" | null;
    skip_relevance_check?: boolean;
    mark_as_read?: boolean;
  },
) {
  return aiFetch<MailAccount & { probe?: ProbeResult }>({
    path: `${BASE}/accounts`,
    method: "POST",
    body: { ...payload },
  });
}

export function fetchAccounts() {
  return aiFetch<MailAccount[]>({ path: `${BASE}/accounts` });
}

export function updateAccount(id: number, patch: Partial<MailAccount> & { password?: string }) {
  return aiFetch<MailAccount>({
    path: `${BASE}/accounts/${id}`,
    method: "PATCH",
    body: { ...patch },
  });
}

export function disconnectAccount(id: number) {
  return aiFetch<{ success: boolean }>({ path: `${BASE}/accounts/${id}`, method: "DELETE" });
}

/**
 * Sync a mailbox. `wait: true` blocks until every message is extracted and
 * returns the summary; otherwise the service answers 202 and works in the
 * background while the caller polls the message list.
 */
export function syncAccount(id: number, wait = true) {
  return aiFetch<SyncSummary | { success: boolean; message: string }>({
    path: `${BASE}/accounts/${id}/sync`,
    method: "POST",
    query: { wait },
  });
}

export function fetchMessages(params: {
  account_id?: number;
  status?: MailStatus;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return aiFetch<{ messages: MailMessageListItem[]; total: number }>({
    path: `${BASE}/messages`,
    query: { ...params },
  });
}

export function fetchMessage(id: number) {
  return aiFetch<MailMessageDetail>({ path: `${BASE}/messages/${id}` });
}

/** The merged PDF, as a File so the existing DocumentPreview can render it. */
export async function fetchMessageDocument(id: number): Promise<File> {
  const { blob, filename } = await aiBlob(`${BASE}/messages/${id}/document`);
  return new File([blob], filename, { type: blob.type || "application/pdf" });
}

function attachmentUrl(id: number) {
  return `${BASE}/attachments/${id}`;
}

export async function downloadAttachment(id: number, fallbackName = "attachment") {
  const { blob, filename } = await aiBlob(attachmentUrl(id));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function reprocessMessage(id: number) {
  return aiFetch<{ message_id: number; status: MailStatus }>({
    path: `${BASE}/messages/${id}/reprocess`,
    method: "POST",
  });
}

export function fetchWebhooks() {
  return aiFetch<MailWebhook[]>({ path: `${BASE}/webhooks` });
}

export function createWebhook(payload: {
  name: string;
  url: string;
  events: MailStatus[];
  is_active?: boolean;
  include_document?: boolean;
  secret?: string | null;
}) {
  return aiFetch<MailWebhook>({ path: `${BASE}/webhooks`, method: "POST", body: { ...payload } });
}

export function updateWebhook(
  id: number,
  patch: Partial<MailWebhook> & { secret?: string | null },
) {
  return aiFetch<MailWebhook>({
    path: `${BASE}/webhooks/${id}`,
    method: "PATCH",
    body: { ...patch },
  });
}

export function deleteWebhook(id: number) {
  return aiFetch<{ success: boolean }>({ path: `${BASE}/webhooks/${id}`, method: "DELETE" });
}

export function testWebhook(id: number, messageId?: number) {
  return aiFetch<{
    ok: boolean;
    status_code: number | null;
    attempts: number;
    error: string | null;
    payload_preview: Record<string, unknown>;
  }>({
    path: `${BASE}/webhooks/${id}/test`,
    method: "POST",
    query: { message_id: messageId },
  });
}

/** One delivery captured by the built-in test receiver. */
export type SinkEntry = {
  id: number;
  received_at: string | null;
  event: string | null;
  subject: string | null;
  mail_message_id: number | null;
  headers: Record<string, string> | null;
  body: Record<string, unknown> | null;
  body_bytes: number | null;
  /** Did X-Signature match a configured webhook secret? */
  signature_state: "valid" | "invalid" | "absent" | null;
  signed_by: string | null;
  source_ip: string | null;
  document_stripped: boolean;
};

export function fetchSinkEntries(limit = 25) {
  return aiFetch<{ url: string; entries: SinkEntry[] }>({
    path: `${BASE}/webhook-sink`,
    query: { limit },
  });
}

export function clearSinkEntries() {
  return aiFetch<{ success: boolean; removed: number }>({
    path: `${BASE}/webhook-sink`,
    method: "DELETE",
  });
}

/** Create (or re-enable) a webhook that delivers to the built-in receiver. */
export function registerSinkWebhook() {
  return aiFetch<MailWebhook>({ path: `${BASE}/webhook-sink/register`, method: "POST" });
}

/** One POST this service made to a destination, with the body it sent. */
export type WebhookDelivery = {
  id: number;
  webhook_id: number | null;
  /** Destination name/URL, so a combined list says where each row went. */
  webhook_name: string | null;
  webhook_url: string | null;
  message_id: number | null;
  event: string | null;
  subject: string | null;
  ok: boolean;
  status_code: number | null;
  attempts: number;
  error: string | null;
  response_snippet: string | null;
  payload: Record<string, unknown> | null;
  payload_bytes: number | null;
  document_stripped: boolean;
  created_at: string | null;
};

/** Deliveries across every destination, or one when `webhookId` is given. */
export function fetchDeliveries(webhookId?: number | null, limit = 25) {
  return aiFetch<{ deliveries: WebhookDelivery[] }>({
    path: `${BASE}/deliveries`,
    query: { webhook_id: webhookId ?? undefined, limit },
  });
}

/** Common IMAP hosts, so the connect form is one click for the usual providers. */
export const IMAP_PRESETS: Array<{ label: string; host: string; port: number; hint?: string }> = [
  {
    label: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    hint: "Requires a Google app password (2-Step Verification → App passwords).",
  },
  {
    label: "Outlook / Microsoft 365",
    host: "outlook.office365.com",
    port: 993,
    hint: "Use an app password if your tenant enforces modern auth.",
  },
  { label: "Yahoo", host: "imap.mail.yahoo.com", port: 993, hint: "Requires an app password." },
  { label: "Zoho", host: "imap.zoho.com", port: 993 },
];
