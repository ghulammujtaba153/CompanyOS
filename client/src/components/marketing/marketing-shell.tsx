import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { cn } from "@/lib/utils";

export function MarketingShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "marketing-shell relative min-h-screen overflow-x-hidden bg-[color:var(--mkt-bg)] text-[color:var(--mkt-fg)]",
        className,
      )}
    >
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}
