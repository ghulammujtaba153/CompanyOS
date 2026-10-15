import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  HeartHandshake,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import { LiquidGlass } from "@/components/landing/liquid-glass";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn why CompanyOS exists: an AI operating system that helps companies move faster without losing accountability, policy control, or human oversight.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About CompanyOS",
    description:
      "Work deserves a better operating system. Meet the principles behind CompanyOS.",
    url: "/about",
  },
  twitter: {
    title: "About CompanyOS",
    description:
      "Work deserves a better operating system. Meet the principles behind CompanyOS.",
  },
};

const principles = [
  {
    Icon: Target,
    title: "Mission",
    text: "Give every company an intelligent, trustworthy system for coordinating work across people and AI.",
  },
  {
    Icon: ShieldCheck,
    title: "Principle",
    text: "AI should propose and assist; people and policy should govern what actually executes.",
  },
  {
    Icon: Eye,
    title: "Ambition",
    text: "Move businesses from fragmented tools toward adaptive, process-aware operations.",
  },
];

const values = [
  {
    Icon: Scale,
    title: "Accountability first",
    text: "Every automated action should be explainable, reviewable, and owned.",
  },
  {
    Icon: HeartHandshake,
    title: "Humans in the loop",
    text: "Autonomy is earned—not assumed. Sensitive work stays under human control.",
  },
  {
    Icon: Sparkles,
    title: "Operational clarity",
    text: "Context beats cleverness. Agents only help when they understand how the company works.",
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8 lg:pt-28">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
          style={{
            background:
              "radial-gradient(ellipse at top, var(--mkt-glow), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="mkt-chip">
            <Sparkles size={14} /> Our point of view
          </p>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2.4rem,8vw,4.5rem)] tracking-[-0.055em] text-[color:var(--mkt-fg)] sm:mt-7">
            Work deserves a better{" "}
            <span className="mkt-gradient-text">operating system.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[color:var(--mkt-muted)] sm:mt-7 sm:text-lg sm:leading-8">
            We believe AI should make companies more capable—not less
            accountable. CompanyOS is a self-contained layer that helps
            organizations coordinate work with intelligence, transparency, and
            control—without depending on a web of third-party connectors.
          </p>
        </div>
      </section>

      <section className="border-y mkt-section-rule bg-[color:var(--mkt-panel-soft)] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:gap-24">
          <SectionHeading
            eyebrow="Why CompanyOS"
            title="A company is more than its software."
          />
          <div className="space-y-6 text-lg leading-8 text-[color:var(--mkt-muted)]">
            <p>
              Today, work is spread across dozens of tools, handoffs, policies,
              and people. Most AI products can retrieve information or generate
              content—but they do not understand the constraints that make work
              reliable.
            </p>
            <p>
              CompanyOS gives AI that missing operational context: how a company
              works, who can decide, what is safe to automate, and when humans
              need to remain in the loop.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            align="center"
            eyebrow="What guides us"
            title="Principles we design around."
          />
          <div className="mt-8 grid gap-4 sm:mt-12 md:grid-cols-3">
            {principles.map(({ Icon, title, text }) => (
              <LiquidGlass key={title} className="rounded-3xl p-5 sm:p-7">
                <span className="mkt-icon-well size-11">
                  <Icon size={21} />
                </span>
                <h2 className="mt-6 text-xl font-semibold text-[color:var(--mkt-fg)] sm:mt-8">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--mkt-muted)] sm:text-base">
                  {text}
                </p>
              </LiquidGlass>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y mkt-section-rule px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="How we work"
            title="Values that show up in the product."
            description="These are not slideware. They shape autonomy defaults, approval flows, and every audit trail in CompanyOS."
          />
          <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
            {values.map(({ Icon, title, text }) => (
              <div
                key={title}
                className="rounded-3xl border border-[color:var(--mkt-border)] bg-[color:var(--mkt-bg-elevated)] p-5 sm:p-6"
              >
                <Icon className="text-[color:var(--mkt-mint)]" size={22} />
                <h3 className="mt-5 text-lg font-semibold text-[color:var(--mkt-fg)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mkt-muted)]">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <LiquidGlass
            intensity="strong"
            className="rounded-[1.5rem] px-5 py-10 text-center sm:rounded-[2rem] sm:px-10 sm:py-14 lg:px-14"
          >
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,5vw,3rem)] tracking-tight text-[color:var(--mkt-fg)]">
              Build the future of operations with us.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[color:var(--mkt-muted)] sm:mt-5 sm:text-base">
              We design CompanyOS with teams that care about speed and
              accountability in equal measure.
            </p>
            <Link href="/contact" className="mkt-btn-primary mt-7 sm:mt-8">
              Get in touch <ArrowRight size={17} />
            </Link>
          </LiquidGlass>
        </div>
      </section>
    </MarketingShell>
  );
}
