import Link from "next/link";
import { BrandWordmark } from "@/components/brand-logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/platform", label: "Platform" },
      { href: "/#usage", label: "How to use" },
      { href: "/#modules", label: "Modules" },
      { href: "/register", label: "Start free" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/contact", label: "Book a demo" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/#how-it-works", label: "Autonomy model" },
      { href: "/platform#governance", label: "Governance" },
      { href: "/platform#workflows", label: "Workflows" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[color:var(--mkt-border)] bg-[color:var(--mkt-bg)] px-4 pb-8 pt-12 sm:px-6 sm:pb-10 sm:pt-16 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
        <div>
          <Link href="/" aria-label="CompanyOS home">
            <BrandWordmark markClassName="size-9" />
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-7 text-[color:var(--mkt-muted)]">
            Hire, deliver, govern AI, and answer from your documents—one
            operating system for the whole company.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--mkt-mint)]">
                {column.title}
              </p>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-[color:var(--mkt-muted)] transition hover:text-[color:var(--mkt-fg)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-14 flex max-w-7xl flex-col justify-between gap-3 border-t border-[color:var(--mkt-border)] pt-6 text-sm text-[color:var(--mkt-subtle)] sm:flex-row">
        <span>© 2026 CompanyOS. All rights reserved.</span>
        <span>Built for accountable automation.</span>
      </div>
    </footer>
  );
}
