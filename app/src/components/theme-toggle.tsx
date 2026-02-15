"use client";

import { useTheme } from "./theme-provider";

const options = [
  { value: "system" as const, label: "System", icon: "💻" },
  { value: "light" as const, label: "Light", icon: "☀️" },
  { value: "dark" as const, label: "Dark", icon: "🌙" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 bg-theme-surface border border-theme-border rounded-lg p-0.5" data-testid="theme-toggle">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          aria-label={`Switch to ${opt.label} theme`}
          aria-pressed={theme === opt.value}
          data-testid={`theme-${opt.value}`}
          className={`px-2 py-1 text-xs rounded-md transition-colors ${
            theme === opt.value
              ? "bg-violet-600 text-white"
              : "text-theme-muted hover:text-theme-text"
          }`}
        >
          <span aria-hidden="true">{opt.icon}</span>
        </button>
      ))}
    </div>
  );
}
