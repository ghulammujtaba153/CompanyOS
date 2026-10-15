import { cn } from "@/lib/utils";

/** CompanyOS mark: core + orbiting nodes (people · work · agents). */
export function BrandMark({
  className,
  title = "CompanyOS",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="40" height="40" rx="11" fill="#07090c" />
      <rect
        x="1.25"
        y="1.25"
        width="37.5"
        height="37.5"
        rx="9.75"
        stroke="#b8f34a"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      {/* Orbit ring */}
      <circle
        cx="20"
        cy="20"
        r="11.5"
        stroke="#6ee7b7"
        strokeOpacity="0.45"
        strokeWidth="1.25"
        strokeDasharray="2.5 3.5"
      />
      {/* Core */}
      <circle cx="20" cy="20" r="5.25" fill="#b8f34a" />
      <circle cx="20" cy="20" r="2.1" fill="#07090c" opacity="0.35" />
      {/* Orbit nodes: work · people · agents */}
      <circle cx="20" cy="8.5" r="2.15" fill="#d4ff4f" />
      <circle cx="30.2" cy="25.8" r="2.15" fill="#9ae6c8" />
      <circle cx="9.8" cy="25.8" r="2.15" fill="#6ee7b7" />
    </svg>
  );
}

export function BrandWordmark({
  className,
  markClassName,
  showMark = true,
}: {
  className?: string;
  markClassName?: string;
  showMark?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      {showMark ? <BrandMark className={cn("size-8 shrink-0", markClassName)} /> : null}
      <span className="truncate font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[color:var(--mkt-fg)] sm:text-lg">
        Company
        <span className="text-[color:var(--mkt-accent)]">OS</span>
      </span>
    </span>
  );
}
