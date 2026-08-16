import { useThemeStore, type ThemePref } from "@/stores/theme";
import { cn } from "@/lib/utils";

const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);
const MOON = <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />;
const MONITOR = (
  <>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </>
);

const OPTIONS: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: SUN },
  { value: "system", label: "System", icon: MONITOR },
  { value: "dark", label: "Dark", icon: MOON },
];

/**
 * Three-way rather than a binary flip: "follow the system" is a real
 * preference, and a two-state toggle silently strands anyone whose phone
 * switches theme at sunset.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useThemeStore();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn("flex gap-0.5 rounded-md border border-border bg-secondary/60 p-0.5", className)}
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-[5px] py-1.5 transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              {o.icon}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
