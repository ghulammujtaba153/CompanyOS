import type { Metadata } from "next"
import { RequireAuth } from "@/components/auth/require-auth"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AccessGuard } from "@/components/dashboard/access-guard"
import { ApprovalsProvider } from "@/components/dashboard/approvals-store"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { ClientsProvider } from "@/components/dashboard/clients-store"
import { GovernanceProvider } from "@/components/dashboard/governance-store"
import { AgencyProvider } from "@/components/dashboard/agency-store"
import { NotificationsProvider } from "@/components/dashboard/notifications-store"
import { OrganizationProvider } from "@/components/dashboard/organization-store"
import { ProcessesProvider } from "@/components/dashboard/processes-store"
import { ProjectWorkspaceProvider } from "@/components/dashboard/project-workspace"

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · CompanyOS Dashboard",
  },
  description:
    "CompanyOS dashboard—manage organization, clients, projects, AI workforce, governance, communications, and analytics.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RequireAuth>
      <TooltipProvider>
        <OrganizationProvider>
          <AgencyProvider>
            <NotificationsProvider>
              <GovernanceProvider>
                <ApprovalsProvider>
                  <ProcessesProvider>
                    <ProjectWorkspaceProvider>
                      <ClientsProvider>
                        <SidebarProvider className="min-w-0 overflow-x-hidden">
                          <AppSidebar />
                          <SidebarInset className="min-w-0 overflow-x-hidden">
                            <AccessGuard>{children}</AccessGuard>
                          </SidebarInset>
                        </SidebarProvider>
                      </ClientsProvider>
                    </ProjectWorkspaceProvider>
                  </ProcessesProvider>
                </ApprovalsProvider>
              </GovernanceProvider>
            </NotificationsProvider>
          </AgencyProvider>
        </OrganizationProvider>
      </TooltipProvider>
    </RequireAuth>
  )
}
