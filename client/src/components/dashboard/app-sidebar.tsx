"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronRight, LogOut, Settings } from "lucide-react"

import { useAuth } from "@/components/auth/auth-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useAgencyProfile } from "@/components/dashboard/agency-store"
import { useApprovals } from "@/components/dashboard/approvals-store"
import { useOrganization } from "@/components/dashboard/organization-store"
import { agencyInitials } from "@/lib/agency"
import { navGroups, type NavItem } from "@/lib/navigation"
import { initials } from "@/lib/work-utils"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { canAccess, me } = useOrganization()
  const { me: authMe, logout } = useAuth()
  const agency = useAgencyProfile()
  const { mine: myApprovals } = useApprovals()
  const displayName = authMe?.full_name || me?.name || "Signed in"
  const displayMeta = me?.accessRole ?? authMe?.primary_role ?? "Member"

  function handleLogout() {
    logout()
    router.push("/login")
  }
  // Live counts shown as sidebar badges (Approvals live under AI & automation).
  const badges: Record<string, number> = {
    "/dashboard/approvals": myApprovals.length,
    "/dashboard/ai-automation": myApprovals.length,
  }

  // Hide what the user's department can't open; drop sections left with no sub-items.
  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => canAccess(item.href))
        .map((item): NavItem => ({
          ...item,
          badge: badges[item.href] ? String(badges[item.href]) : item.badge,
          items: item.items?.filter((child) => canAccess(child.href)),
        }))
        .filter((item) => !item.items || item.items.length > 0),
    }))
    .filter((group) => group.items.length > 0)

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // Sub-items stay highlighted on nested routes (e.g. a project page under Projects).
  function isSubActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
                {agency.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agency.logoDataUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-[11px] font-semibold">{agencyInitials(agency.name)}</span>
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{agency.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {agency.workspaceLabel || agency.industry}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) =>
                  item.items ? (
                    <Collapsible
                      key={item.href}
                      defaultOpen={isActive(item.href)}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          isActive={isActive(item.href)}
                          tooltip={item.title}
                          render={<CollapsibleTrigger />}
                        >
                          <item.icon />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
                        </SidebarMenuButton>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.href}>
                                <SidebarMenuSubButton
                                  isActive={isSubActive(subItem.href)}
                                  render={<Link href={subItem.href} />}
                                >
                                  <span>{subItem.title}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  ) : (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(item.href)}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {item.badge ? (
                        <SidebarMenuBadge>
                          <Badge variant="secondary">{item.badge}</Badge>
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  )
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive("/dashboard/settings")}
              tooltip="Settings"
              render={<Link href="/dashboard/settings" />}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <Avatar size="sm">
                <AvatarFallback>{initials(displayName)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{displayMeta}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Log out" onClick={handleLogout}>
              <LogOut />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
