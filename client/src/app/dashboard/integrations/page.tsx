import Link from "next/link"
import {
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  MessagesSquare,
  Network,
  Scale,
  ShieldCheck,
  Workflow,
} from "lucide-react"

import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const modules = [
  {
    Icon: Building2,
    title: "Organization",
    href: "/dashboard/organization",
    text: "People, departments, and access — all stored inside CompanyOS.",
  },
  {
    Icon: ClipboardList,
    title: "Work Management",
    href: "/dashboard/work-management/projects",
    text: "Projects, issues, and boards with no third-party tracker required.",
  },
  {
    Icon: MessagesSquare,
    title: "Communications",
    href: "/dashboard/communications",
    text: "Native channels and inbox for humans and agents.",
  },
  {
    Icon: Bot,
    title: "AI Workforce",
    href: "/dashboard/ai-workforce",
    text: "Scoped agents that run against your internal company context.",
  },
  {
    Icon: Workflow,
    title: "Processes",
    href: "/dashboard/processes",
    text: "Map and improve how work moves inside the business.",
  },
  {
    Icon: Scale,
    title: "Governance",
    href: "/dashboard/governance",
    text: "Autonomy, passports, and the Decision Firewall stay in-product.",
  },
  {
    Icon: ShieldCheck,
    title: "Approvals",
    href: "/dashboard/approvals",
    text: "Human review queues without wiring an external workflow tool.",
  },
  {
    Icon: Network,
    title: "Company Brain",
    href: "/dashboard/company-brain",
    text: "Shared operational knowledge kept inside your tenant.",
  },
] as const

export default function SelfContainedPage() {
  return (
    <>
      <DashboardHeader title="Platform modules" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Self-contained by design</CardTitle>
              <Badge variant="secondary">No external connections</Badge>
            </div>
            <CardDescription className="max-w-3xl text-base leading-7">
              CompanyOS is built for different businesses as a closed operating
              layer. Core work—organization, projects, communications, agents,
              governance, and analytics—runs inside the product. Nothing here
              requires OAuth, SaaS sync, or third-party tool connections.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "No Google, Microsoft, Slack, Jira, or CRM connectors",
                "Demo data stays in the browser — no outbound sync",
                "Agents act on internal modules and company context",
                "Each business can run the same product without external deps",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map(({ Icon, title, href, text }) => (
            <Link key={title} href={href} className="group">
              <Card className="h-full transition group-hover:border-foreground/20">
                <CardHeader className="gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-muted">
                    <Icon className="size-5" />
                  </span>
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
