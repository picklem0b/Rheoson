export type ThemeAccent =
   | "crimson"
   | "rose"
   | "orange"
   | "violet"
   | "cyan"
   | "green"
   | "gold";

export type ThemeSurface = "dark" | "light";

export interface Theme {
   accent: ThemeAccent;
   surface: ThemeSurface;
}

export interface ThemeAccentConfig {
   id: ThemeAccent;
   label: string;
   color: string;
   bright: string;
}

export const ACCENT_THEMES: ThemeAccentConfig[] = [
   { id: "crimson", label: "Crimson", color: "#E5193A", bright: "#FF3B5C" },
   { id: "rose", label: "Rose", color: "#F43F5E", bright: "#FF6B81" },
   { id: "orange", label: "Orange", color: "#F97316", bright: "#FB923C" },
   { id: "violet", label: "Violet", color: "#8B5CF6", bright: "#A78BFA" },
   { id: "cyan", label: "Cyan", color: "#06B6D4", bright: "#22D3EE" },
   { id: "green", label: "Green", color: "#22C55E", bright: "#4ADE80" },
   { id: "gold", label: "Gold", color: "#EAB308", bright: "#FACC15" }
];

export const DEFAULT_THEME: Theme = {
   accent: "crimson",
   surface: "dark"
};

export function applyTheme(theme: Theme) {
   const root = document.documentElement;

   // Surface
   if (theme.surface === "light") {
      root.setAttribute("data-surface", "light");
   } else {
      root.removeAttribute("data-surface");
   }

   // Accent
   if (theme.accent === "crimson") {
      root.removeAttribute("data-theme");
   } else {
      root.setAttribute("data-theme", theme.accent);
   }

   // Persist
   localStorage.setItem("rheoson-theme", JSON.stringify(theme));
}

export function loadTheme(): Theme {
   try {
      const stored = localStorage.getItem("rheoson-theme");
      if (stored) return JSON.parse(stored) as Theme;
   } catch (error) {
      console.error("theme not loaded ", error);
   }
   return DEFAULT_THEME;
}
