"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ShaderBackground = dynamic(
  () =>
    import("@/components/landing/shader-background").then(
      (m) => m.ShaderBackground,
    ),
  { ssr: false },
);

const LiquidLogo = dynamic(
  () => import("@/components/landing/liquid-logo").then((m) => m.LiquidLogo),
  { ssr: false },
);

export function LandingHero() {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col justify-center px-4 pb-12 pt-8 sm:px-6 sm:pb-16 sm:pt-12 lg:px-8">
      <ShaderBackground />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-8 md:gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        <div className="relative z-10 mx-auto w-full max-w-2xl text-center lg:mx-0 lg:text-left">
          <p className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,11vw,6.8rem)] leading-[0.88] tracking-[-0.06em] text-[color:var(--mkt-fg)] animate-rise">
            Company
            <span className="mkt-gradient-text">OS</span>
          </p>
          <h1 className="mx-auto mt-5 max-w-xl text-balance text-xl font-medium leading-snug tracking-tight text-[color:var(--mkt-fg)] sm:mt-6 sm:text-2xl md:text-3xl lg:mx-0 animate-rise-delay">
            Hire, deliver, and automate—with AI that asks before it acts.
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-sm leading-7 text-[color:var(--mkt-muted)] sm:text-base md:text-lg lg:mx-0 animate-rise-delay-2">
            Company Brain answers from your vault. Projects, hiring, clients,
            and MCP tools run under a Decision Firewall with full audit trails.
          </p>

          <div className="mt-7 flex w-full flex-col gap-3 sm:mt-8 sm:flex-row sm:justify-center lg:justify-start animate-rise-delay-3">
            <Link href="/#features" className="mkt-btn-primary w-full sm:w-auto">
              Explore features
              <ArrowRight size={17} className="transition group-hover:translate-x-0.5" />
            </Link>
            <Link href="/register" className="mkt-btn-secondary w-full sm:w-auto">
              Start free
            </Link>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[280px] sm:max-w-[360px] md:max-w-[420px] lg:max-w-none lg:h-[min(520px,55vh)] lg:w-full lg:max-w-lg lg:aspect-auto">
          <div className="absolute inset-[12%] rounded-full bg-[color:var(--mkt-glow)] blur-3xl animate-pulse-soft" />
          <LiquidLogo className="relative h-full w-full min-h-[240px]" />
        </div>
      </div>
    </section>
  );
}
