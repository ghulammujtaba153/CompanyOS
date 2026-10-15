import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  FolderKanban,
  GitBranch,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import { LiquidGlass } from "@/components/landing/liquid-glass";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "Explore the CompanyOS platform: Company Brain, process intelligence, Decision Firewall, AI workforce, work management, and governed automation.",
  alternates: {
    canonical: "/platform",
  },
  openGraph: {
    title: "CompanyOS Platform",
    description:
      "One operating layer for people, process, and AI—with governance built in.",
    url: "/platform",
  },
  twitter: {
    title: "CompanyOS Platform",
    description:
      "One operating layer for people, process, and AI—with governance built in.",
  },
};

const layers = [
  {
    id: "workflows",
    Icon: Workflow,
    title: "Work & workflows",
    text: "Projects, issues, and process intelligence keep delivery and operations connected.",
    points: [
      "Project-scoped issues with invite-by-email",
      "3-state boards with transition rules",
      "Process discovery for bottlenecks",
    ],
  },
  {
    id: "governance",
    Icon: ShieldCheck,
    title: "Governance & firewall",
    text: "Autonomy is configurable. Risk and policy decide what runs alone vs. what needs approval.",
    points: [
      "Decision Firewall before execution",
      "Human approval queues",
      "Passports and audit trails",
    ],
  },
  {
    id: "agents",
    Icon: Bot,
    title: "AI workforce",
    text: "Agents operate inside company context—not as isolated chatbots.",
    points: [
      "Scoped agents per function",
      "Company Brain grounding",
      "Activity visible in the command center",
    ],
  },
];

export default function PlatformPage() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 pb-12 pt-16 sm:px-6 sm:pb-16 sm:pt-24 lg:px-8 lg:pt-28">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[380px]"
          style={{
            background:
              "radial-gradient(ellipse at top, color-mix(in oklab, var(--mkt-mint) 18%, transparent), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="mkt-chip">
            <Sparkles size={14} /> Platform
          </p>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2.4rem,8vw,4.5rem)] tracking-[-0.055em] text-[color:var(--mkt-fg)] sm:mt-7">
            One operating layer for{" "}
            <span className="mkt-gradient-text">people, process, and AI.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[color:var(--mkt-muted)] sm:mt-7 sm:text-lg sm:leading-8">
            CompanyOS unifies organization structure, work delivery, agent
            execution, and governance in one self-contained product—so
            automation stays useful and safe without external tool wiring.
          </p>
          <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center">
            <Link href="/#usage" className="mkt-btn-primary">
              See how to use it <ArrowRight size={16} />
            </Link>
            <Link href="/dashboard" className="mkt-btn-secondary">
              Open dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y mkt-section-rule px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Core capabilities"
            title="What the platform actually does."
          />
          <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                [BrainCircuit, "Company Brain", "Operational knowledge shared across teams and agents."],
                [GitBranch, "Process Intelligence", "Find friction in how work really moves."],
                [LockKeyhole, "Decision Firewall", "Validate policy and risk before action."],
                [FolderKanban, "Work Management", "Projects, issues, boards, and members."],
              ] as const
            ).map(([Icon, title, text]) => (
              <LiquidGlass key={title} className="rounded-3xl p-5">
                <Icon className="text-[color:var(--mkt-accent)]" size={22} />
                <h3 className="mt-5 text-lg font-semibold text-[color:var(--mkt-fg)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mkt-muted)]">
                  {text}
                </p>
              </LiquidGlass>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
          {layers.map(({ id, Icon, title, text, points }) => (
            <LiquidGlass
              key={id}
              id={id}
              className="scroll-mt-24 rounded-[1.5rem] p-5 sm:scroll-mt-28 sm:rounded-[1.75rem] sm:p-8"
            >
              <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-8">
                <div>
                  <span className="mkt-icon-well size-11 sm:size-12">
                    <Icon size={22} />
                  </span>
                  <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl tracking-tight text-[color:var(--mkt-fg)] sm:mt-5 sm:text-3xl">
                    {title}
                  </h2>
                  <p className="mt-3 max-w-lg text-sm leading-7 text-[color:var(--mkt-muted)] sm:text-base">
                    {text}
                  </p>
                </div>
                <ul className="space-y-3">
                  {points.map((point) => (
                    <li
                      key={point}
                      className="rounded-2xl border border-[color:var(--mkt-border)] bg-[color:var(--mkt-panel-soft)] px-4 py-3 text-sm text-[color:var(--mkt-fg)]"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </LiquidGlass>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <LiquidGlass
            intensity="strong"
            className="rounded-[1.5rem] px-5 py-10 text-center sm:rounded-[2rem] sm:px-7 sm:py-14"
          >
            <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,5vw,2.5rem)] tracking-tight text-[color:var(--mkt-fg)]">
              Prefer a guided walkthrough?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-[color:var(--mkt-muted)] sm:text-base">
              Contact us for a tailored demo, or jump into the live dashboard
              and explore every module yourself.
            </p>
            <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center">
              <Link href="/contact" className="mkt-btn-primary">
                Book a conversation <ArrowRight size={16} />
              </Link>
              <Link href="/about" className="mkt-btn-secondary">
                About CompanyOS
              </Link>
            </div>
          </LiquidGlass>
        </div>
      </section>
    </MarketingShell>
  );
}
