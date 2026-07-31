/**
 * Theme plumbing: light / dark / follow-the-OS.
 *
 * The choice lives in localStorage and is applied by toggling `.dark` on <html>
 * (the variant styles.css is built around). Because the app is server-rendered,
 * the class has to be set before first paint — see THEME_INIT_SCRIPT, which runs
 * inline in <head> so a dark-mode user never sees a white flash.
 */
export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "des:theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Blocking snippet for <head>. Kept as a hand-minified string with no template
 * interpolation so it stays valid inside dangerouslySetInnerHTML, and silent on
 * failure (private mode can throw on localStorage access).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=t==="dark"||(t!=="light"&&window.matchMedia("${DARK_QUERY}").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

/** Turn a preference into the theme actually shown right now. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") return prefersDark() ? "dark" : "light";
  return theme;
}

export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* localStorage unavailable — fall back to following the OS. */
  }
  return "system";
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* noop — the choice just won't survive a reload. */
  }
}

/** Mirror the preference onto <html> (class + color-scheme for native controls). */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
  return resolved;
}
