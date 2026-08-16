import { create } from "zustand";

export type ThemePref = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "dh:theme";

/** Reads the persisted choice. Shared with the pre-paint script in index.html. */
export function storedTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * "system" removes the attribute entirely rather than resolving it to a value,
 * so the CSS media query keeps tracking the OS live — a user who flips their
 * phone to dark at sunset shouldn't have to reload.
 */
function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  // Keep the browser/OS chrome in step with the page.
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#141310" : "#f7f6f3");
}

interface ThemeState {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: storedTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* storage disabled — the choice just won't survive a reload */
    }
    apply(theme);
    set({ theme });
  },
}));

/**
 * Called once at startup. The attribute itself is already set by the inline
 * script in index.html (before first paint, to avoid a flash); this syncs the
 * theme-color meta and keeps it correct as the OS preference changes while
 * the user is on "system".
 */
export function initTheme() {
  apply(storedTheme());
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (useThemeStore.getState().theme === "system") apply("system");
    });
}
