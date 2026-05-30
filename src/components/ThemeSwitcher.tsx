import { useEffect, useState } from "react";
import { Palette, Check, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ThemeId = "red" | "orange" | "yellow" | "green" | "blue";
type Mode = "light" | "dark" | "system";

interface ThemePreview {
  id: ThemeId;
  label: string;
  primary: string;
  accent: string;
  sidebar: string;
  surface: string;
}

const THEMES: ThemePreview[] = [
  { id: "red",    label: "Red",    primary: "#c41212", accent: "#e02020", sidebar: "#4a1212", surface: "#fef4f4" },
  { id: "orange", label: "Orange", primary: "#d97a1f", accent: "#e7903c", sidebar: "#3a2818", surface: "#fdf6ee" },
  { id: "yellow", label: "Yellow", primary: "#d9a40e", accent: "#eebb22", sidebar: "#332a14", surface: "#fdf8e8" },
  { id: "green",  label: "Green",  primary: "#5a9437", accent: "#71b349", sidebar: "#1f2d18", surface: "#f3f7ee" },
  { id: "blue",   label: "Blue",   primary: "#2774c2", accent: "#3a8dde", sidebar: "#1a2a3d", surface: "#eef4fb" },
];

const THEME_KEY = "rcm.theme";
const MODE_KEY = "rcm.mode";

function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
}
function applyMode(mode: Mode) {
  const root = document.documentElement;
  const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", mode === "dark" || (mode === "system" && prefersDark));
}

export function initThemeFromStorage() {
  if (typeof window === "undefined") return;
  applyTheme((localStorage.getItem(THEME_KEY) as ThemeId | null) ?? "blue");
  applyMode((localStorage.getItem(MODE_KEY) as Mode | null) ?? "light");
}

/** Mini app-chrome preview: sidebar + header bar + accent button. */
function ThemeTile({ t, selected, onClick }: { t: ThemePreview; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Use ${t.label} theme`}
      className={`group relative flex flex-col rounded-lg border-2 overflow-hidden transition-all ${
        selected ? "border-foreground shadow-md" : "border-border hover:border-foreground/40"
      }`}
    >
      {/* Mini app preview */}
      <div className="flex h-14 w-full" style={{ background: t.surface }}>
        {/* Sidebar */}
        <div className="w-3.5 shrink-0 flex flex-col items-center gap-1 py-1.5" style={{ background: t.sidebar }}>
          <div className="h-1 w-1.5 rounded-sm" style={{ background: t.accent }} />
          <div className="h-0.5 w-1.5 rounded-sm bg-white/30" />
          <div className="h-0.5 w-1.5 rounded-sm bg-white/30" />
        </div>
        {/* Body */}
        <div className="flex-1 p-1.5 flex flex-col gap-1">
          <div className="h-1.5 w-2/3 rounded-sm" style={{ background: t.primary }} />
          <div className="h-1 w-full rounded-sm bg-black/10" />
          <div className="flex items-center gap-1 mt-auto">
            <div className="h-2 w-5 rounded-sm" style={{ background: t.accent }} />
            <div className="h-2 w-3 rounded-sm bg-black/15" />
          </div>
        </div>
      </div>
      {/* Label row */}
      <div className="flex items-center justify-between px-2 py-1 bg-card">
        <span className="text-[11px] font-medium text-foreground">{t.label}</span>
        {selected ? (
          <Check className="h-3 w-3 text-foreground" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: t.primary }} />
        )}
      </div>
    </button>
  );
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>("blue");
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    const t = (localStorage.getItem(THEME_KEY) as ThemeId | null) ?? "blue";
    const m = (localStorage.getItem(MODE_KEY) as Mode | null) ?? "light";
    setTheme(t); applyTheme(t);
    setMode(m); applyMode(m);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(MODE_KEY) ?? "system") === "system") applyMode("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const chooseTheme = (id: ThemeId) => {
    setTheme(id);
    localStorage.setItem(THEME_KEY, id);
    applyTheme(id);
  };
  const chooseMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY, m);
    applyMode(m);
  };

  const MODES: { id: Mode; label: string; icon: typeof Sun }[] = [
    { id: "light",  label: "Light",  icon: Sun },
    { id: "dark",   label: "Dark",   icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Change appearance">
          <Palette className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground px-1 pb-1">
          Mode
        </DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-2">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => chooseMode(id)}
              className={`flex flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] transition-colors ${
                mode === id
                  ? "border-foreground bg-muted text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground px-1 pt-1 pb-1.5">
          Color theme
        </DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1.5 px-1 pb-1">
          {THEMES.map((t) => (
            <ThemeTile key={t.id} t={t} selected={theme === t.id} onClick={() => chooseTheme(t.id)} />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground px-1 pt-1.5">
          Status colors (settled · denial · approval) stay the same across themes.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
