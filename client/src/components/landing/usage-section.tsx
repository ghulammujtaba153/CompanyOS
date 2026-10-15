"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FolderKanban,
  Bot,
  ShieldCheck,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import { LiquidGlass } from "@/components/landing/liquid-glass";
import { SectionHeading } from "@/components/marketing/section-heading";
import { cn } from "@/lib/utils";

const steps = [
  {
    id: "org",
    number: "01",
    title: "Set up your company",
    Icon: Building2,
    summary: "Define departments, people, and access in Organization.",
    detail:
      "Start in Organization to map departments, invite people, and assign roles. CompanyOS uses this structure so agents and workflows always know who owns what.",
    actions: [
      "Add departments and reporting lines",
      "Invite teammates with role-based access",
      "Set who can approve high-risk actions",
    ],
    href: "/dashboard/organization",
    cta: "Open Organization",
  },
  {
    id: "work",
    number: "02",
    title: "Create projects & issues",
    Icon: FolderKanban,
    summary: "Run delivery from Work Management with boards and invites.",
    detail:
      "Create a project, invite members by email, then track work across To do → In progress → Done. Issues stay project-scoped with comments and activity.",
    actions: [
      "Create a project and invite by email",
      "Add issues with owners and priority",
      "Drag cards across the 3-state board",
    ],
    href: "/dashboard/work-management/projects",
    cta: "Open Projects",
  },
  {
    id: "agents",
    number: "03",
    title: "Deploy an AI workforce",
    Icon: Bot,
    summary: "Assign agents to recruiting, ops, and process work.",
    detail:
      "Spin up agents with clear scopes—screening candidates, preparing onboarding, or spotting process bottlenecks—then watch activity from the command center.",
    actions: [
      "Choose an agent for a business function",
      "Give it context from Company Brain",
      "Review daily activity and outputs",
    ],
    href: "/dashboard/ai-workforce",
    cta: "Open AI Workforce",
  },
  {
    id: "governance",
    number: "04",
    title: "Govern every action",
    Icon: ShieldCheck,
    summary: "Policy, permissions, and human approval before execution.",
    detail:
      "The Decision Firewall checks risk and policy. Low-risk work can run autonomously; anything sensitive lands in Approvals for a human decision.",
    actions: [
      "Configure autonomy levels by action type",
      "Review pending approvals in one queue",
      "Keep a full audit trail of outcomes",
    ],
    href: "/dashboard/governance",
    cta: "Open Governance",
  },
  {
    id: "comms",
    number: "05",
    title: "Coordinate in one inbox",
    Icon: MessageSquare,
    summary: "Native channels and inbox keep humans and agents aligned.",
    detail:
      "Use Communications for team channels and an inbox of agent updates—no third-party chat required for the core operating loop.",
    actions: [
      "Create channels per team or project",
      "Receive agent updates in the inbox",
      "Keep decisions close to the work",
    ],
    href: "/dashboard/communications",
    cta: "Open Communications",
  },
  {
    id: "insights",
    number: "06",
    title: "Measure what moved",
    Icon: BarChart3,
    summary: "Analytics show automation rate, recovery, and bottlenecks.",
    detail:
      "Track hours recovered, automation rate, and process friction. Use insights to decide where to raise autonomy—and where humans should stay involved.",
    actions: [
      "Monitor automation and recovery metrics",
      "Spot stalled processes early",
      "Tune agent scopes from real outcomes",
    ],
    href: "/dashboard/analytics",
    cta: "Open Analytics",
  },
] as const;

export function UsageSection() {
  const [activeId, setActiveId] = useState<(typeof steps)[number]["id"]>("org");
  const active = steps.find((step) => step.id === activeId) ?? steps[0];
  const ActiveIcon = active.Icon;

  return (
    <section id="usage" className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top right, var(--mkt-glow), transparent 45%), radial-gradient(ellipse at bottom left, color-mix(in oklab, var(--mkt-mint) 18%, transparent), transparent 40%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="How to use CompanyOS"
          title="From setup to governed execution."
          description="A practical path through the product—so your team knows exactly where to start and what each module is for."
        />

        <div className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none lg:hidden">
          {steps.map((step) => {
            const selected = step.id === active.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveId(step.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition",
                  selected
                    ? "border-[color:var(--mkt-accent)]/40 bg-[color:var(--mkt-accent)] text-[color:var(--mkt-on-accent)]"
                    : "border-[color:var(--mkt-border)] bg-[color:var(--mkt-panel-soft)] text-[color:var(--mkt-fg)]",
                )}
              >
                {step.number} {step.title}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-5 lg:mt-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="hidden flex-col gap-2 lg:flex">
            {steps.map((step) => {
              const Icon = step.Icon;
              const selected = step.id === active.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveId(step.id)}
                  className={cn(
                    "group flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition",
                    selected
                      ? "border-[color:var(--mkt-chip-border)] bg-[color:var(--mkt-chip-bg)]"
                      : "border-[color:var(--mkt-border)] bg-[color:var(--mkt-panel-soft)] hover:border-[color:var(--mkt-border-strong)] hover:bg-[color:var(--mkt-panel-hover)]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl",
                      selected
                        ? "bg-[color:var(--mkt-accent)] text-[color:var(--mkt-on-accent)]"
                        : "bg-[color:var(--mkt-panel-hover)] text-[color:var(--mkt-mint)]",
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold tracking-[0.14em] text-[color:var(--mkt-mint)]">
                        {step.number}
                      </span>
                      <span className="truncate text-sm font-semibold text-[color:var(--mkt-fg)]">
                        {step.title}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[color:var(--mkt-muted)]">
                      {step.summary}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <LiquidGlass intensity="strong" className="rounded-[1.75rem] p-5 sm:p-8">
            <div className="flex items-start gap-3 sm:items-center">
              <span className="mkt-icon-well size-11 shrink-0 sm:size-12 !rounded-2xl !bg-[color:var(--mkt-accent)] !text-[color:var(--mkt-on-accent)]">
                <ActiveIcon size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--mkt-mint)]">
                  STEP {active.number}
                </p>
                <h3 className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[color:var(--mkt-fg)] sm:text-2xl">
                  {active.title}
                </h3>
              </div>
            </div>

            <p className="mt-5 text-sm leading-7 text-[color:var(--mkt-muted)] sm:mt-6 sm:text-base sm:leading-8">
              {active.detail}
            </p>

            <ul className="mt-6 space-y-3 sm:mt-8">
              {active.actions.map((action) => (
                <li
                  key={action}
                  className="flex items-start gap-3 text-sm text-[color:var(--mkt-fg)]"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[color:var(--mkt-accent)]" />
                  {action}
                </li>
              ))}
            </ul>

            <Link
              href={active.href}
              className="mkt-btn-primary mt-7 w-full sm:mt-8 sm:w-auto"
            >
              {active.cta}
              <ArrowRight size={16} />
            </Link>
          </LiquidGlass>
        </div>
      </div>
    </section>
  );
}
