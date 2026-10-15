import {
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  LayoutDashboard,
  MessagesSquare,
  Sparkles,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react"

export type NavChild = { title: string; href: string }

export type NavItem = {
  title: string
  href: string
  icon: React.ComponentType
  badge?: string
  items?: NavChild[]
  /** Always visible to everyone; not controllable per department. */
  locked?: boolean
}

export type NavGroup = { label: string; items: NavItem[] }

/**
 * Single source of truth for the sidebar. The department access matrix is
 * generated from this list, so new items automatically become controllable.
 * Access is keyed by `href`.
 */
export const navGroups: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { title: "Overview", href: "/dashboard", icon: LayoutDashboard, locked: true },
      {
        title: "My workspace",
        href: "/dashboard/me",
        icon: UserRound,
        locked: true,
      },
      {
        title: "Organization",
        href: "/dashboard/organization",
        icon: Building2,
        items: [
          { title: "People", href: "/dashboard/organization/people" },
          { title: "Departments & access", href: "/dashboard/organization/access" },
        ],
      },
      {
        title: "Documents",
        href: "/dashboard/documents",
        icon: FileText,
        items: [
          { title: "Vault", href: "/dashboard/documents" },
          { title: "Audit log", href: "/dashboard/audit" },
        ],
      },
      {
        title: "Clients",
        href: "/dashboard/clients",
        icon: BriefcaseBusiness,
        items: [
          { title: "All clients", href: "/dashboard/clients/list" },
          { title: "Active pipeline", href: "/dashboard/clients/pipeline" },
          { title: "Contracts", href: "/dashboard/clients/contracts" },
        ],
      },
      {
        title: "Work Management",
        href: "/dashboard/work-management",
        icon: ClipboardList,
        items: [
          { title: "My work", href: "/dashboard/work-management/my-work" },
          { title: "Issues", href: "/dashboard/work-management/issues" },
          { title: "Projects", href: "/dashboard/work-management/projects" },
          { title: "Time", href: "/dashboard/work-management/time" },
          { title: "AI copilot", href: "/dashboard/work-management/copilot" },
        ],
      },
      {
        title: "Communications",
        href: "/dashboard/communications",
        icon: MessagesSquare,
        items: [
          { title: "Channels", href: "/dashboard/communications/channels" },
          { title: "Inbox", href: "/dashboard/communications/inbox" },
        ],
      },
      {
        title: "People Operations",
        href: "/dashboard/people-operations",
        icon: UsersRound,
        items: [
          { title: "Hiring", href: "/dashboard/people-operations/hiring" },
          { title: "Offers", href: "/dashboard/people-operations/offers" },
          { title: "Onboarding", href: "/dashboard/people-operations/onboarding" },
          { title: "Offboarding", href: "/dashboard/people-operations/offboarding" },
          { title: "Leave & requests", href: "/dashboard/people-operations/leave" },
          { title: "Performance", href: "/dashboard/people-operations/performance" },
        ],
      },
      {
        title: "Finance",
        href: "/dashboard/finance",
        icon: Wallet,
        items: [{ title: "Invoices", href: "/dashboard/finance/invoices" }],
      },
      {
        title: "AI & automation",
        href: "/dashboard/ai-automation",
        icon: Sparkles,
        items: [
          { title: "Approvals", href: "/dashboard/approvals" },
          { title: "AI Workforce", href: "/dashboard/ai-workforce" },
          { title: "Governance", href: "/dashboard/governance" },
          { title: "Company Brain", href: "/dashboard/company-brain" },
          { title: "Log classification", href: "/dashboard/ai-automation/log-classification" },
          { title: "Processes", href: "/dashboard/processes" },
          { title: "MCP tools", href: "/dashboard/ai-automation/mcp" },
        ],
      },
      {
        title: "Analytics",
        href: "/dashboard/analytics",
        icon: Gauge,
        items: [
          { title: "Overview", href: "/dashboard/analytics" },
          { title: "Hiring funnel", href: "/dashboard/analytics/hiring" },
          { title: "Delivery", href: "/dashboard/analytics/delivery" },
          { title: "Utilization", href: "/dashboard/analytics/utilization" },
        ],
      },
      {
        title: "Subscription",
        href: "/dashboard/subscription",
        icon: CreditCard,
        items: [
          { title: "Plan & usage", href: "/dashboard/subscription" },
          { title: "Billing history", href: "/dashboard/subscription/billing" },
        ],
      },
    ],
  },
]

/** Routes outside the sidebar that everyone may open. */
export const alwaysAllowedRoutes = [
  "/dashboard",
  "/dashboard/settings",
  "/dashboard/me",
  "/dashboard/audit",
]

export const navItems = navGroups.flatMap((group) => group.items)

/** Every controllable href: sections and their sub-items. */
export const controllableHrefs = navItems
  .filter((item) => !item.locked)
  .flatMap((item) => [item.href, ...(item.items ?? []).map((child) => child.href)])

/**
 * The most specific nav href that owns a pathname, e.g.
 * /dashboard/work-management/projects/x → /dashboard/work-management/projects.
 */
export function navHrefForPath(pathname: string) {
  let best = ""
  for (const href of controllableHrefs) {
    if ((pathname === href || pathname.startsWith(`${href}/`)) && href.length > best.length) {
      best = href
    }
  }
  return best || null
}

/** Sections + all their sub-items, for granting a whole section at once. */
export function sectionHrefs(href: string) {
  const item = navItems.find((entry) => entry.href === href)
  return item ? [item.href, ...(item.items ?? []).map((child) => child.href)] : [href]
}

/**
 * Pure access toggle used by the store and the edit-access modal:
 * sections cascade to their sub-items; a sub-item pulls in its section;
 * removing a section's last sub-item removes the section.
 */
export function applyAccessChange(granted: string[], href: string, allowed: boolean) {
  const section = navItems.find(
    (item) => item.href === href || item.items?.some((child) => child.href === href)
  )
  if (!section || section.locked) return granted
  const next = new Set(granted)
  if (href === section.href) {
    for (const item of sectionHrefs(section.href)) {
      if (allowed) next.add(item)
      else next.delete(item)
    }
  } else if (allowed) {
    next.add(href)
    next.add(section.href)
  } else {
    next.delete(href)
    if (!section.items?.some((child) => next.has(child.href))) next.delete(section.href)
  }
  return Array.from(next)
}
