"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const THEME_KEY = "stance.theme";

/** Runs before paint so the page never flashes the wrong theme. */
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`;

export function useTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.dataset.theme === "light" ? "light" : "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

export function ThemeToggle() {
  const theme = useTheme();
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: the toggle still works for this visit */
    }
  };
  return (
    <button
      onClick={flip}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="relative flex h-9 w-16 items-center rounded-full bg-tile p-1 ring-1 ring-line transition"
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full bg-tile-3 text-ink shadow-sm transition-transform duration-300"
        style={{ transform: theme === "light" ? "translateX(28px)" : "translateX(0)" }}
      >
        {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
      </span>
    </button>
  );
}
