"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [theme, setTheme] = useState<string>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(false);

  useEffect(() => {
    // Check for saved theme preference
    const saved = localStorage.getItem("fairhold.theme.v1");
    if (saved) {
      setTheme(saved);
    } else {
      // Check OS preference on mount
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      setSystemPrefersDark(media.matches);
      setTheme(media.matches ? "system" : "light");
      // Save the initial preference
      localStorage.setItem("fairhold.theme.v1", theme);
    }

    // Listen for OS theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
      if (theme === "system") {
        setTheme(e.matches ? "system" : "light");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const applyTheme = () => {
    const html = document.documentElement;
    switch (theme) {
      case "dark":
        html.setAttribute("data-theme", "dark");
        html.setAttribute("color-scheme", "dark");
        break;
      case "light":
        html.setAttribute("data-theme", "light");
        html.setAttribute("color-scheme", "light");
        break;
      case "system":
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        html.setAttribute("data-theme", isDark ? "system" : "light");
        html.setAttribute("color-scheme", isDark ? "dark" : "light");
        break;
    }
  };

  useEffect(() => {
    applyTheme();
  }, [theme]);

  // Button class names for each theme option
  const darkButtonClass =
    "rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)] text-sm font-medium transition-colors";
  const lightButtonClass =
    "rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)] text-sm font-medium transition-colors";
  const systemButtonClass =
    "rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)] text-sm font-medium transition-colors";
  const selectedDarkClass =
    "rounded-lg border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]";
  const selectedLightClass =
    "rounded-lg border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]";
  const selectedSystemClass =
    "rounded-lg border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <section className="page-frame py-20">
      <div className="max-w-2xl mx-auto">
        <h1 className="headline mb-8 text-center">
          Appearance Settings
        </h1>

        <div className="mb-6 text-center">
          <p className="section-label mb-2">Preferred theme</p>
          <p className="text-lg font-medium text-[var(--foreground)]">
            {theme === "system"
              ? "Follow system preference"
              : theme === "dark"
                ? "Dark mode"
                : "Light mode"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mb-8">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={theme === "dark" ? selectedDarkClass : darkButtonClass}
          >
            Dark mode
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={theme === "light" ? selectedLightClass : lightButtonClass}
          >
            Light mode
          </button>
          <button
            type="button"
            onClick={() => setTheme("system")}
            className={theme === "system" ? selectedSystemClass : systemButtonClass}
          >
            System mode
          </button>
        </div>

        <div className="mb-6">
          <p className="section-label mb-2">Color scheme</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setTheme("dark");
                localStorage.setItem("fairhold.theme.v1", "dark");
              }}
              className={theme === "dark" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] hover:bg-[var(--surface)]"}
              aria-pressed={theme === "dark"}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme("light");
                localStorage.setItem("fairhold.theme.v1", "light");
              }}
              className={theme === "light" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] hover:bg-[var(--surface)]"}
              aria-pressed={theme === "light"}
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => {
                setTheme("system");
                localStorage.setItem("fairhold.theme.v1", "system");
              }}
              className={theme === "system" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] hover:bg-[var(--surface)]"}
              aria-pressed={theme === "system"}
            >
              System
            </button>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-[var(--hairline)] text-center">
          <p className="text-sm text-[var(--foreground-soft)]">
            Changes are saved to your browser. Switching themes refreshes the page.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-[var(--accent)] hover:text-[var(--foreground)]"
          >
            Return to FairHold
          </Link>
        </div>
      </div>
    </section>
  );
}