"use client";

import { createContext, useContext, useEffect, useCallback, useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

type ThemeContext = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** The resolved theme (always "light" or "dark") */
  resolved: "light" | "dark";
};

const ThemeCtx = createContext<ThemeContext>({
  theme: "system",
  setTheme: () => {},
  resolved: "dark",
});

export function useTheme() {
  return useContext(ThemeCtx);
}

const STORAGE_KEY = "theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

/**
 * Inline script to inject into <head> to prevent flash of wrong theme.
 * Reads localStorage and sets the class on <html> before paint.
 */
export const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('${STORAGE_KEY}');
    if (t !== 'light' && t !== 'dark') t = 'system';
    var resolved = t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  } catch(e) {}
})();
`;

// --- External store for localStorage theme ---
// We use a module-level variable + listeners so useSyncExternalStore can
// subscribe to changes made by setTheme() and re-read the value.

let storedThemeListeners: Array<() => void> = [];

function subscribeToStoredTheme(callback: () => void) {
  storedThemeListeners.push(callback);
  return () => {
    storedThemeListeners = storedThemeListeners.filter((l) => l !== callback);
  };
}

function notifyStoredThemeListeners() {
  for (const l of storedThemeListeners) l();
}

// --- External store for system theme (matchMedia) ---

function subscribeToSystemTheme(callback: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read stored theme from localStorage, reactive via useSyncExternalStore
  const theme = useSyncExternalStore(
    subscribeToStoredTheme,
    readStoredTheme,
    () => "system" as Theme, // SSR fallback
  );

  // Track system theme reactively
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    () => "dark" as const, // SSR fallback
  );

  const resolved: "light" | "dark" = theme === "system" ? systemTheme : theme;

  // Apply class to <html> whenever resolved theme changes
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  // Sync Sentry Feedback widget theme with the app.
  // The widget lives in a Shadow DOM with colorScheme:"system", so it follows
  // the OS preference by default. Setting CSS custom properties on the host
  // element from outside overrides the :host rules inside the shadow, binding
  // the widget to the app's toggle instead.
  useEffect(() => {
    const el = document.getElementById("sentry-feedback");
    if (!el) return;

    const vars =
      resolved === "dark"
        ? {
            "--foreground": "#ebe6ef",
            "--background": "#12121a",
            "--accent-foreground": "white",
            "--accent-background": "#7c5fcf",
            "--success-color": "#2da98c",
            "--error-color": "#f55459",
            "--border": "1.5px solid rgba(235, 230, 239, 0.15)",
            "--box-shadow": "0px 4px 24px 0px rgba(43, 34, 51, 0.12)",
            "--interactive-filter": "brightness(150%)",
          }
        : {
            "--foreground": "#2b2233",
            "--background": "#ffffff",
            "--accent-foreground": "white",
            "--accent-background": "#6d28d9",
            "--success-color": "#268d75",
            "--error-color": "#df3338",
            "--border": "1.5px solid rgba(41, 35, 47, 0.13)",
            "--box-shadow": "0px 4px 24px 0px rgba(43, 34, 51, 0.12)",
            "--interactive-filter": "brightness(95%)",
          };

    for (const [prop, value] of Object.entries(vars)) {
      el.style.setProperty(prop, value);
    }
  }, [resolved]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    notifyStoredThemeListeners(); // triggers useSyncExternalStore re-read
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeCtx.Provider>
  );
}
