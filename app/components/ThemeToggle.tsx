"use client";

import { useCallback, useSyncExternalStore } from "react";
import { SunIcon, MoonIcon } from "@navikt/aksel-icons";

const getServerSnapshot = () => true;

const getSnapshot = () => {
  if (typeof window === "undefined") return true;
  const saved = localStorage.getItem("theme");
  if (saved === null) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return saved === "dark";
};

const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !isDark;
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.setAttribute(
      "data-color-scheme",
      next ? "dark" : "light",
    );
    window.dispatchEvent(new Event("storage"));
  }, [isDark]);

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="p-2 rounded-lg bg-[var(--ds-color-surface-tinted)] text-[var(--ds-color-text-subtle)] border border-[var(--ds-color-border-subtle)] hover:bg-[var(--ds-color-surface-hover)] hover:text-[var(--ds-color-text-default)] transition-colors"
    >
      {isDark ? (
        <SunIcon className="w-5 h-5" />
      ) : (
        <MoonIcon className="w-5 h-5" />
      )}
    </button>
  );
}
