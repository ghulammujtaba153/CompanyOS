import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  CircleCheck,
  Clock3,
  FileStack,
  FolderKanban,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
  Workflow,
  Zap,
  Building2,
  Receipt,
  Handshake,
} from "lucide-react";
import { BrandMark } from "@/components/brand-logo";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import { LiquidGlass } from "@/components/landing/liquid-glass";
import { LandingHero } from "@/components/landing/landing-hero";
import { UsageSection } from "@/components/landing/usage-section";

export const metadata: Metadata = {
  title: {
    absolute: "CompanyOS — AI Operating System for Business",
  },
  description:
    "CompanyOS unifies Company Brain, work management, hiring, clients, governed MCP agents, documents, and analytics in one operating layer.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "CompanyOS — AI Operating System for Business",
    description:
      "Ask your documents, run projects and hiring, and let AI act only when policy allows.",
    url: "/",
  },
  twitter: {
    title: "CompanyOS — AI Operating System for Business",
    description:
      "Ask your documents, run projects and hiring, and let AI act only when policy allows.",
  },
};

const features = [
  [
    BrainCircuit,
    "Company Brain",
    "Ask policy and contract questions with citations—hybrid retrieval over your document vault.",
  ],
  [
    FileStack,
    "Document vault",
    "Upload PDFs, spreadsheets, and Markdown. Tables extract cleanly for search and RAG.",
  ],
  [
    LockKeyhole,
    "Decision Firewall",
    "MCP tools and agents pass risk, passport, and approval checks before anything executes.",
  ],
  [
    FolderKanban,
    "Work management",
    "Projects, boards, issues, time tracking, and project-scoped document spaces.",
  ],
] as const;

const modules = [
  {
    Icon: Building2,
    title: "Organization",
    text: "Departments, people, roles, and access for the whole company.",
  },
  {
    Icon: UsersRound,
    title: "People operations",
    text: "Hiring pipeline, offers, onboarding, leave, and performance.",
  },
  {
    Icon: Handshake,
    title: "Clients & CRM",
    text: "Pipeline, engagements, contracts, and a client portal.",
  },
  {
    Icon: Bot,
    title: "AI workforce & MCP",
    text: "Scoped agents plus governed tools for brain, work, and people ops.",
  },
  {
    Icon: ShieldCheck,
    title: "Governance",
    text: "Autonomy levels, passports, approvals queue, and audit log.",
  },
  {
    Icon: Receipt,
    title: "Finance & analytics",
    text: "Invoices, utilization, delivery health, and hiring signals.",
  },
] as const;

export default function Home() {
  return (
    <MarketingShell>
      <LandingHero />

      <section
        id="features"
        className="relative border-y mkt-section-rule px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at top, var(--mkt-glow), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="What you get"
            title="Features built for real operations."
            description="Not another chatbot bolt-on—CompanyOS ships the modules your team already needs, with AI grounded in your data and gated by policy."
          />
          <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(([Icon, title, text], index) => (
              <LiquidGlass
                key={title}
                className="rounded-3xl p-5 transition duration-500 hover:-translate-y-1"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <span className="mkt-icon-well size-10">
                  <Icon size={20} />
                </span>
                <h3 className="mt-6 text-lg font-semibold text-[color:var(--mkt-fg)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mkt-muted)]">
                  {text}
                </p>
              </LiquidGlass>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/platform"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--mkt-accent)] transition hover:text-[color:var(--mkt-accent-bright)]"
            >
              Explore the full platform <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <UsageSection />

      <section
        id="modules"
        className="border-y mkt-section-rule px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            align="center"
            eyebrow="Inside the product"
            title="One workspace for every operating loop."
            description="From org chart to invoice—people, delivery, clients, AI, and governance stay connected."
          />
          <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
            {modules.map(({ Icon, title, text }) => (
              <LiquidGlass key={title} className="rounded-3xl p-5 sm:p-6">
                <span className="mkt-icon-well size-11 !text-[color:var(--mkt-mint)]">
                  <Icon size={20} />
                </span>
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

      <section id="how-it-works" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            align="center"
            eyebrow="Controlled autonomy"
            title="AI that knows when to ask."
            description="Every agent and MCP action follows an explainable path—from company context to accountable execution."
          />
          <div className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 md:mt-14 lg:grid-cols-5">
            {(
              [
                ["01", "Retrieve", "Company Brain + vault"],
                ["02", "Plan", "Structured tool calls"],
                ["03", "Validate", "Firewall + passports"],
                ["04", "Approve", "Human oversight"],
                ["05", "Execute", "Audited results"],
              ] as const
            ).map(([number, title, detail], i) => (
              <LiquidGlass key={title} className="relative rounded-3xl p-5">
                {i < 4 && (
                  <span className="absolute -right-2 top-1/2 z-20 hidden size-4 -translate-y-1/2 rounded-full border border-[color:var(--mkt-accent)]/40 bg-[color:var(--mkt-bg)] md:block" />
                )}
                <span className="text-xs font-medium text-[color:var(--mkt-accent)]">
                  {number}
                </span>
                <h3 className="mt-6 font-semibold text-[color:var(--mkt-fg)]">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-[color:var(--mkt-muted)]">
                  {detail}
                </p>
              </LiquidGlass>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            align="center"
            className="mb-8 sm:mb-10"
            eyebrow="Product preview"
            title="A command center for the whole company."
            description="Brain answers, hiring moves, project boards, and approval queues—visible in one place."
          />
          <DashboardPreview />
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <LiquidGlass
            intensity="strong"
            className="rounded-[1.5rem] px-5 py-10 text-center sm:rounded-[2rem] sm:px-10 sm:py-14 lg:px-14"
          >
            <BrandMark className="mx-auto size-12" />
            <h2 className="mx-auto mt-5 max-w-2xl font-[family-name:var(--font-display)] text-[clamp(1.75rem,5vw,3rem)] tracking-tight text-[color:var(--mkt-fg)]">
              Ready to run operations with controlled AI?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[color:var(--mkt-muted)] sm:mt-5 sm:text-base">
              Create a company workspace, index your vault, and let governed
              agents handle the busywork.
            </p>
            <div className="mt-7 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:items-center">
              <Link href="/register" className="mkt-btn-primary">
                Create your company <ArrowRight size={17} />
              </Link>
              <Link href="/login" className="mkt-btn-secondary">
                Sign in
              </Link>
            </div>
          </LiquidGlass>
        </div>
      </section>
    </MarketingShell>
  );
}

function DashboardPreview() {
  const metrics = [
    { label: "Active agents", value: "12", delta: "+2 this week", Icon: Bot },
    {
      label: "Automation rate",
      value: "87%",
      delta: "+12% this month",
      Icon: Zap,
    },
    {
      label: "Hours recovered",
      value: "186",
      delta: "This month",
      Icon: Clock3,
    },
    {
      label: "Needs review",
      value: "3",
      delta: "View approvals",
      Icon: ShieldCheck,
    },
  ];

  return (
    <LiquidGlass className="rounded-[1.25rem] p-1.5 shadow-2xl shadow-black/20 dark:shadow-black/40 sm:rounded-[1.75rem] sm:p-2">
      <div className="overflow-hidden rounded-[1rem] border border-[color:var(--mkt-border)] bg-[#f4f6f2] text-slate-900 sm:rounded-[1.35rem]">
        <div className="flex h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:h-12 sm:px-4">
          <div className="flex gap-2">
            <i className="size-2 rounded-full bg-red-400" />
            <i className="size-2 rounded-full bg-amber-400" />
            <i className="size-2 rounded-full bg-emerald-400" />
          </div>
          <span className="truncate rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-400 sm:px-3 sm:text-[10px]">
            companyos · command-center
          </span>
          <span className="hidden size-12 sm:block" />
        </div>
        <div className="grid min-h-0 grid-cols-1 md:min-h-[480px] md:grid-cols-[180px_1fr]">
          <aside className="hidden border-r border-slate-200 bg-white p-4 md:block">
            <p className="mb-7 flex items-center gap-2 font-semibold">
              <BrandMark className="size-6" />
              CompanyOS
            </p>
            {[
              "Overview",
              "Company Brain",
              "Work",
              "People ops",
              "Clients",
              "Governance",
              "Analytics",
            ].map((item, index) => (
              <p
                key={item}
                className={`mb-1 rounded-md px-2.5 py-2 text-xs ${index === 0 ? "bg-[#0a0c10] text-white" : "text-slate-500"}`}
              >
                {item}
              </p>
            ))}
          </aside>
          <div className="min-w-0 p-3 sm:p-5 md:p-7">
            <p className="text-xs font-medium text-lime-700">PRODUCT PREVIEW</p>
            <h2 className="mt-1 text-lg font-semibold sm:text-xl md:text-2xl">
              Good morning
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Vault indexed · 3 approvals waiting · hiring pipeline healthy.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3 lg:grid-cols-4">
              {metrics.map(({ label, value, delta, Icon }, index) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3"
                >
                  <span
                    className={`grid size-7 place-items-center rounded-md ${index === 3 ? "bg-amber-100 text-amber-600" : "bg-lime-50 text-lime-700"}`}
                  >
                    <Icon size={16} />
                  </span>
                  <b className="mt-2 block text-lg sm:mt-3 sm:text-xl">{value}</b>
                  <p className="text-[10px] text-slate-500 sm:text-[11px]">{label}</p>
                  <small
                    className={
                      index === 3 ? "text-amber-700" : "text-emerald-600"
                    }
                  >
                    {delta}
                  </small>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-[1.25fr_.75fr]">
              <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <h3 className="text-sm font-semibold">What moved today</h3>
                <p className="text-[11px] text-slate-500">
                  Agents and teammates across hiring, delivery, and docs
                </p>
                <div className="mt-4 space-y-3">
                  <Activity
                    Icon={UsersRound}
                    text="Screened 42 candidates for Backend Engineer"
                    detail="Hiring · Recruiting Agent · 12 min ago"
                  />
                  <Activity
                    Icon={Workflow}
                    text="Created OPS-18 from client brief"
                    detail="Work · Delivery Agent · 28 min ago"
                  />
                  <Activity
                    Icon={BriefcaseBusiness}
                    text="Answered PTO question with handbook citation"
                    detail="Company Brain · 1 hr ago"
                  />
                </div>
              </div>
              <div className="rounded-xl bg-[#0a0c10] p-3 text-white sm:p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-[#b8f34a]">
                  <BrainCircuit size={15} /> COMPANY BRAIN
                </p>
                <p className="mt-3 text-sm text-slate-200">
                  “How many PTO days do employees get?”
                </p>
                <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                  Full-time employees receive 20 PTO days per year…
                  <span className="mt-2 block text-[10px] text-slate-500">
                    Cited · Employee Handbook · hybrid retrieval
                  </span>
                </div>
                <p className="mt-3 text-[10px] text-slate-500">
                  Policy-aware · audited with trace ID
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LiquidGlass>
  );
}

function Activity({
  Icon,
  text,
  detail,
}: {
  Icon: typeof UsersRound;
  text: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded bg-lime-50 text-lime-700">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{text}</p>
        <p className="text-[10px] text-slate-500">{detail}</p>
      </div>
      <CircleCheck className="ml-auto shrink-0 text-emerald-500" size={15} />
    </div>
  );
}
