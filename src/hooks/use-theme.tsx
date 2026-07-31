import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  DARK_QUERY,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  /** What the user picked — may be "system". */
  theme: Theme;
  /** What's actually on screen, for components that need a concrete value. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server render and first client render must agree, so both start at the
  // default; the stored choice is adopted in the effect below. The inline head
  // script has already painted the right theme, so this is invisible.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = true;
    const stored = readStoredTheme();
    setThemeState(stored);
    setResolvedTheme(resolveTheme(stored));
  }, []);

  // Apply on every change — but never before the stored value is read, or we'd
  // stomp the head script's class with the default on mount.
  useEffect(() => {
    if (!hydrated.current) return;
    setResolvedTheme(applyTheme(theme));
  }, [theme]);

  // While on "system", track the OS flipping (e.g. macOS auto-switch at sunset).
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setResolvedTheme(applyTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next);
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
