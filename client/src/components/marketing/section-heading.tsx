import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" && "mx-auto max-w-2xl text-center",
        align === "left" && "max-w-2xl",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--mkt-accent)] sm:text-xs">
        {eyebrow}
      </p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.75rem,5vw,3rem)] tracking-tight text-[color:var(--mkt-fg)]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-sm leading-7 text-[color:var(--mkt-muted)] sm:mt-5 sm:text-base md:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}
