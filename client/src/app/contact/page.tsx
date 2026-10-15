"use client";

import { FormEvent, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { LiquidGlass } from "@/components/landing/liquid-glass";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <MarketingShell>
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div
          className="pointer-events-none absolute left-1/2 top-0 size-[320px] -translate-x-1/2 rounded-full blur-[110px] sm:size-[420px]"
          style={{ background: "var(--mkt-glow)" }}
        />
        <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="pt-0 lg:pt-2">
            <p className="mkt-chip">
              <Sparkles size={14} /> Let&apos;s talk
            </p>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2.4rem,8vw,3.75rem)] tracking-[-0.055em] text-[color:var(--mkt-fg)] sm:mt-7">
              Ready to make work <span className="mkt-gradient-text">flow?</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[color:var(--mkt-muted)] sm:mt-6 sm:text-lg sm:leading-8">
              Tell us where operations get stuck. We&apos;ll show how a governed
              AI workforce can help—without losing control.
            </p>

            <div className="mt-8 space-y-5 sm:mt-12">
              <ContactPoint
                Icon={MessageSquareText}
                title="See the product in context"
                text="We’ll tailor a walkthrough around your workflows, teams, and systems."
              />
              <ContactPoint
                Icon={Mail}
                title="Use the form"
                text="Messages stay in this demo — nothing is sent to an external inbox."
              />
              <ContactPoint
                Icon={Clock3}
                title="Typical response"
                text="In a real rollout, teams reply within one business day."
              />
              <ContactPoint
                Icon={MapPin}
                title="Runs for any business"
                text="Self-contained deployment — no third-party SaaS required."
              />
            </div>
          </div>

          <LiquidGlass className="rounded-[1.5rem] p-5 sm:rounded-[1.75rem] sm:p-8">
            {submitted ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center text-center sm:min-h-[420px]">
                <CheckCircle2 className="size-12 text-[color:var(--mkt-accent)]" />
                <h2 className="mt-5 text-2xl font-semibold text-[color:var(--mkt-fg)]">
                  Thanks for reaching out.
                </h2>
                <p className="mt-3 max-w-sm leading-7 text-[color:var(--mkt-muted)]">
                  This demo form is complete. In a production rollout, our team
                  would follow up with next steps shortly.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-7 text-sm font-medium text-[color:var(--mkt-accent)]"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2 className="text-xl font-semibold text-[color:var(--mkt-fg)]">
                  Tell us about your company
                </h2>
                <p className="mt-2 text-sm text-[color:var(--mkt-muted)]">
                  We&apos;ll get back to you within one business day.
                </p>

                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <Field label="First name" name="firstName" />
                  <Field label="Work email" name="email" type="email" />
                </div>
                <div className="mt-5">
                  <Field label="Company name" name="company" />
                </div>
                <div className="mt-5">
                  <label className="block text-sm font-medium text-[color:var(--mkt-fg)]">
                    Team size
                    <select
                      name="size"
                      required
                      defaultValue=""
                      className="mkt-input mt-2 h-11"
                    >
                      <option value="" disabled>
                        Select a range
                      </option>
                      <option>1–20</option>
                      <option>21–100</option>
                      <option>101–500</option>
                      <option>500+</option>
                    </select>
                  </label>
                </div>
                <label className="mt-5 block text-sm font-medium text-[color:var(--mkt-fg)]">
                  What would you like to improve?
                  <textarea
                    required
                    name="message"
                    rows={5}
                    placeholder="e.g. We want to automate onboarding while keeping approvals in place…"
                    className="mkt-input mt-2 resize-none py-3"
                  />
                </label>
                <button type="submit" className="mkt-btn-primary mt-6 w-full">
                  Request a demo
                </button>
                <p className="mt-4 text-center text-xs text-[color:var(--mkt-subtle)]">
                  Demo form — no data is submitted.
                </p>
              </form>
            )}
          </LiquidGlass>
        </div>
      </section>
    </MarketingShell>
  );
}

function ContactPoint({
  Icon,
  title,
  text,
}: {
  Icon: typeof Mail;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4">
      <span className="mkt-icon-well size-10 shrink-0 !rounded-xl">
        <Icon size={19} />
      </span>
      <div>
        <p className="font-medium text-[color:var(--mkt-fg)]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[color:var(--mkt-muted)]">
          {text}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
}: {
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-[color:var(--mkt-fg)]">
      {label}
      <input required name={name} type={type} className="mkt-input mt-2 h-11" />
    </label>
  );
}
