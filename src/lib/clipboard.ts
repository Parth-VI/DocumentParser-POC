/**
 * Copy-to-clipboard that also works outside a secure context.
 *
 * `navigator.clipboard` has the same secure-context restriction as WebCrypto, so
 * every Copy button silently failed when the studio was opened on a LAN address
 * over plain http. The `execCommand("copy")` path is deprecated but still
 * implemented everywhere and has no such restriction, which makes it the right
 * fallback rather than telling a LAN user copying isn't available.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context — try the legacy path below.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Off-screen but still focusable: execCommand ignores hidden elements.
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
